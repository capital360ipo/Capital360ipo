import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { inflateSync } from "fflate";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// pdf-parse v1.1.1: explicit type declaration for TypeScript
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  data: Buffer
) => Promise<{
  text?: string;
  numpages?: number;
}>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_HOST = "nsearchives.nseindia.com";

const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 30;
const MAX_ZIP_UNCOMPRESSED_BYTES = 15 * 1024 * 1024;
const MAX_PDFS_PER_ZIP = 5;
const BATCH_SIZE = 5;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

type Diagnostics = Record<string, unknown>;

class AttachmentError extends Error {
  diagnostics: Diagnostics;

  constructor(message: string, diagnostics: Diagnostics = {}) {
    super(message);
    this.name = "AttachmentError";
    this.diagnostics = diagnostics;
  }
}

type DownloadResult = {
  buffer: Buffer;
  diagnostics: Diagnostics;
};

type ParsedDocument = {
  document_type: string;
  extracted_date: string | null;
  issuer_name: string | null;
  identity_match_status: "matched" | "ambiguous" | "mismatch" | "unverified";
  page_count: number | null;
  text_excerpt: string;
};

function getSignature(buffer: Buffer): Diagnostics {
  const prefix = buffer.subarray(0, 16);

  return {
    signature_hex: prefix.toString("hex"),
    signature_ascii: prefix
      .toString("latin1")
      .replace(/[^\x20-\x7e]/g, "."),
  };
}

function validateNseUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new AttachmentError("Invalid attachment URL.");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== NSE_HOST ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new AttachmentError(
      "Attachment URL is not an allowed NSE archive URL."
    );
  }

  return url;
}

async function readResponseWithLimit(
  response: Response,
  finalUrl: string
): Promise<DownloadResult> {
  const contentType = response.headers.get("content-type");
  const contentLengthHeader = response.headers.get("content-length");
  const declaredLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : null;

  const baseDiagnostics: Diagnostics = {
    final_url: finalUrl,
    content_type: contentType,
    content_length_header: contentLengthHeader,
  };

  if (
    declaredLength !== null &&
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_DOWNLOAD_BYTES
  ) {
    await response.body?.cancel();

    throw new AttachmentError(
      "Attachment exceeds the download size limit.",
      {
        ...baseDiagnostics,
        declared_size_bytes: declaredLength,
        download_limit_bytes: MAX_DOWNLOAD_BYTES,
        observed_bytes: 0,
      }
    );
  }

  if (!response.body) {
    throw new AttachmentError(
      "Attachment response has no readable body.",
      baseDiagnostics
    );
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let prefix = Buffer.alloc(0);

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = Buffer.from(value);
      totalBytes += chunk.length;

      if (prefix.length < 16) {
        prefix = Buffer.concat([
          prefix,
          chunk.subarray(0, 16 - prefix.length),
        ]);
      }

      if (totalBytes > MAX_DOWNLOAD_BYTES) {
        await reader.cancel();

        throw new AttachmentError(
          "Attachment exceeds the download size limit.",
          {
            ...baseDiagnostics,
            observed_bytes: totalBytes,
            download_limit_bytes: MAX_DOWNLOAD_BYTES,
            ...getSignature(prefix),
          }
        );
      }

      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = Buffer.concat(chunks);

  return {
    buffer,
    diagnostics: {
      ...baseDiagnostics,
      downloaded_bytes: buffer.length,
      ...getSignature(buffer),
    },
  };
}

async function downloadNseFile(
  originalUrl: string
): Promise<DownloadResult> {
  let currentUrl = validateNseUrl(originalUrl);

  for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
    let response: Response;

    try {
      response = await fetch(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        headers: {
          Accept: "application/pdf, application/zip, application/octet-stream",
          "User-Agent": "Capital360IPO-DocumentParser/1.0",
        },
      });
    } catch (error) {
      throw new AttachmentError("NSE attachment download failed.", {
        url: currentUrl.toString(),
        reason: error instanceof Error ? error.message : "Network error",
      });
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();

      if (!location || redirectCount === 3) {
        throw new AttachmentError(
          "Invalid or excessive attachment redirects.",
          {
            http_status: response.status,
            redirect_count: redirectCount,
          }
        );
      }

      currentUrl = validateNseUrl(
        new URL(location, currentUrl).toString()
      );

      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();

      throw new AttachmentError(
        "NSE returned an unsuccessful response.",
        {
          http_status: response.status,
          content_type: response.headers.get("content-type"),
          content_length_header: response.headers.get("content-length"),
        }
      );
    }

    return readResponseWithLimit(response, currentUrl.toString());
  }

  throw new AttachmentError("Attachment redirect limit exceeded.");
}

