
import "server-only";

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_ROWS = 2000;
const CONCURRENCY = 8;

const REQUIRED_HEADERS = [
  "Company Name",
  "Symbol",
  "Listed On",
  "Issue Price",
  "Listing Day Close",
  "Listing Day Gain/Loss Change",
  "Listing Day Gain/Loss Percentage Change",
  "LTP",
  "Gain/Loss Change",
  "Gain/Loss Percentage Change",
];

type CsvRecord = Record<string, string>;

type ListingRecord = {
  company_name: string;
  symbol: string;
  listing_date: string;
  issue_price: number | null;
  listing_day_close: number | null;
  listing_day_gain: number | null;
  listing_day_gain_percent: number | null;
  ltp: number | null;
  current_gain: number | null;
  current_gain_percent: number | null;
  ipo_master_id: null;
  source: string;
  source_file_hash: string;
  record_hash: string;
  source_observed_at: string;
  review_status: "pending";
  metadata: Record<string, unknown>;
};

const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 64 * 1024;

async function readLimitedBody(
  request: NextRequest,
  maxBytes: number
): Promise<Uint8Array> {
  const contentLength = Number(
    request.headers.get("content-length") || 0
  );

  if (contentLength > maxBytes) {
    throw new Error("Request body is too large.");
  }

  if (!request.body) {
    throw new Error("Request body is missing.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Request body is too large.");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}
function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
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
    } else if (char === "\n") {
      row.push(field.trim());

      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }

      row = [];
      field = "";
    } else if (char !== "\r") {
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
  const match = value.match(
    /^\s*(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s*$/
  );

  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    year < 1900 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseAmount(value: string): number | null {
  if (!value || value === "-") return null;

  const cleaned = value.replace(/,/g, "").replace(/[₹%\s]/g, "");

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function parseRecords(csvText: string): CsvRecord[] {
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ""));

  if (rows.length < 2) {
    throw new Error("CSV has no data rows.");
  }

  const headers = rows[0].map((header) => header.trim());

  if (new Set(headers).size !== headers.length) {
    throw new Error("CSV contains duplicate column headers.");
  }

  const missing = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header)
  );

  if (missing.length > 0) {
    throw new Error(
      `NSE CSV format mismatch. Missing columns: ${missing.join(", ")}`
    );
  }

  if (rows.length - 1 > MAX_ROWS) {
    throw new Error(`CSV exceeds ${MAX_ROWS} data rows.`);
  }

  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(
        `CSV row ${index + 2} has an incorrect number of columns.`
      );
    }

    const record: CsvRecord = {};

    headers.forEach((header, columnIndex) => {
      record[header] = values[columnIndex] ?? "";
    });

    return record;
  });
}

