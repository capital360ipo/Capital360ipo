
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { inflateRawSync } from "fflate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 30;
const MAX_ZIP_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_PDFS_PER_ATTACHMENT = 5;
const BATCH_SIZE = 5;

type PdfResult = {
  text?: string;
  numpages?: number;
};

// Important: Load the library's actual parser file.
// Do not load the package root, because pdf-parse 1.1.1
// can execute its bundled test-file code during deployment.
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  data: Buffer
) => Promise<PdfResult>;

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

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
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
    return decodeURIComponent(pathname.split("/").pop() || "attachment");
  } catch {
    return "attachment";
  }
}

function classifyDocument(
  text: string,
  fieldName: string | null,
  fileName: string
) {
  const sample =
    `${fieldName || ""} ${fileName} ${text.slice(0, 30000)}`.toLowerCase();

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

  if (/\bdrhp\b|draft red herring prospectus/.test(sample)) {
    return "drhp";
  }

  if (/\brhp\b|red herring prospectus/.test(sample)) {
    return "rhp";
  }

  if (/corrigendum|addendum/.test(sample)) {
    return "addendum_corrigendum";
  }

  if (/public announcement/.test(sample)) {
    return "public_announcement";
  }

  if (/advertisement|public issue|issue opening|issue closing/.test(sample)) {
    return "issue_advertisement";
  }

  return "other";
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

async function downloadNseFile(initialUrl: string): Promise<Buffer> {
  let currentUrl = new URL(initialUrl);

  if (
    currentUrl.protocol !== "https:" ||
    currentUrl.hostname !== "nsearchives.nseindia.com" ||
    currentUrl.username ||
    currentUrl.password
  ) {
    throw new Error("Attachment URL is not an allowed NSE archive URL.");
  }

  for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
    const response = await fetch(currentUrl.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/pdf, application/zip, application/octet-stream",
        "User-Agent": "Capital360IPO-Document-Parser/1.0",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");

      if (!location || redirectCount === 3) {
        throw new Error("Attachment redirect could not be followed safely.");
      }

      const nextUrl = new URL(location, currentUrl);

      if (
        nextUrl.protocol !== "https:" ||
        nextUrl.hostname !== "nsearchives.nseindia.com" ||
        nextUrl.username ||
        nextUrl.password
      ) {
        throw new Error("NSE attachment redirected outside the allowed host.");
      }

      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok) {
      throw new Error(`NSE download failed with HTTP ${response.status}.`);
    }

    const contentLength = Number(
      response.headers.get("content-length") || 0
    );

    if (contentLength > MAX_DOWNLOAD_BYTES) {
      throw new Error("Attachment exceeds the download size limit.");
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.length === 0 || bytes.length > MAX_DOWNLOAD_BYTES) {
      throw new Error("Attachment is empty or exceeds the download size limit.");
    }

    return bytes;
  }

  throw new Error("Maximum redirect limit reached.");
}

function extractPdfsFromZip(zipBuffer: Buffer) {
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;

  const searchStart = Math.max(0, zipBuffer.length - 65557);
  let eocdOffset = -1;

  for (let i = zipBuffer.length - 22; i >= searchStart; i--) {
    if (zipBuffer.readUInt32LE(i) === eocdSignature) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error("Invalid ZIP: end-of-directory record not found.");
  }

  const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralSize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  if (
    entryCount > MAX_ZIP_ENTRIES ||
    entryCount === 0 ||
    centralOffset + centralSize > zipBuffer.length
  ) {
    throw new Error("ZIP entry count or directory size is not allowed.");
  }

  const pdfs: { name: string; data: Buffer }[] = [];
  let cursor = centralOffset;
  let totalUncompressed = 0;

  for (let i = 0; i < entryCount; i++) {
    if (
      cursor + 46 > zipBuffer.length ||
      zipBuffer.readUInt32LE(cursor) !== centralSignature
    ) {
      throw new Error("Invalid ZIP central directory.");
    }

    const flags = zipBuffer.readUInt16LE(cursor + 8);
    const method = zipBuffer.readUInt16LE(cursor + 10);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(cursor + 24);
    const nameLength = zipBuffer.readUInt16LE(cursor + 28);
    const extraLength = zipBuffer.readUInt16LE(cursor + 30);
    const commentLength = zipBuffer.readUInt16LE(cursor + 32);
    const localOffset = zipBuffer.readUInt32LE(cursor + 42);

    const nameStart = cursor + 46;

    const entryName = zipBuffer
      .subarray(nameStart, nameStart + nameLength)
      .toString("utf8");

    cursor += 46 + nameLength + extraLength + commentLength;

    if (entryName.endsWith("/")) {
      continue;
    }

    if (
      (flags & 1) !== 0 ||
      (method !== 0 && method !== 8) ||
      uncompressedSize > MAX_PDF_BYTES ||
      compressedSize > MAX_DOWNLOAD_BYTES ||
      (compressedSize > 0 && uncompressedSize / compressedSize > 100)
    ) {
      continue;
    }

    totalUncompressed += uncompressedSize;

    if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) {
      throw new Error("ZIP total uncompressed size exceeds the safety limit.");
    }

    if (
      localOffset + 30 > zipBuffer.length ||
      zipBuffer.readUInt32LE(localOffset) !== localSignature
    ) {
      continue;
    }

    const localNameLength = zipBuffer.readUInt16LE(localOffset + 26);
    const localExtraLength = zipBuffer.readUInt16LE(localOffset + 28);

    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > zipBuffer.length) {
      continue;
    }

    const compressedData = zipBuffer.subarray(dataStart, dataEnd);

    let output: Uint8Array;

    try {
      output =
        method === 0
          ? new Uint8Array(compressedData)
          : inflateRawSync(new Uint8Array(compressedData));
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
      entryName.toLowerCase().endsWith(".pdf") &&
      pdfBuffer.subarray(0, 5).toString("ascii") === "%PDF-"
    ) {
      pdfs.push({
        name: entryName,
        data: pdfBuffer,
      });

      if (pdfs.length >= MAX_PDFS_PER_ATTACHMENT) {
        break;
      }
    }
  }

  return pdfs;
}

