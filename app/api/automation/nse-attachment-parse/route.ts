import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { inflateSync } from "fflate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 30;
const MAX_ZIP_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_PDFS_PER_ATTACHMENT = 5;
const BATCH_SIZE = 5;
const DOWNLOAD_TIMEOUT_MS = 15000;

type PdfResult = {
  text?: string;
  numpages?: number;
};

type EvidenceRow = {
  id: string;
  queue_id: string | null;
  source_name: string;
  source_url: string;
  evidence_type: string;
  field_name: string | null;
  field_value: string | null;
  issuer_name: string | null;
  metadata: Record<string, unknown> | null;
};

type ParsedPdfFile = {
  name: string;
  data: Buffer;
};

const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  data: Buffer
) => Promise<PdfResult>;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(limited|ltd|private|pvt|public|company|co)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getFileName(url: string) {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(
      pathname.split("/").pop() || "attachment"
    );
  } catch {
    return "attachment";
  }
}

function classifySample(sample: string): string | null {
  if (/basis of allotment|basis-of-allotment/.test(sample)) {
    return "basis_of_allotment";
  }

  if (/price band|price-band|price range/.test(sample)) {
    return "price_band_advertisement";
  }

  if (
    /pre.?filing|pre.?filed/.test(sample) &&
    /advertisement|public issue/.test(sample)
  ) {
    return "pre_filing_advertisement";
  }

  if (
    /\bdrhp\b|draft red herring prospectus/.test(sample)
  ) {
    return "drhp";
  }

  if (
    /\brhp\b|red herring prospectus/.test(sample)
  ) {
    return "rhp";
  }

  if (/corrigendum|addendum/.test(sample)) {
    return "addendum_corrigendum";
  }

  if (/public announcement/.test(sample)) {
    return "public_announcement";
  }

  if (
    /advertisement|public issue|issue opening|issue closing/.test(
      sample
    )
  ) {
    return "issue_advertisement";
  }

  return null;
}

function classifyDocument(
  text: string,
  fieldName: string | null,
  fileName: string
) {
  // First preference: actual PDF contents.
  const contentSample = text.slice(0, 30000).toLowerCase();

  const contentClassification = classifySample(contentSample);

  if (contentClassification) {
    return {
      document_type: contentClassification,
      classification_basis: "pdf_content",
    };
  }

  // Fallback: NSE CSV attachment category and filename.
  const metadataSample =
    `${fieldName || ""} ${fileName}`.toLowerCase();

  const metadataClassification = classifySample(metadataSample);

  if (metadataClassification) {
    return {
      document_type: metadataClassification,
      classification_basis: "attachment_metadata",
    };
  }

  return {
    document_type: "other",
    classification_basis: "unclassified",
  };
}

function extractDateCandidates(text: string) {
  const patterns = [
    /\b(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}\b/g,
    /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/g,
  ];

  const found = new Set<string>();

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      found.add(match[0]);

      if (found.size >= 20) {
        return [...found];
      }
    }
  }

  return [...found];
}

async function readResponseWithLimit(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  if (!response.body) {
    throw new Error("NSE response has no readable body.");
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      if (!value) continue;

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(
          "Attachment exceeds the download size limit."
        );
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw new Error("Downloaded attachment is empty.");
  }

  return Buffer.concat(chunks, totalBytes);
}

async function downloadNseFile(
  initialUrl: string
): Promise<Buffer> {
  let currentUrl = new URL(initialUrl);

  if (
    currentUrl.protocol !== "https:" ||
    currentUrl.hostname !== "nsearchives.nseindia.com" ||
    currentUrl.username ||
    currentUrl.password ||
    currentUrl.port
  ) {
    throw new Error(
      "Attachment URL is not an allowed NSE archive URL."
    );
  }

  for (
    let redirectCount = 0;
    redirectCount <= 3;
    redirectCount++
  ) {
    const response = await fetch(currentUrl.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: {
        Accept:
          "application/pdf, application/zip, application/octet-stream",
        "User-Agent": "Capital360IPO-Document-Parser/1.0",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");

      if (!location || redirectCount === 3) {
        throw new Error(
          "Attachment redirect could not be followed safely."
        );
      }

      const nextUrl = new URL(location, currentUrl);

      if (
        nextUrl.protocol !== "https:" ||
        nextUrl.hostname !== "nsearchives.nseindia.com" ||
        nextUrl.username ||
        nextUrl.password ||
        nextUrl.port
      ) {
        throw new Error(
          "NSE attachment redirected outside the allowed host."
        );
      }

      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `NSE download failed with HTTP ${response.status}.`
      );
    }

    const contentLengthHeader =
      response.headers.get("content-length");

    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);

      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_DOWNLOAD_BYTES
      ) {
        await response.body?.cancel();

        throw new Error(
          "Attachment exceeds the download size limit."
        );
      }
    }

    return readResponseWithLimit(
      response,
      MAX_DOWNLOAD_BYTES
    );
  }

  throw new Error("Maximum redirect limit reached.");
}

