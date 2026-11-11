
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";
import { normalizeCompanyName } from "@/lib/ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_ROWS = 2000;
const PREVIEW_LIMIT = 50;

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

type QueueRecord = {
  id: string;
  company_name: string;
  candidate_id: string | null;
  review_status: string;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header)
  );

  if (missingHeaders.length > 0) {
    throw new Error(
      `NSE CSV format mismatch. Missing columns: ${missingHeaders.join(", ")}`
    );
  }

  if (rows.length - 1 > MAX_ROWS) {
    throw new Error(`CSV exceeds ${MAX_ROWS} data rows.`);
  }

  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(
        `CSV row ${index + 2} has ${values.length} columns; expected ${headers.length}.`
      );
    }

    const record: CsvRecord = {};

    headers.forEach((header, columnIndex) => {
      record[header] = values[columnIndex] ?? "";
    });

    return record;
  });
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
    const records = parseRecords(csvText);

    const validRecords = records.map((record, index) => {
      const companyName = record["Company Name"].trim();
      const symbol = record["Symbol"].trim().toUpperCase();
      const listingDate = parseDate(record["Listed On"]);

      if (!companyName || companyName.length < 3) {
        throw new Error(`Invalid company name in CSV row ${index + 2}.`);
      }

      if (!/^[A-Z0-9._&-]{1,30}$/.test(symbol)) {
        throw new Error(`Invalid symbol in CSV row ${index + 2}.`);
      }

      if (!listingDate) {
        throw new Error(`Invalid listing date in CSV row ${index + 2}.`);
      }

      return {
        companyName,
        symbol,
        listingDate,
        issuePrice: parseAmount(record["Issue Price"]),
        listingDayClose: parseAmount(record["Listing Day Close"]),
        listingDayChange: parseAmount(
          record["Listing Day Gain/Loss Change"]
        ),
        listingDayChangePercent: record[
          "Listing Day Gain/Loss Percentage Change"
        ],
        ltp: parseAmount(record["LTP"]),
        gainLossChange: parseAmount(record["Gain/Loss Change"]),
        gainLossPercent: record["Gain/Loss Percentage Change"],
      };
    });

    const symbolCounts = new Map<string, number>();

    for (const item of validRecords) {
      symbolCounts.set(
        item.symbol,
        (symbolCounts.get(item.symbol) || 0) + 1
      );
    }

    const duplicateSymbols = [...symbolCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([symbol]) => symbol);

    // READ ONLY: Fetch existing IPO queue records.
    const { data: queueRows, error: queueError } =
      await supabaseAdmin
        .from("ipo_import_queue")
        .select("id, company_name, candidate_id, review_status")
        .in("review_status", ["pending", "approved"])
        .limit(5000);

    if (queueError) {
      throw new Error(`IPO queue read failed: ${queueError.message}`);
    }

    const queue = (queueRows || []) as QueueRecord[];

    let possibleMatches = 0;
    let unmatched = 0;
    let ambiguous = 0;

    const preview = validRecords.map((item) => {
      const normalizedName = normalizeCompanyName(item.companyName);

      const matches = queue.filter(
        (record) =>
          normalizeCompanyName(record.company_name) === normalizedName
      );

      let matchStatus:
        | "possible_match"
        | "unmatched"
        | "ambiguous";

      let matchedQueue: {
        id: string;
        companyName: string;
        candidateId: string | null;
        reviewStatus: string;
      } | null = null;

      if (matches.length === 0) {
        unmatched++;
        matchStatus = "unmatched";
      } else if (matches.length > 1) {
        ambiguous++;
        matchStatus = "ambiguous";
      } else {
        possibleMatches++;
        matchStatus = "possible_match";

        matchedQueue = {
          id: matches[0].id,
          companyName: matches[0].company_name,
          candidateId: matches[0].candidate_id,
          reviewStatus: matches[0].review_status,
        };
      }

      return {
        ...item,
        matchStatus,
        identityVerified: false,
        matchedQueue,
      };
    });

    return jsonResponse({
      success: true,
      source: "User-uploaded NSE IPO Tracker CSV",
      mode: "READ_ONLY_DRY_RUN",
      summary: {
        detected: validRecords.length,
        possibleMatches,
        unmatched,
        ambiguous,
        duplicateSymbols: duplicateSymbols.length,
        duplicateSymbolList: duplicateSymbols,
        queueRecordsChecked: queue.length,
        previewReturned: Math.min(preview.length, PREVIEW_LIMIT),
        databaseWrites: 0,
        evidenceInserted: 0,
        lifecycleUpdates: 0,
        automaticPublication: 0,
        identityVerified: 0,
      },
      preview: preview.slice(0, PREVIEW_LIMIT),
      note:
        "Company name matching is provisional only. Symbol and listing date are previewed, not verified. No database records are inserted or updated.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown CSV preview error";

    console.error("NSE IPO Tracker preview failed:", message);

    return jsonResponse(
      {
        success: false,
        error: message,
        databaseWrites: 0,
      },
      400
    );
  }
}