function requiredAmount(
  value: string,
  field: string,
  rowNumber: number
): number | null {
  const parsed = parseAmount(value);

  if (value.trim() && value.trim() !== "-" && parsed === null) {
    throw new Error(
      `Invalid ${field} in CSV row ${rowNumber}.`
    );
  }

  return parsed;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return jsonResponse(
      { success: false, error: "Invalid request origin." },
      403
    );
  }

  const auth = await requireApiRole(["owner", "admin"]);

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonResponse(
        { success: false, error: "Please upload an NSE CSV file." },
        400
      );
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return jsonResponse(
        { success: false, error: "CSV must be between 1 byte and 2 MB." },
        400
      );
    }

    const csvText = await file.text();
    const sourceFileHash = hash(csvText);
    const records = parseRecords(csvText);
    const observedAt = new Date().toISOString();

    const parsedRecords: ListingRecord[] = records.map(
      (record, index) => {
        const rowNumber = index + 2;
        const companyName = record["Company Name"].trim();
        const symbol = record["Symbol"].trim().toUpperCase();
        const listingDate = parseDate(record["Listed On"]);

        if (!companyName || companyName.length < 3 || companyName.length > 250) {
          throw new Error(`Invalid company name in CSV row ${rowNumber}.`);
        }

        if (!/^[A-Z0-9._&-]{1,30}$/.test(symbol)) {
          throw new Error(`Invalid symbol in CSV row ${rowNumber}.`);
        }

        if (!listingDate) {
          throw new Error(`Invalid listing date in CSV row ${rowNumber}.`);
        }

        const issuePrice = requiredAmount(
          record["Issue Price"], "Issue Price", rowNumber
        );
        const listingDayClose = requiredAmount(
          record["Listing Day Close"], "Listing Day Close", rowNumber
        );
        const listingDayGain = requiredAmount(
          record["Listing Day Gain/Loss Change"], "Listing Day Gain/Loss Change", rowNumber
        );
        const listingDayGainPercent = requiredAmount(
          record["Listing Day Gain/Loss Percentage Change"], "Listing Day Gain/Loss Percentage Change", rowNumber
        );
        const ltp = requiredAmount(
          record["LTP"], "LTP", rowNumber
        );
        const currentGain = requiredAmount(
          record["Gain/Loss Change"], "Gain/Loss Change", rowNumber
        );
        const currentGainPercent = requiredAmount(
          record["Gain/Loss Percentage Change"], "Gain/Loss Percentage Change", rowNumber
        );

        if (issuePrice !== null && issuePrice <= 0) {
          throw new Error(`Invalid Issue Price in CSV row ${rowNumber}.`);
        }

        if (listingDayClose !== null && listingDayClose <= 0) {
          throw new Error(`Invalid Listing Day Close in CSV row ${rowNumber}.`);
        }

        if (ltp !== null && ltp <= 0) {
          throw new Error(`Invalid LTP in CSV row ${rowNumber}.`);
        }

        const recordData = {
          company_name: companyName,
          symbol,
          listing_date: listingDate,
          issue_price: issuePrice,
          listing_day_close: listingDayClose,
          listing_day_gain: listingDayGain,
          listing_day_gain_percent: listingDayGainPercent,
          ltp,
          current_gain: currentGain,
          current_gain_percent: currentGainPercent,
        };

        return {
          ...recordData,
          ipo_master_id: null,
          source: "NSE IPO Tracker CSV",
          source_file_hash: sourceFileHash,
          record_hash: hash(JSON.stringify(recordData)),
          source_observed_at: observedAt,
          review_status: "pending",
          metadata: {
            original_file_name: file.name.slice(0, 200),
            csv_row_number: rowNumber,
            snapshot_type: "CSV export snapshot",
            identity_verified: false,
            company_name_match_is_not_identity_verification: true,
          },
        };
      }
    );

    // Repeated symbols within the uploaded file are skipped.
    const seenSymbols = new Set<string>();
    const uniqueRecords: ListingRecord[] = [];
    let duplicateInFile = 0;

    for (const record of parsedRecords) {
      const normalizedSymbol = record.symbol.trim().toUpperCase();

      if (seenSymbols.has(normalizedSymbol)) {
        duplicateInFile++;
        continue;
      }

      seenSymbols.add(normalizedSymbol);
      uniqueRecords.push(record);
    }

    let inserted = 0;
    let duplicateInDatabase = 0;
    const errors: string[] = [];

    // Small controlled concurrency. Database unique index prevents
    // duplicate symbols, including concurrent imports.
    for (let i = 0; i < uniqueRecords.length; i += CONCURRENCY) {
      const batch = uniqueRecords.slice(i, i + CONCURRENCY);

      const results = await Promise.all(
        batch.map(async (record) => {
          const { error } = await supabaseAdmin
            .from("ipo_listing_history")
            .insert(record);

          if (!error) {
            return { type: "inserted" as const };
          }

          if (error.code === "23505") {
            return { type: "duplicate" as const };
          }

          return {
            type: "error" as const,
            message: `${record.symbol}: ${error.message}`,
          };
        })
      );

      for (const result of results) {
        if (result.type === "inserted") {
          inserted++;
        } else if (result.type === "duplicate") {
          duplicateInDatabase++;
        } else {
          errors.push(result.message);
        }
      }
    }

    return jsonResponse({
      success: errors.length === 0,
      source: "User-uploaded NSE IPO Tracker CSV",
      mode: "PENDING_REVIEW_IMPORT",
      summary: {
        detected: parsedRecords.length,
        inserted,
        duplicateInFile,
        duplicateInDatabase,
        totalDuplicates: duplicateInFile + duplicateInDatabase,
        failed: errors.length,
        reviewStatus: "pending",
        identityVerified: 0,
        ipoMasterLinked: 0,
        lifecycleUpdates: 0,
        automaticApproval: 0,
        automaticPublication: 0,
      },
      errors: errors.slice(0, 20),
      note:
        "Imported records remain pending review. No IPO identity verification, ipo_master linking, lifecycle update, approval or publication was performed. LTP and current gain fields represent the CSV export snapshot only.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown listing history import error";

    console.error("IPO listing history import failed:", message);

    return jsonResponse(
      {
        success: false,
        error: message,
        automaticPublication: 0,
      },
      400
    );
  }
}