function extractPdfsFromZip(
  zipBuffer: Buffer
): ParsedPdfFile[] {
  const EOCD = 0x06054b50;
  const CENTRAL = 0x02014b50;
  const LOCAL = 0x04034b50;

  if (zipBuffer.length < 22) {
    throw new Error("Invalid ZIP: file is too small.");
  }

  const searchStart = Math.max(
    0,
    zipBuffer.length - 65557
  );

  let eocdOffset = -1;

  for (
    let i = zipBuffer.length - 22;
    i >= searchStart;
    i--
  ) {
    if (zipBuffer.readUInt32LE(i) === EOCD) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error(
      "Invalid ZIP: end-of-directory record not found."
    );
  }

  const diskNumber = zipBuffer.readUInt16LE(
    eocdOffset + 4
  );

  const centralDisk = zipBuffer.readUInt16LE(
    eocdOffset + 6
  );

  const entriesOnDisk = zipBuffer.readUInt16LE(
    eocdOffset + 8
  );

  const entryCount = zipBuffer.readUInt16LE(
    eocdOffset + 10
  );

  const centralSize = zipBuffer.readUInt32LE(
    eocdOffset + 12
  );

  const centralOffset = zipBuffer.readUInt32LE(
    eocdOffset + 16
  );

  const commentLength = zipBuffer.readUInt16LE(
    eocdOffset + 20
  );

  if (
    eocdOffset + 22 + commentLength > zipBuffer.length ||
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0 ||
    entryCount > MAX_ZIP_ENTRIES ||
    centralOffset + centralSize > eocdOffset
  ) {
    throw new Error(
      "ZIP structure or entry count is not allowed."
    );
  }

  const pdfs: ParsedPdfFile[] = [];

  let cursor = centralOffset;
  let totalUncompressed = 0;

  for (let i = 0; i < entryCount; i++) {
    if (
      cursor + 46 > centralOffset + centralSize ||
      cursor + 46 > zipBuffer.length ||
      zipBuffer.readUInt32LE(cursor) !== CENTRAL
    ) {
      throw new Error("Invalid ZIP central directory.");
    }

    const flags = zipBuffer.readUInt16LE(cursor + 8);
    const method = zipBuffer.readUInt16LE(cursor + 10);

    const compressedSize = zipBuffer.readUInt32LE(
      cursor + 20
    );

    const uncompressedSize = zipBuffer.readUInt32LE(
      cursor + 24
    );

    const nameLength = zipBuffer.readUInt16LE(
      cursor + 28
    );

    const extraLength = zipBuffer.readUInt16LE(
      cursor + 30
    );

    const entryCommentLength = zipBuffer.readUInt16LE(
      cursor + 32
    );

    const localOffset = zipBuffer.readUInt32LE(
      cursor + 42
    );

    const nameStart = cursor + 46;

    const nextCursor =
      nameStart +
      nameLength +
      extraLength +
      entryCommentLength;

    if (
      nextCursor > centralOffset + centralSize ||
      nextCursor > zipBuffer.length
    ) {
      throw new Error(
        "Invalid ZIP directory entry boundaries."
      );
    }

    const entryName = zipBuffer
      .subarray(nameStart, nameStart + nameLength)
      .toString("utf8");

    cursor = nextCursor;

    if (entryName.endsWith("/")) {
      continue;
    }

    // Count declared uncompressed size for all entries.
    totalUncompressed += uncompressedSize;

    if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) {
      throw new Error(
        "ZIP total uncompressed size exceeds the safety limit."
      );
    }

    // Only PDF entries are eligible for decompression.
    if (!entryName.toLowerCase().endsWith(".pdf")) {
      continue;
    }

    if (
      (flags & 1) !== 0 ||
      (method !== 0 && method !== 8) ||
      uncompressedSize === 0 ||
      uncompressedSize > MAX_PDF_BYTES ||
      compressedSize > MAX_DOWNLOAD_BYTES ||
      compressedSize === 0 ||
      uncompressedSize / compressedSize > 100
    ) {
      continue;
    }

    if (
      method === 0 &&
      compressedSize !== uncompressedSize
    ) {
      continue;
    }

    if (
      localOffset + 30 > zipBuffer.length ||
      zipBuffer.readUInt32LE(localOffset) !== LOCAL
    ) {
      continue;
    }

    const localFlags = zipBuffer.readUInt16LE(
      localOffset + 6
    );

    const localMethod = zipBuffer.readUInt16LE(
      localOffset + 8
    );

    const localNameLength = zipBuffer.readUInt16LE(
      localOffset + 26
    );

    const localExtraLength = zipBuffer.readUInt16LE(
      localOffset + 28
    );

    const dataStart =
      localOffset +
      30 +
      localNameLength +
      localExtraLength;

    const dataEnd = dataStart + compressedSize;

    if (
      localFlags !== flags ||
      localMethod !== method ||
      dataStart > zipBuffer.length ||
      dataEnd > zipBuffer.length
    ) {
      continue;
    }

    const localName = zipBuffer
      .subarray(
        localOffset + 30,
        localOffset + 30 + localNameLength
      )
      .toString("utf8");

    if (localName !== entryName) {
      continue;
    }

    const compressedData = zipBuffer.subarray(
      dataStart,
      dataEnd
    );

    let output: Uint8Array;

    try {
      output =
        method === 0
          ? new Uint8Array(compressedData)
          : inflateSync(
              new Uint8Array(compressedData),
              {
                out: new Uint8Array(uncompressedSize),
              }
            );
    } catch {
      continue;
    }

    if (
      output.length !== uncompressedSize ||
      output.length > MAX_PDF_BYTES
    ) {
      continue;
    }

    const pdfBuffer = Buffer.from(output);

    if (
      pdfBuffer.subarray(0, 5).toString("ascii") !==
      "%PDF-"
    ) {
      continue;
    }

    pdfs.push({
      name: entryName,
      data: pdfBuffer,
    });

    if (pdfs.length >= MAX_PDFS_PER_ATTACHMENT) {
      break;
    }
  }

  return pdfs;
}

