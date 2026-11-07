
import "server-only";

import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeCompanyName } from "@/lib/ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

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
    const url = new URL(value);

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

function selectSourceUrl(values: string[]): string | null {
  const attachmentIndexes = [
    5, 7, 9, 11, 13, 15, 17, 19, 21,
  ];

  for (const index of attachmentIndexes) {
    const value = values[index]?.trim();

    if (!value || value === "-") continue;

    const url = validNseUrl(value);

    if (url) return url;
  }

  return null;
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
        {
          success: false,
          error: "CSV must be between 1 byte and 2 MB.",
        },
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

    // Validate actual NSE CSV structure
    const headers = parsedRows[0].map((value) =>
      value
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase()
    );

    if (
      headers[0] !== "NAME OF THE COMPANY" ||
      headers[1] !== "TYPE OF ISSUE" ||
      headers[2] !== "TYPE OF BOARD" ||
      headers[3] !== "DRAFT OFFER DOCUMENT DATE" ||
      headers.length < 22
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "CSV format does not match the expected NSE advertisement format.",
        },
        { status: 400 }
      );
    }

    const records = [];
    const seenHashes = new Set<string>();

    let detected = 0;
    let duplicates = 0;
    let skipped = 0;

    for (const values of parsedRows.slice(1)) {
      if (values.length !== 22) {
        skipped++;
        continue;
      }

      const companyName = values[0]?.trim();
      const issueType = values[1]?.trim().toUpperCase();
      const board = values[2]?.trim();
      const draftDate = parseDate(values[3] || "");

      // This importer handles IPO records only.
      if (
        !companyName ||
        issueType !== "IPO" ||
        !draftDate
      ) {
        skipped++;
        continue;
      }

      const normalizedName = normalizeCompanyName(companyName);

      if (!normalizedName) {
        skipped++;
        continue;
      }

      let ipoType: string;

      if (board.toLowerCase() === "sme board") {
        ipoType = "SME";
      } else if (board.toLowerCase() === "main board") {
        ipoType = "Mainboard";
      } else {
        skipped++;
        continue;
      }

      detected++;

      const contentHash = createHash("sha256")
        .update(
          `NSE|${normalizedName}|${ipoType}|${draftDate}`
        )
        .digest("hex");

      if (seenHashes.has(contentHash)) {
        duplicates++;
        continue;
      }

      seenHashes.add(contentHash);

      const rawPayload = Object.fromEntries(
        parsedRows[0].map((header, index) => [
          header,
          values[index] ?? "",
        ])
      );

      records.push({
        id: randomUUID(),
        source_name: "NSE",
        source_url: selectSourceUrl(values),
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
        collected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Find existing NSE records before inserting.
    const hashes = records.map((record) => record.content_hash);
    const existingHashes = new Set<string>();

    if (hashes.length > 0) {
      const { data: existing, error: existingError } =
        await supabaseAdmin
          .from("ipo_import_queue")
          .select("content_hash")
          .eq("source_name", "NSE")
          .in("content_hash", hashes);

      if (existingError) {
        return NextResponse.json(
          { success: false, error: "Could not check existing NSE records." },
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

    // Insert only new records into the review queue.
    if (newRecords.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("ipo_import_queue")
        .insert(newRecords);

      if (insertError) {
        return NextResponse.json(
          {
            success: false,
            error: "NSE import failed. Check server logs.",
          },
          { status: 500 }
        );
      }
    }

    await supabaseAdmin.from("automation_logs").insert({
      task_name: "nse_ipo_csv_import",
      status: "success",
      message: `Detected ${detected}, inserted ${newRecords.length}, duplicates ${duplicates}, skipped ${skipped}. All imported records remain pending and unverified.`,
    });

    return NextResponse.json(
      {
        success: true,
        detected,
        inserted: newRecords.length,
        duplicates,
        skipped,
        message: "NSE CSV import completed. Records remain pending verification.",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "NSE CSV import failed. Check server logs.",
      },
      { status: 500 }
    );
  }
}