function isPdf(buffer: Buffer): boolean {
  return (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  );
}

function isZip(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (
      (buffer[2] === 0x03 && buffer[3] === 0x04) ||
      (buffer[2] === 0x05 && buffer[3] === 0x06) ||
      (buffer[2] === 0x07 && buffer[3] === 0x08)
    )
  );
}

function extractPdfsFromZip(zip: Buffer): Buffer[] {
  if (zip.length > MAX_DOWNLOAD_BYTES) {
    throw new AttachmentError("ZIP exceeds the download size limit.", {
      zip_size_bytes: zip.length,
      download_limit_bytes: MAX_DOWNLOAD_BYTES,
    });
  }

  let eocdOffset = -1;
  const minimumOffset = Math.max(0, zip.length - 65_557);

  for (let i = zip.length - 22; i >= minimumOffset; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new AttachmentError("ZIP central directory was not found.");
  }

  const diskNumber = zip.readUInt16LE(eocdOffset + 4);
  const centralDisk = zip.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = zip.readUInt16LE(eocdOffset + 8);
  const totalEntries = zip.readUInt16LE(eocdOffset + 10);
  const centralSize = zip.readUInt32LE(eocdOffset + 12);
  const centralOffset = zip.readUInt32LE(eocdOffset + 16);

  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== totalEntries
  ) {
    throw new AttachmentError(
      "Multi-disk ZIP files are not supported."
    );
  }

  if (
    totalEntries > MAX_ZIP_ENTRIES ||
    centralOffset + centralSize > eocdOffset
  ) {
    throw new AttachmentError(
      "ZIP structure exceeds safety limits.",
      {
        zip_entries: totalEntries,
        max_entries: MAX_ZIP_ENTRIES,
        central_directory_size: centralSize,
      }
    );
  }

  const pdfs: Buffer[] = [];
  let cursor = centralOffset;
  let totalUncompressed = 0;

  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex++) {
    if (
      cursor + 46 > zip.length ||
      zip.readUInt32LE(cursor) !== 0x02014b50
    ) {
      throw new AttachmentError(
        "Invalid ZIP central directory entry."
      );
    }

    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const fileNameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localHeaderOffset = zip.readUInt32LE(cursor + 42);

    const entryEnd =
      cursor + 46 + fileNameLength + extraLength + commentLength;

    if (entryEnd > zip.length) {
      throw new AttachmentError(
        "ZIP entry exceeds file boundaries."
      );
    }

    const fileName = zip
      .subarray(cursor + 46, cursor + 46 + fileNameLength)
      .toString("utf8");

    cursor = entryEnd;

    if (!fileName.toLowerCase().endsWith(".pdf")) {
      continue;
    }

    if (pdfs.length >= MAX_PDFS_PER_ZIP) {
      throw new AttachmentError(
        "ZIP contains too many PDF files.",
        { max_pdfs: MAX_PDFS_PER_ZIP }
      );
    }

    if (
      uncompressedSize > MAX_PDF_BYTES ||
      compressedSize > MAX_DOWNLOAD_BYTES
    ) {
      throw new AttachmentError(
        "PDF inside ZIP exceeds the size limit.",
        {
          file_name: fileName,
          compressed_size_bytes: compressedSize,
          uncompressed_size_bytes: uncompressedSize,
        }
      );
    }

    totalUncompressed += uncompressedSize;

    if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new AttachmentError(
        "ZIP total uncompressed size exceeds the limit."
      );
    }

    if (
      compressedSize > 0 &&
      uncompressedSize / compressedSize > 100
    ) {
      throw new AttachmentError(
        "ZIP compression ratio exceeds the safety limit.",
        { file_name: fileName }
      );
    }

    if (method !== 0 && method !== 8) {
      throw new AttachmentError(
        "Unsupported ZIP compression method.",
        {
          file_name: fileName,
          compression_method: method,
        }
      );
    }

    if (
      localHeaderOffset + 30 > zip.length ||
      zip.readUInt32LE(localHeaderOffset) !== 0x04034b50
    ) {
      throw new AttachmentError(
        "Invalid ZIP local file header."
      );
    }

    const localNameLength = zip.readUInt16LE(
      localHeaderOffset + 26
    );
    const localExtraLength = zip.readUInt16LE(
      localHeaderOffset + 28
    );

    const dataOffset =
      localHeaderOffset + 30 + localNameLength + localExtraLength;

    const dataEnd = dataOffset + compressedSize;

    if (dataEnd > zip.length) {
      throw new AttachmentError(
        "ZIP compressed data exceeds file boundaries."
      );
    }

    const compressedData = zip.subarray(dataOffset, dataEnd);

    let pdfBuffer: Buffer;

    try {
      if (method === 0) {
        pdfBuffer = Buffer.from(compressedData);
      } else {
        const output = inflateSync(
          new Uint8Array(compressedData),
          { out: new Uint8Array(uncompressedSize) }
        );

        pdfBuffer = Buffer.from(output);
      }
    } catch {
      throw new AttachmentError(
        "Could not decompress PDF inside ZIP.",
        { file_name: fileName }
      );
    }

    if (
      pdfBuffer.length !== uncompressedSize ||
      !isPdf(pdfBuffer)
    ) {
      throw new AttachmentError(
        "ZIP entry is not a valid PDF.",
        {
          file_name: fileName,
          extracted_size_bytes: pdfBuffer.length,
          expected_size_bytes: uncompressedSize,
          ...getSignature(pdfBuffer),
        }
      );
    }

    pdfs.push(pdfBuffer);
  }

  return pdfs;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function classifyDocument(
  text: string,
  fallbackField: string
): string {
  const value = text.toLowerCase();

  if (
    /\budrhp\b|updated draft red herring prospectus/.test(value)
  ) {
    return "UDRHP";
  }

  if (/\brhp\b|red herring prospectus/.test(value)) {
    return "RHP";
  }

  if (/\bdrhp\b|draft red herring prospectus/.test(value)) {
    return "DRHP";
  }

  if (/basis of allotment|allotment status/.test(value)) {
    return "BASIS_OF_ALLOTMENT";
  }

  if (/price band|price-band|floor price|cap price/.test(value)) {
    return "PRICE_BAND";
  }

  if (/pre-?ipo placement|promoter group transaction/.test(value)) {
    return "PRE_IPO_TRANSACTION_DISCLOSURE";
  }

  if (
    /public announcement|initial public offer|initial public offering/.test(
      value
    )
  ) {
    return "IPO_PUBLIC_ANNOUNCEMENT";
  }

  if (/draft offer document/.test(value)) {
    return "DRAFT_OFFER_DOCUMENT";
  }

  return fallbackField || "UNCLASSIFIED";
}