async function parsePdf(buffer: Buffer) {
  if (
    buffer.length > MAX_PDF_BYTES ||
    buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    throw new Error(
      "File is not a valid PDF or exceeds the PDF size limit."
    );
  }

  const parsed = await pdfParse(buffer);

  return {
    text: (parsed.text || "")
      .replace(/\u0000/g, " ")
      .slice(0, 120000),
    page_count: parsed.numpages || null,
  };
}

async function processAttachment(row: EvidenceRow) {
  if (
    !row.source_url ||
    typeof row.source_url !== "string"
  ) {
    throw new Error("Attachment source URL is missing.");
  }

  const fileName = getFileName(row.source_url);

  const downloaded = await downloadNseFile(
    row.source_url
  );

  let pdfFiles: ParsedPdfFile[] = [];

  if (
    downloaded.subarray(0, 5).toString("ascii") ===
    "%PDF-"
  ) {
    pdfFiles = [
      {
        name: fileName,
        data: downloaded,
      },
    ];
  } else if (
    downloaded.subarray(0, 2).toString("ascii") === "PK"
  ) {
    pdfFiles = extractPdfsFromZip(downloaded);
  } else {
    throw new Error(
      "Downloaded attachment is neither a PDF nor a supported ZIP."
    );
  }

  if (pdfFiles.length === 0) {
    throw new Error(
      "No readable PDF was found in this attachment."
    );
  }

  const queueResult = row.queue_id
    ? await supabaseAdmin
        .from("ipo_import_queue")
        .select("company_name")
        .eq("id", row.queue_id)
        .maybeSingle()
    : {
        data: null,
        error: null,
      };

  if (queueResult.error) {
    throw new Error(
      "Could not load the related IPO queue record."
    );
  }

  const expectedCompany =
    queueResult.data?.company_name ||
    row.issuer_name ||
    "";

  const documents = [];

  for (const pdf of pdfFiles) {
    const parsed = await parsePdf(pdf.data);
    const text = parsed.text;

    const classification = classifyDocument(
      text,
      row.field_name,
      pdf.name
    );

    const dates = extractDateCandidates(text);

    const normalizedExpected =
      normalizeName(expectedCompany);

    const normalizedText = normalizeName(
      text.slice(0, 30000)
    );

    const issuerMatch = !normalizedExpected
      ? "not_checked"
      : normalizedText.includes(normalizedExpected)
        ? "exact"
        : "not_found";

    documents.push({
      file_name: pdf.name,

      document_type:
        classification.document_type,

      classification_basis:
        classification.classification_basis,

      page_count: parsed.page_count,

      page_text_length: text.length,

      extracted_date_candidates: dates,

      expected_company_name:
        expectedCompany || null,

      issuer_match: issuerMatch,

      text_preview: text.slice(0, 1800),
    });
  }

  return {
    status: "completed",

    processed_at: new Date().toISOString(),

    original_file_name: fileName,

    pdf_count: documents.length,

    documents,

    notice:
      "Machine extraction only. Document contents, issuer identity and extracted dates remain unverified.",
  };
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (
      !origin ||
      !host ||
      new URL(origin).host !== host
    ) {
      return json(
        {
          success: false,
          error: "Invalid request origin.",
        },
        403
      );
    }

    const supabase =
      await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return json(
        {
          success: false,
          error: "Authentication required.",
        },
        401
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      !["owner", "admin"].includes(profile.role)
    ) {
      return json(
        {
          success: false,
          error: "Owner or admin permission required.",
        },
        403
      );
    }

    const {
      data: rows,
      error: fetchError,
    } = await supabaseAdmin
      .from("ipo_source_evidence")
      .select(
        "id, queue_id, source_name, source_url, evidence_type, field_name, field_value, issuer_name, metadata"
      )
      .eq("source_name", "NSE")
      .eq("evidence_type", "nse_attachment")
      .eq("validation_status", "unverified")
      .order("observed_at", {
        ascending: true,
      })
      .limit(100);

    if (fetchError) {
      throw new Error(
        `Could not load attachment evidence: ${fetchError.message}`
      );
    }

    const pendingRows = (
      (rows || []) as EvidenceRow[]
    )
      .filter((row) => {
        if (row.metadata?.superseded === true) {
          return false;
        }

        const parseInfo = row.metadata
          ?.document_parse as
          | Record<string, unknown>
          | undefined;

        return parseInfo?.status !== "completed";
      })
      .slice(0, BATCH_SIZE);

    if (pendingRows.length === 0) {
      return json({
        success: true,
        message: "No pending NSE attachments found.",
        processed: 0,
        failed: 0,
        remaining_in_batch: 0,
      });
    }

    let processed = 0;
    let failed = 0;

    const results: {
      id: string;
      field_name: string | null;
      status: string;
      error?: string;
    }[] = [];

    for (const row of pendingRows) {
      const existingMetadata = row.metadata || {};

      try {
        const documentParse =
          await processAttachment(row);

        const {
          error: updateError,
        } = await supabaseAdmin
          .from("ipo_source_evidence")
          .update({
            metadata: {
              ...existingMetadata,
              document_parse: documentParse,
            },
          })
          .eq("id", row.id);

        if (updateError) {
          throw new Error(
            `Evidence update failed: ${updateError.message}`
          );
        }

        processed++;

        results.push({
          id: row.id,
          field_name: row.field_name,
          status: "completed",
        });
      } catch (error) {
        failed++;

        const message =
          error instanceof Error
            ? error.message
            : "Unknown parsing error";

        const {
          error: failureUpdateError,
        } = await supabaseAdmin
          .from("ipo_source_evidence")
          .update({
            metadata: {
              ...existingMetadata,
              document_parse: {
                status: "failed",

                processed_at:
                  new Date().toISOString(),

                error: message.slice(0, 500),

                notice:
                  "Evidence remains unverified.",
              },
            },
          })
          .eq("id", row.id);

        results.push({
          id: row.id,
          field_name: row.field_name,
          status: "failed",
          error: failureUpdateError
            ? `${message}; failure status could not be saved.`
            : message,
        });
      }
    }

    const logStatus =
      failed === 0
        ? "success"
        : processed > 0
          ? "partial"
          : "failed";

    const {
      error: logError,
    } = await supabaseAdmin
      .from("automation_logs")
      .insert({
        task_name: "nse_attachment_parse",
        status: logStatus,
        message:
          `Processed: ${processed}, failed: ${failed}, batch size: ${pendingRows.length}.`,
      });

    if (logError) {
      console.error(
        "NSE attachment parse log failed:",
        logError.message
      );
    }

    return json({
      success: failed === 0,

      processed,

      failed,

      batch_size: pendingRows.length,

      results,

      message:
        "Extraction finished. All evidence remains unverified until manual validation.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown server error";

    await supabaseAdmin
      .from("automation_logs")
      .insert({
        task_name: "nse_attachment_parse",
        status: "failed",
        message: message.slice(0, 500),
      });

    return json(
      {
        success: false,
        error: message,
      },
      500
    );
  }
}