async function parsePdf(buffer: Buffer) {
  if (
    buffer.length > MAX_PDF_BYTES ||
    buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    throw new Error("File is not a valid PDF or exceeds the PDF size limit.");
  }

  const parsed = await pdfParse(buffer);

  return (parsed.text || "")
    .replace(/\u0000/g, " ")
    .slice(0, 120000);
}

async function processAttachment(row: EvidenceRow) {
  const fileName = getFileName(row.source_url);
  const downloaded = await downloadNseFile(row.source_url);

  let pdfFiles: { name: string; data: Buffer }[] = [];

  if (downloaded.subarray(0, 5).toString("ascii") === "%PDF-") {
    pdfFiles = [
      {
        name: fileName,
        data: downloaded,
      },
    ];
  } else if (downloaded.subarray(0, 2).toString("ascii") === "PK") {
    pdfFiles = extractPdfsFromZip(downloaded);
  } else {
    throw new Error("Downloaded attachment is neither a PDF nor a supported ZIP.");
  }

  if (pdfFiles.length === 0) {
    throw new Error("No readable PDF was found in this attachment.");
  }

  const queueResult = row.queue_id
    ? await supabaseAdmin
        .from("ipo_import_queue")
        .select("company_name")
        .eq("id", row.queue_id)
        .maybeSingle()
    : { data: null, error: null };

  if (queueResult.error) {
    throw new Error("Could not load the related IPO queue record.");
  }

  const expectedCompany =
    queueResult.data?.company_name || row.issuer_name || "";

  const documents = [];

  for (const pdf of pdfFiles) {
    const text = await parsePdf(pdf.data);

    const documentType = classifyDocument(
      text,
      row.field_name,
      pdf.name
    );

    const dates = extractDateCandidates(text);

    const normalizedExpected = normalizeName(expectedCompany);
    const normalizedText = normalizeName(text.slice(0, 30000));

    const issuerMatch = !normalizedExpected
      ? "not_checked"
      : normalizedText.includes(normalizedExpected)
        ? "exact"
        : "not_found";

    documents.push({
      file_name: pdf.name,
      document_type: documentType,
      page_text_length: text.length,
      extracted_date_candidates: dates,
      expected_company_name: expectedCompany || null,
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
      "Machine extraction only. Document contents and extracted fields remain unverified.",
  };
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (!origin || !host || new URL(origin).host !== host) {
      return json(
        { success: false, error: "Invalid request origin." },
        403
      );
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return json(
        { success: false, error: "Authentication required." },
        401
      );
    }

    const { data: profile, error: profileError } = await supabase
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
        { success: false, error: "Owner or admin permission required." },
        403
      );
    }

    const { data: rows, error: fetchError } = await supabaseAdmin
      .from("ipo_source_evidence")
      .select(
        "id, queue_id, source_name, source_url, evidence_type, field_name, field_value, issuer_name, metadata"
      )
      .eq("source_name", "NSE")
      .eq("evidence_type", "nse_attachment")
      .eq("validation_status", "unverified")
      .order("observed_at", { ascending: true })
      .limit(100);

    if (fetchError) {
      throw new Error(
        `Could not load attachment evidence: ${fetchError.message}`
      );
    }

    const pendingRows = ((rows || []) as EvidenceRow[])
      .filter((row) => {
        const parseInfo = row.metadata?.document_parse as
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
        remaining_in_batch: 0,
      });
    }

    let processed = 0;
    let failed = 0;

    const results: {
      id: string;
      status: string;
      error?: string;
    }[] = [];

    for (const row of pendingRows) {
      const existingMetadata = row.metadata || {};

      try {
        const documentParse = await processAttachment(row);

        const { error: updateError } = await supabaseAdmin
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
          status: "completed",
        });
      } catch (error) {
        failed++;

        const message =
          error instanceof Error
            ? error.message
            : "Unknown parsing error";

        await supabaseAdmin
          .from("ipo_source_evidence")
          .update({
            metadata: {
              ...existingMetadata,
              document_parse: {
                status: "failed",
                processed_at: new Date().toISOString(),
                error: message.slice(0, 500),
                notice: "Evidence remains unverified.",
              },
            },
          })
          .eq("id", row.id);

        results.push({
          id: row.id,
          status: "failed",
          error: message,
        });
      }
    }

    await supabaseAdmin.from("automation_logs").insert({
      task_name: "nse_attachment_parse",
      status:
        failed === 0
          ? "success"
          : processed > 0
            ? "partial"
            : "failed",
      message: `Processed: ${processed}, failed: ${failed}, batch size: ${pendingRows.length}.`,
    });

    return json({
      success: failed === 0,
      processed,
      failed,
      results,
      message:
        "Extraction finished. All evidence remains unverified until manual validation.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown server error";

    await supabaseAdmin.from("automation_logs").insert({
      task_name: "nse_attachment_parse",
      status: "failed",
      message: message.slice(0, 500),
    });

    return json(
      { success: false, error: message },
      500
    );
  }
}