function extractDocumentDate(text: string): string | null {
  const patterns = [
    /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/,
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i,
  ];

  const monthMap: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let day: string;
    let month: string;
    let year: string;

    if (/^\d/.test(match[1])) {
      day = match[1].padStart(2, "0");
      month = /^\d/.test(match[2])
        ? match[2].padStart(2, "0")
        : monthMap[match[2].toLowerCase()];
      year = match[3];
    } else {
      month = monthMap[match[1].toLowerCase()];
      day = match[2].padStart(2, "0");
      year = match[3];
    }

    const dayNumber = Number(day);
    const monthNumber = Number(month);

    if (
      dayNumber >= 1 &&
      dayNumber <= 31 &&
      monthNumber >= 1 &&
      monthNumber <= 12
    ) {
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

async function parsePdf(
  buffer: Buffer,
  expectedIssuer: string | null,
  fallbackField: string
): Promise<ParsedDocument> {
  if (buffer.length > MAX_PDF_BYTES) {
    throw new AttachmentError(
      "PDF exceeds the PDF size limit.",
      {
        pdf_size_bytes: buffer.length,
        pdf_limit_bytes: MAX_PDF_BYTES,
        ...getSignature(buffer),
      }
    );
  }

  if (!isPdf(buffer)) {
    throw new AttachmentError(
      "File is not a valid PDF.",
      {
        pdf_size_bytes: buffer.length,
        ...getSignature(buffer),
      }
    );
  }

  let parsed: {
    text?: string;
    numpages?: number;
  };

  try {
    parsed = await pdfParse(buffer);
  } catch (error) {
    throw new AttachmentError(
      "PDF text extraction failed.",
      {
        pdf_size_bytes: buffer.length,
        reason:
          error instanceof Error
            ? error.message
            : "PDF parser error",
      }
    );
  }

  const text = (parsed.text || "")
    .replace(/\s+/g, " ")
    .trim();

  const issuer = expectedIssuer?.trim() || null;

  let identityStatus: ParsedDocument["identity_match_status"] =
    "unverified";

  if (issuer && text) {
    const normalizedIssuer = normalizeText(issuer);
    const normalizedText = normalizeText(text);

    if (
      normalizedIssuer.length >= 5 &&
      normalizedText.includes(normalizedIssuer)
    ) {
      identityStatus = "matched";
    } else {
      identityStatus = "ambiguous";
    }
  }

  return {
    document_type: classifyDocument(text, fallbackField),
    extracted_date: extractDocumentDate(text),
    issuer_name: issuer,
    identity_match_status: identityStatus,
    page_count: parsed.numpages ?? null,
    text_excerpt: text.slice(0, 1200),
  };
}

async function processAttachment(
  url: string,
  expectedIssuer: string | null,
  fallbackField: string
): Promise<{
  documents: ParsedDocument[];
  diagnostics: Diagnostics;
}> {
  const downloaded = await downloadNseFile(url);
  const buffer = downloaded.buffer;

  const diagnostics: Diagnostics = {
    ...downloaded.diagnostics,
    detected_format: isPdf(buffer)
      ? "PDF"
      : isZip(buffer)
        ? "ZIP"
        : "UNKNOWN",
  };

  if (isPdf(buffer)) {
    try {
      const document = await parsePdf(
        buffer,
        expectedIssuer,
        fallbackField
      );

      return {
        documents: [document],
        diagnostics,
      };
    } catch (error) {
      if (error instanceof AttachmentError) {
        throw new AttachmentError(error.message, {
          ...diagnostics,
          ...error.diagnostics,
        });
      }

      throw error;
    }
  }

  if (isZip(buffer)) {
    let pdfs: Buffer[];

    try {
      pdfs = extractPdfsFromZip(buffer);
    } catch (error) {
      if (error instanceof AttachmentError) {
        throw new AttachmentError(error.message, {
          ...diagnostics,
          ...error.diagnostics,
        });
      }

      throw error;
    }

    if (pdfs.length === 0) {
      throw new AttachmentError(
        "ZIP contains no supported PDF documents.",
        diagnostics
      );
    }

    const documents: ParsedDocument[] = [];

    for (const pdf of pdfs) {
      documents.push(
        await parsePdf(pdf, expectedIssuer, fallbackField)
      );
    }

    return {
      documents,
      diagnostics: {
        ...diagnostics,
        extracted_pdf_count: pdfs.length,
      },
    };
  }

  throw new AttachmentError(
    "Downloaded file is neither a valid PDF nor ZIP.",
    {
      ...diagnostics,
      downloaded_bytes: buffer.length,
      ...getSignature(buffer),
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const requestHost = request.headers.get("host");

    if (origin && requestHost) {
      const originHost = new URL(origin).host;

      if (originHost !== requestHost) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid request origin.",
          },
          { status: 403 }
        );
      }
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required.",
        },
        { status: 401 }
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
      return NextResponse.json(
        {
          success: false,
          error: "Owner or admin permission required.",
        },
        { status: 403 }
      );
    }

    const { data: rows, error: queryError } = await supabaseAdmin
      .from("ipo_source_evidence")
      .select(
        "id, source_name, source_url, evidence_type, field_name, issuer_name, metadata, validation_status"
      )
      .eq("source_name", "NSE")
      .eq("evidence_type", "nse_attachment")
      .eq("validation_status", "unverified")
      .order("observed_at", { ascending: true })
      .limit(100);

    if (queryError) {
      throw new Error(
        `Evidence query failed: ${queryError.message}`
      );
    }

    const eligibleRows = (rows || []).filter((row: any) => {
      const metadata = row.metadata || {};
      const parseInfo = metadata.document_parse || {};

      return (
        metadata.superseded !== true &&
        parseInfo.status !== "completed" &&
        parseInfo.status !== "failed_permanent"
      );
    });

    const batch = eligibleRows.slice(0, BATCH_SIZE);

    let processed = 0;
    let failed = 0;
    const skipped = eligibleRows.length - batch.length;

    const results: Array<{
      id: string;
      status: string;
      message?: string;
    }> = [];

    for (const row of batch) {
      const metadata = row.metadata || {};
      const previousParse = metadata.document_parse || {};
      const previousAttempts = Number(
        previousParse.attempt_count || 0
      );

      try {
        if (!row.source_url) {
          throw new AttachmentError(
            "Attachment URL is missing."
          );
        }

        const parsed = await processAttachment(
          row.source_url,
          row.issuer_name || null,
          row.field_name || "unknown"
        );

        const newMetadata = {
          ...metadata,
          document_parse: {
            status: "completed",
            processed_at: new Date().toISOString(),
            attempt_count: previousAttempts + 1,
            documents: parsed.documents,
            diagnostics: parsed.diagnostics,
            notice:
              "Machine extraction only. Evidence remains unverified pending manual validation.",
          },
        };

        const { error: updateError } = await supabaseAdmin
          .from("ipo_source_evidence")
          .update({ metadata: newMetadata })
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
          message: `${parsed.documents.length} PDF document(s) extracted.`,
        });
      } catch (error) {
        const attemptCount = previousAttempts + 1;
        const permanent = attemptCount >= MAX_ATTEMPTS;

        const message =
          error instanceof Error
            ? error.message
            : "Unknown attachment processing error";

        const diagnostics =
          error instanceof AttachmentError
            ? error.diagnostics
            : {};

        const failureMetadata = {
          ...metadata,
          document_parse: {
            status: permanent
              ? "failed_permanent"
              : "failed",
            processed_at: new Date().toISOString(),
            attempt_count: attemptCount,
            error: message,
            diagnostics,
            notice: permanent
              ? "Automatic retry limit reached. Manual review required."
              : "This attachment may be retried in a later manual run.",
          },
        };

        const { error: updateError } = await supabaseAdmin
          .from("ipo_source_evidence")
          .update({ metadata: failureMetadata })
          .eq("id", row.id);

        failed++;

        results.push({
          id: row.id,
          status: permanent
            ? "failed_permanent"
            : "failed",
          message: updateError
            ? `${message}; metadata update failed: ${updateError.message}`
            : message,
        });
      }
    }

    const summary = {
      processed,
      failed,
      skipped,
      results,
    };

    await supabaseAdmin.from("automation_logs").insert({
      task_name: "nse_attachment_parse",
      status:
        failed > 0
          ? "partial_success"
          : "success",
      message: JSON.stringify(summary),
    });

    return NextResponse.json({
      success: true,
      message:
        "Extraction finished. All evidence remains unverified until manual validation.",
      ...summary,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected parser error";

    try {
      await supabaseAdmin.from("automation_logs").insert({
        task_name: "nse_attachment_parse",
        status: "failed",
        message,
      });
    } catch {
      // Preserve the original parser error.
    }

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
