import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { inflateSync } from "fflate";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  data: Buffer
) => Promise<{ text?: string; numpages?: number }>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_HOST = "nsearchives.nseindia.com";

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 30;
const MAX_ZIP_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;
const MAX_PDFS_PER_ZIP = 5;
const BATCH_SIZE = 3;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 5;

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

type ExtractedPdf = {
  fileName: string;
  buffer: Buffer;
};

type ParsedDocument = {
  attachment_name: string;
  document_type: string;
  extracted_date: string | null;
  expected_issuer_name: string | null;
  issuer_name: string | null;
  identity_match_status:
    | "matched"
    | "ambiguous"
    | "mismatch"
    | "unverified";
  extraction_quality: "good" | "low" | "ocr_required";
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

function getAttachmentName(value: string): string {
  try {
    const url = new URL(value);
    const rawName = url.pathname.split("/").pop() || "attachment";
    return decodeURIComponent(rawName).slice(0, 250);
  } catch {
    return "attachment";
  }
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
          Accept:
            "application/pdf, application/zip, application/octet-stream",
          "User-Agent": "Capital360IPO-DocumentParser/2.0",
        },
      });
    } catch (error) {
      throw new AttachmentError("NSE attachment download failed.", {
        url: currentUrl.toString(),
        reason:
          error instanceof Error ? error.message : "Network error",
      });
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();

      if (!location || redirectCount === 3) {
        throw new AttachmentError(
          "Invalid or excessive attachment redirects.",
          { http_status: response.status }
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

function calculateCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function extractPdfsFromZip(zip: Buffer): ExtractedPdf[] {
  if (zip.length > MAX_DOWNLOAD_BYTES) {
    throw new AttachmentError("ZIP exceeds the download size limit.");
  }

  let eocdOffset = -1;
  const minimumOffset = Math.max(0, zip.length - 65_557);

  for (let i = zip.length - 22; i >= minimumOffset; i--) {
    if (
      i + 22 <= zip.length &&
      zip.readUInt32LE(i) === 0x06054b50
    ) {
      const commentLength = zip.readUInt16LE(i + 20);

      if (i + 22 + commentLength === zip.length) {
        eocdOffset = i;
        break;
      }
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
    totalEntries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw new AttachmentError("ZIP64 files are not supported.");
  }

  const centralEnd = centralOffset + centralSize;

  if (
    totalEntries > MAX_ZIP_ENTRIES ||
    centralEnd > eocdOffset ||
    centralEnd < centralOffset
  ) {
    throw new AttachmentError("ZIP structure exceeds safety limits.", {
      zip_entries: totalEntries,
    });
  }

  const pdfs: ExtractedPdf[] = [];
  let cursor = centralOffset;
  let totalUncompressed = 0;

  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex++) {
    if (
      cursor + 46 > centralEnd ||
      zip.readUInt32LE(cursor) !== 0x02014b50
    ) {
      throw new AttachmentError(
        "Invalid ZIP central directory entry."
      );
    }

    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const crc = zip.readUInt32LE(cursor + 16);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const fileNameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localHeaderOffset = zip.readUInt32LE(cursor + 42);

    const entryEnd =
      cursor + 46 + fileNameLength + extraLength + commentLength;

    if (entryEnd > centralEnd) {
      throw new AttachmentError(
        "ZIP entry exceeds central directory boundaries."
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
      throw new AttachmentError("ZIP contains too many PDF files.");
    }

    if ((flags & 0x0001) !== 0) {
      throw new AttachmentError(
        "Encrypted ZIP entries are not supported.",
        { file_name: fileName }
      );
    }

    if (
      uncompressedSize > MAX_PDF_BYTES ||
      compressedSize > MAX_DOWNLOAD_BYTES ||
      uncompressedSize === 0
    ) {
      throw new AttachmentError(
        "PDF inside ZIP exceeds the size limit.",
        { file_name: fileName }
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
        { file_name: fileName, compression_method: method }
      );
    }

    if (
      localHeaderOffset + 30 > centralOffset ||
      zip.readUInt32LE(localHeaderOffset) !== 0x04034b50
    ) {
      throw new AttachmentError("Invalid ZIP local file header.");
    }

    const localFlags = zip.readUInt16LE(localHeaderOffset + 6);
    const localMethod = zip.readUInt16LE(localHeaderOffset + 8);
    const localNameLength = zip.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);

    const localNameStart = localHeaderOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const dataOffset = localNameEnd + localExtraLength;
    const dataEnd = dataOffset + compressedSize;

    if (
      localNameEnd > centralOffset ||
      dataOffset > centralOffset ||
      dataEnd > centralOffset
    ) {
      throw new AttachmentError(
        "ZIP compressed data exceeds file boundaries.",
        { file_name: fileName }
      );
    }

    const localName = zip
      .subarray(localNameStart, localNameEnd)
      .toString("utf8");

    if (
      localName !== fileName ||
      localMethod !== method ||
      (localFlags & 0x0001) !== 0
    ) {
      throw new AttachmentError(
        "ZIP local and central headers do not match.",
        { file_name: fileName }
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
      calculateCrc32(pdfBuffer) !== crc ||
      !isPdf(pdfBuffer)
    ) {
      throw new AttachmentError(
        "ZIP PDF integrity validation failed.",
        {
          file_name: fileName,
          extracted_size_bytes: pdfBuffer.length,
          expected_size_bytes: uncompressedSize,
        }
      );
    }

    pdfs.push({ fileName, buffer: pdfBuffer });
  }

  if (cursor !== centralEnd) {
    throw new AttachmentError(
      "ZIP central directory size validation failed."
    );
  }

  return pdfs;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function classifyDocument(text: string): string {
  const value = text.toLowerCase();

  if (
    /\budrhp\b|updated\s+draft\s+red\s+herring\s+prospectus/.test(value)
  ) {
    return "UDRHP";
  }

  if (
    /\bdrhp\b|draft\s+red\s+herring\s+prospectus/.test(value)
  ) {
    return "DRHP";
  }

  if (
    /\brhp\b|red\s+herring\s+prospectus/.test(value)
  ) {
    return "RHP";
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

  return "UNCLASSIFIED";
}

function extractDocumentDate(text: string): string | null {
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

  const patterns = [
    /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/,
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let day: number;
    let month: number;
    let year: number;

    if (/^\d/.test(match[1])) {
      day = Number(match[1]);
      month = /^\d/.test(match[2])
        ? Number(match[2])
        : Number(monthMap[match[2].toLowerCase()]);
      year = Number(match[3]);
    } else {
      month = Number(monthMap[match[1].toLowerCase()]);
      day = Number(match[2]);
      year = Number(match[3]);
    }

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return [
        String(year),
        String(month).padStart(2, "0"),
        String(day).padStart(2, "0"),
      ].join("-");
    }
  }

  return null;
}

function assessTextQuality(
  text: string
): ParsedDocument["extraction_quality"] {
  if (!text || text.length < 80) {
    return "ocr_required";
  }

  const replacementCharacters = (text.match(/\uFFFD/g) || []).length;
  const controlCharacters = (
    text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []
  ).length;

  const badCharacterRatio =
    (replacementCharacters + controlCharacters) /
    Math.max(text.length, 1);

  if (badCharacterRatio > 0.01) {
    return "ocr_required";
  }

  const readableCharacters = (text.match(/[a-zA-Z0-9]/g) || []).length;

  if (readableCharacters / text.length < 0.2) {
    return "low";
  }

  return "good";
}

async function parsePdf(
  buffer: Buffer,
  expectedIssuer: string | null,
  attachmentName: string
): Promise<ParsedDocument> {
  if (buffer.length > MAX_PDF_BYTES) {
    throw new AttachmentError("PDF exceeds the PDF size limit.", {
      pdf_size_bytes: buffer.length,
      pdf_limit_bytes: MAX_PDF_BYTES,
    });
  }

  if (!isPdf(buffer)) {
    throw new AttachmentError("File is not a valid PDF.", {
      ...getSignature(buffer),
    });
  }

  let parsed: { text?: string; numpages?: number };

  try {
    parsed = await pdfParse(buffer);
  } catch (error) {
    throw new AttachmentError("PDF text extraction failed.", {
      pdf_size_bytes: buffer.length,
      reason:
        error instanceof Error ? error.message : "PDF parser error",
    });
  }

  const text = (parsed.text || "").replace(/\s+/g, " ").trim();
  const quality = assessTextQuality(text);
  const expected = expectedIssuer?.trim() || null;

  let identityStatus: ParsedDocument["identity_match_status"] =
    "unverified";

  if (expected && quality === "good") {
    const normalizedIssuer = normalizeText(expected);
    const normalizedText = normalizeText(text);

    identityStatus =
      normalizedIssuer.length >= 5 &&
      normalizedText.includes(normalizedIssuer)
        ? "matched"
        : "ambiguous";
  }

  return {
    attachment_name: attachmentName,
    document_type:
      quality === "good" ? classifyDocument(text) : "UNCLASSIFIED",
    extracted_date:
      quality === "good" ? extractDocumentDate(text) : null,
    expected_issuer_name: expected,
    issuer_name: null,
    identity_match_status: identityStatus,
    extraction_quality: quality,
    page_count: parsed.numpages ?? null,
    text_excerpt: text.slice(0, 1200),
  };
}

async function processAttachment(
  url: string,
  expectedIssuer: string | null
): Promise<{
  documents: ParsedDocument[];
  diagnostics: Diagnostics;
}> {
  const downloaded = await downloadNseFile(url);
  const buffer = downloaded.buffer;
  const originalName = getAttachmentName(url);

  const diagnostics: Diagnostics = {
    ...downloaded.diagnostics,
    detected_format: isPdf(buffer)
      ? "PDF"
      : isZip(buffer)
        ? "ZIP"
        : "UNKNOWN",
  };

  if (isPdf(buffer)) {
    const document = await parsePdf(
      buffer,
      expectedIssuer,
      originalName
    );

    return { documents: [document], diagnostics };
  }

  if (isZip(buffer)) {
    const pdfs = extractPdfsFromZip(buffer);

    if (pdfs.length === 0) {
      throw new AttachmentError(
        "ZIP contains no supported PDF documents.",
        diagnostics
      );
    }

    const documents: ParsedDocument[] = [];

    for (const pdf of pdfs) {
      documents.push(
        await parsePdf(pdf.buffer, expectedIssuer, pdf.fileName)
      );
    }

    return {
      documents,
      diagnostics: {
        ...diagnostics,
        extracted_pdf_count: pdfs.length,
        extracted_pdf_names: pdfs.map((pdf) => pdf.fileName),
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

function isRetryableSizeFailure(parseInfo: any): boolean {
  const error = String(parseInfo.error || "").toLowerCase();

  return (
    error.includes("attachment exceeds the download size limit") ||
    error.includes("pdf exceeds the pdf size limit") ||
    error.includes("pdf inside zip exceeds the size limit") ||
    error.includes("zip total uncompressed size exceeds the limit")
  );
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const requestHost = request.headers.get("host");

    if (origin && requestHost) {
      let originHost = "";

      try {
        originHost = new URL(origin).host;
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid request origin." },
          { status: 403 }
        );
      }

      if (originHost !== requestHost) {
        return NextResponse.json(
          { success: false, error: "Invalid request origin." },
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
        { success: false, error: "Authentication required." },
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
      throw new Error(`Evidence query failed: ${queryError.message}`);
    }

    const eligibleRows = (rows || []).filter((row: any) => {
      const metadata = row.metadata || {};
      const parseInfo = metadata.document_parse || {};
      const status = parseInfo.status;
      const attempts = Number(parseInfo.attempt_count || 0);

      if (metadata.superseded === true) return false;
      if (status === "completed") return false;
      if (attempts >= MAX_ATTEMPTS) return false;

      if (status === "failed_permanent") {
        return isRetryableSizeFailure(parseInfo);
      }

      if (status === "failed") {
        return true;
      }

      return true;
    });

    const batch = eligibleRows.slice(0, BATCH_SIZE);
    const skipped = eligibleRows.length - batch.length;

    let processed = 0;
    let failed = 0;

    const results: Array<{
      id: string;
      company_name: string;
      attachment_name: string;
      field_name: string;
      status: string;
      message?: string;
      error?: string;
    }> = [];

    for (const row of batch) {
      const metadata = row.metadata || {};
      const previousParse = metadata.document_parse || {};
      const previousAttempts = Number(
        previousParse.attempt_count || 0
      );

      const attachmentName = row.source_url
        ? getAttachmentName(row.source_url)
        : "Missing attachment URL";

      const companyName = row.issuer_name || "Issuer not available";

      try {
        if (!row.source_url) {
          throw new AttachmentError("Attachment URL is missing.");
        }

        const parsed = await processAttachment(
          row.source_url,
          row.issuer_name || null
        );

        const hasOcrRequired = parsed.documents.some(
          (doc) => doc.extraction_quality === "ocr_required"
        );

        const newMetadata = {
          ...metadata,
          document_parse: {
            status: "completed",
            processed_at: new Date().toISOString(),
            attempt_count: previousAttempts + 1,
            documents: parsed.documents,
            diagnostics: parsed.diagnostics,
            review_status: "pending_manual_review",
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
          company_name: companyName,
          attachment_name: attachmentName,
          field_name: row.field_name || attachmentName,
          status: "completed",
          message: hasOcrRequired
            ? `${parsed.documents.length} PDF(s) extracted; OCR/manual review required.`
            : `${parsed.documents.length} PDF document(s) extracted.`,
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
            status: permanent ? "failed_permanent" : "failed",
            processed_at: new Date().toISOString(),
            attempt_count: attemptCount,
            error: message,
            diagnostics,
            review_status: "pending_manual_review",
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

        const finalMessage = updateError
          ? `${message}; metadata update failed: ${updateError.message}`
          : message;

        results.push({
          id: row.id,
          company_name: companyName,
          attachment_name: attachmentName,
          field_name: row.field_name || attachmentName,
          status: permanent ? "failed_permanent" : "failed",
          message: finalMessage,
          error: finalMessage,
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
      status: failed > 0 ? "partial_success" : "success",
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
      { success: false, error: message },
      { status: 500 }
    );
  }
}
