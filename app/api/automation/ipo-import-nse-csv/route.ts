import "server-only";

import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeCompanyName } from "@/lib/ipo-matching";
import { runIpoMatching } from "@/lib/run-ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_ROWS = 2000;
const BATCH_SIZE = 500;

type AttachmentEvidence = {
  attachmentColumn: string;
  fieldName: string;
  sourceUrl: string;
  relatedDateColumn: string | null;
  relatedDateValue: string | null;
};

type ImportRecord = {
  id: string;
  source_name: string;
  source_url: string | null;
  external_id: string;
  company_name: string;
  ipo_type: string;
  drhp_filed_date: string;
  detected_status: string;
  normalized_company_name: string;
  verification_status: string;
  confidence_score: null;
  content_hash: string;
  raw_payload: Record<string, string>;
  review_status: string;
  collected_at: string;
  created_at: string;
  updated_at: string;
};

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];

    if (quoted) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") i++;

      row.push(field.trim());
      field = "";

      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }

      row = [];
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new Error("CSV contains an unclosed quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());

    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function parseDate(value: string): string | null {
  const match = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (!match) return null;

  const [, day, month, year] = match;

  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day))
  );

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function validNseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());

    if (
      url.protocol !== "https:" ||
      url.hostname !== "nsearchives.nseindia.com"
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function getColumnIndex(
  headers: string[],
  possibleNames: string[]
): number {
  const accepted = possibleNames.map(normalizeHeader);
  return headers.findIndex((header) => accepted.includes(header));
}

function selectSourceUrl(
  values: string[],
  headers: string[]
): string | null {
  for (let i = 0; i < headers.length; i++) {
    if (!headers[i].endsWith("ATTACHMENT")) continue;

    const url = validNseUrl(values[i] || "");

    if (url) return url;
  }

  return null;
}

function extractAttachmentEvidence(
  values: string[],
  originalHeaders: string[],
  normalizedHeaders: string[]
): AttachmentEvidence[] {
  const attachments: AttachmentEvidence[] = [];

  for (let i = 0; i < normalizedHeaders.length; i++) {
    const attachmentHeader = normalizedHeaders[i];

    if (!attachmentHeader.endsWith("ATTACHMENT")) {
      continue;
    }

    const sourceUrl = validNseUrl(values[i] || "");

    if (!sourceUrl) continue;

    const baseHeader = attachmentHeader.replace(
      /ATTACHMENT$/,
      ""
    );

    const relatedDateIndex = normalizedHeaders.findIndex(
      (header) => header === baseHeader
    );

    const relatedDateValue =
      relatedDateIndex >= 0
        ? values[relatedDateIndex]?.trim() || null
        : null;

    const attachmentColumn = originalHeaders[i].trim();

    attachments.push({
      attachmentColumn,
      fieldName: baseHeader.toLowerCase(),
      sourceUrl,
      relatedDateColumn:
        relatedDateIndex >= 0
          ? originalHeaders[relatedDateIndex].trim()
          : null,
      relatedDateValue:
        relatedDateValue && relatedDateValue !== "-"
          ? relatedDateValue
          : null,
    });
  }

  return attachments;
}

export async function POST(request: NextRequest) {
  try {
    // Same-origin protection
    const origin = request.headers.get("origin");
    const requestOrigin = new URL(request.url).origin;

    if (!origin || origin !== requestOrigin) {
      return NextResponse.json(
        { success: false, error: "Invalid request origin." },
        { status: 403 }
      );
    }

    // Owner/Admin authentication
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
        { success: false, error: "Owner/Admin access required." },
        { status: 403 }
      );
    }

    // File validation
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Please select a CSV file." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { success: false, error: "Only CSV files are accepted." },
        { status: 400 }
      );
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "CSV must be between 1 byte and 2 MB." },
        { status: 413 }
      );
    }

    const csv = (await file.text()).replace(/^\uFEFF/, "");
    const parsedRows = parseCsv(csv);

    if (parsedRows.length < 2) {
      return NextResponse.json(
        { success: false, error: "CSV has no data rows." },
        { status: 400 }
      );
    }

    if (parsedRows.length - 1 > MAX_ROWS) {
      return NextResponse.json(
        { success: false, error: "Maximum 2,000 CSV rows allowed." },
        { status: 413 }
      );
    }

    const originalHeaders = parsedRows[0];
    const headers = originalHeaders.map(normalizeHeader);

    const companyIndex = getColumnIndex(headers, [
      "NAME OF THE COMPANY",
    ]);

    const issueIndex = getColumnIndex(headers, [
      "TYPE OF ISSUE",
    ]);

    const boardIndex = getColumnIndex(headers, [
      "TYPE OF BOARD",
    ]);

    const dateIndex = getColumnIndex(headers, [
      "Draft Offer Document Date",
    ]);

    if (
      companyIndex < 0 ||
      issueIndex < 0 ||
      boardIndex < 0 ||
      dateIndex < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Required NSE columns not found. Company, Issue Type, Board and Draft Offer Document Date are required.",
        },
        { status: 400 }
      );
    }

    const records: ImportRecord[] = [];
    const attachmentsByHash = new Map<
      string,
      AttachmentEvidence[]
    >();

    const seenHashes = new Set<string>();

    let detected = 0;
    let duplicates = 0;
    let skipped = 0;

    const now = new Date().toISOString();

    for (const values of parsedRows.slice(1)) {
      const companyName = values[companyIndex]?.trim();
      const issueType = values[issueIndex]?.trim().toUpperCase();
      const board = values[boardIndex]?.trim();
      const draftDate = parseDate(values[dateIndex] || "");

      if (!companyName || issueType !== "IPO" || !draftDate) {
        skipped++;
        continue;
      }

      const normalizedName = normalizeCompanyName(companyName);

      if (!normalizedName) {
        skipped++;
        continue;
      }

      let ipoType: string;

      const normalizedBoard = normalizeHeader(board || "");

      if (normalizedBoard === "SMEBOARD") {
        ipoType = "SME";
      } else if (
        normalizedBoard === "MAINBOARD" ||
        normalizedBoard === "MAINBOARDIPO"
      ) {
        ipoType = "Mainboard";
      } else {
        skipped++;
        continue;
      }

      detected++;

      const contentHash = createHash("sha256")
        .update(`NSE|${normalizedName}|${ipoType}|${draftDate}`)
        .digest("hex");

      if (seenHashes.has(contentHash)) {
        duplicates++;
        continue;
      }

      seenHashes.add(contentHash);

      const rawPayload: Record<string, string> = {};

      originalHeaders.forEach((header, index) => {
        rawPayload[header.trim()] = values[index] ?? "";
      });

      attachmentsByHash.set(
        contentHash,
        extractAttachmentEvidence(
          values,
          originalHeaders,
          headers
        )
      );

      records.push({
        id: randomUUID(),
        source_name: "NSE",
        source_url: selectSourceUrl(values, headers),
        external_id: `NSE:${contentHash}`,
        company_name: companyName,
        ipo_type: ipoType,
        drhp_filed_date: draftDate,
        detected_status: "drhp_filed",
        normalized_company_name: normalizedName,
        verification_status: "unverified",
        confidence_score: null,
        content_hash: contentHash,
        raw_payload: rawPayload,
        review_status: "pending",
        collected_at: now,
        created_at: now,
        updated_at: now,
      });
    }

    // Find already imported records.
    const existingHashes = new Set<string>();
    const hashes = records.map((record) => record.content_hash);

    for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
      const batch = hashes.slice(i, i + BATCH_SIZE);

      const { data: existing, error: existingError } =
        await supabaseAdmin
          .from("ipo_import_queue")
          .select("content_hash")
          .eq("source_name", "NSE")
          .in("content_hash", batch);

      if (existingError) {
        return NextResponse.json(
          {
            success: false,
            error: "Could not check existing NSE records.",
          },
          { status: 500 }
        );
      }

      for (const item of existing || []) {
        if (item.content_hash) {
          existingHashes.add(item.content_hash);
        }
      }
    }

    const newRecords = records.filter(
      (record) => !existingHashes.has(record.content_hash)
    );

    duplicates += records.length - newRecords.length;

    // Insert only genuinely new queue records.
    for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
      const batch = newRecords.slice(i, i + BATCH_SIZE);

      const { error: insertError } = await supabaseAdmin
        .from("ipo_import_queue")
        .insert(batch);

      if (insertError) {
        console.error("NSE CSV insert failed:", insertError.message);

        return NextResponse.json(
          {
            success: false,
            error: "NSE import failed. Check server logs.",
          },
          { status: 500 }
        );
      }
    }

    // Resolve queue IDs for new and existing records.
    const queueIdByHash = new Map<string, string>();
    let evidenceError: string | null = null;

    for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
      const batch = hashes.slice(i, i + BATCH_SIZE);

      const { data: queueRows, error: queueError } =
        await supabaseAdmin
          .from("ipo_import_queue")
          .select("id, content_hash")
          .eq("source_name", "NSE")
          .in("content_hash", batch);

      if (queueError) {
        evidenceError = "Could not retrieve NSE queue record IDs.";
        console.error("NSE queue lookup failed:", queueError.message);
        break;
      }

      for (const item of queueRows || []) {
        if (item.content_hash) {
          queueIdByHash.set(item.content_hash, item.id);
        }
      }
    }

    // Build separate evidence for every attachment.
    const evidenceRecords = records.flatMap((record) => {
      const queueId = queueIdByHash.get(record.content_hash);

      if (!queueId) return [];

      const attachments =
        attachmentsByHash.get(record.content_hash) || [];

      return attachments.map((attachment) => {
        const evidenceHash = createHash("sha256")
          .update(
            [
              "NSE",
              "NSE_ATTACHMENT",
              record.content_hash,
              attachment.fieldName,
              attachment.sourceUrl,
              attachment.relatedDateValue || "",
            ].join("|")
          )
          .digest("hex");

        return {
          queue_id: queueId,
          source_name: "NSE",
          source_url: attachment.sourceUrl,
          evidence_type: "nse_attachment",
          field_name: attachment.fieldName,
          field_value: attachment.relatedDateValue,
          issuer_name: record.company_name,
          is_official_source: true,
          validation_status: "unverified",
          content_hash: evidenceHash,
          observed_at: now,
          metadata: {
            attachment_column: attachment.attachmentColumn,
            related_date_column: attachment.relatedDateColumn,
            related_date_value: attachment.relatedDateValue,
            export_file_name: file.name,
            issue_type: "IPO",
            board_type: record.ipo_type,
            evidence_scope:
              "NSE archive attachment mapped to its exact CSV column. Document contents have not been independently fetched or validated.",
          },
        };
      });
    });

    let evidenceInserted = 0;

    if (!evidenceError) {
      for (
        let i = 0;
        i < evidenceRecords.length;
        i += BATCH_SIZE
      ) {
        const batch = evidenceRecords.slice(i, i + BATCH_SIZE);

        const { data: savedEvidence, error: saveError } =
          await supabaseAdmin
            .from("ipo_source_evidence")
            .upsert(batch, {
              onConflict: "queue_id,evidence_type,content_hash",
              ignoreDuplicates: true,
            })
            .select("id");

        if (saveError) {
          evidenceError = "Could not save NSE attachment evidence.";
          console.error("NSE evidence save failed:", saveError.message);
          break;
        }

        evidenceInserted += savedEvidence?.length || 0;
      }
    }

    // Run central matching engine.
    let matchingResult = null;
    let matchingError: string | null = null;

    try {
      matchingResult = await runIpoMatching();
    } catch (error) {
      matchingError =
        error instanceof Error
          ? error.message
          : "Unknown matching error";

      console.error(
        "Automatic NSE IPO matching failed:",
        matchingError
      );

      await supabaseAdmin.from("automation_logs").insert({
        task_name: "nse_ipo_matching",
        status: "failed",
        message: matchingError.slice(0, 500),
      });
    }

    const importMessage =
      `Detected ${detected}, inserted ${newRecords.length}, ` +
      `duplicates ${duplicates}, skipped ${skipped}.`;

    const finalStatus = evidenceError
      ? "partial"
      : "success";

    const { error: logError } = await supabaseAdmin
      .from("automation_logs")
      .insert({
        task_name: "nse_ipo_csv_import",
        status: finalStatus,
        message:
          `${importMessage} Attachment evidence attempted ` +
          `${evidenceRecords.length}, inserted ${evidenceInserted}. ` +
          `Matching: ${matchingError ? "failed" : "completed"}. ` +
          "Records remain pending and unverified.",
      });

    if (logError) {
      console.error("NSE import log failed:", logError.message);
    }

    return NextResponse.json(
      {
        success: true,
        detected,
        inserted: newRecords.length,
        duplicates,
        skipped,
        attachmentEvidenceAttempted: evidenceRecords.length,
        attachmentEvidenceInserted: evidenceInserted,
        evidenceError,
        matching: matchingResult,
        matchingError,
        message: importMessage,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error(
      "NSE CSV import failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      {
        success: false,
        error: "NSE CSV import failed. Check server logs.",
      },
      { status: 500 }
    );
  }
}
