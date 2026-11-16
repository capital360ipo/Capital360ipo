
import "server-only";

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";
import { normalizeCompanyName } from "@/lib/ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE = "NSE_HISTORICAL_IPO";
const PAGE_URL =
  "https://www.nseindia.in/market-data/all-upcoming-issues-ipo";
const API_URL = "https://www.nseindia.in/api/public-past-issues";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: PAGE_URL,
};

type NseRecord = {
  companyName?: string;
  company?: string;
  symbol?: string;
  securityType?: string;
  ipoStartDate?: string;
  ipoEndDate?: string;
  listingDate?: string;
  priceRange?: string;
  issuePrice?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function indiaDate(daysAgo = 0): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const values: Record<string, string> = {};
  for (const part of parts) {
    values[part.type] = part.value;
  }

  const date = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day) - daysAgo
    )
  );

  return [
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    date.getUTCFullYear(),
  ].join("-");
}

function parseNseDate(value?: string): string | null {
  if (!value) return null;

  const match = value.trim().match(
    /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/
  );

  if (!match) return null;

  const months: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04",
    MAY: "05", JUN: "06", JUL: "07", AUG: "08",
    SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };

  const month = months[match[2].toUpperCase()];
  if (!month) return null;

  const day = Number(match[1]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, Number(month) - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function makeHash(record: {
  symbol: string;
  companyName: string;
  openDate: string | null;
  closeDate: string | null;
  listingDate: string | null;
}) {
  return createHash("sha256")
    .update(
      [
        SOURCE,
        record.symbol,
        record.companyName,
        record.openDate || "",
        record.closeDate || "",
        record.listingDate || "",
      ].join("|").toLowerCase()
    )
    .digest("hex");
}

async function collectNseIpos() {
  const fromDate = indiaDate(365);
  const toDate = indiaDate();

  const pageResponse = await fetch(PAGE_URL, {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });

  const cookies =
    pageResponse.headers.get("set-cookie") || "";

  const apiUrl = new URL(API_URL);
  apiUrl.searchParams.set("from_date", fromDate);
  apiUrl.searchParams.set("to_date", toDate);
  apiUrl.searchParams.set("security_type", "all");

  const apiResponse = await fetch(apiUrl.toString(), {
    headers: {
      ...HEADERS,
      Cookie: cookies
        .split(/,(?=[^;,]+=)/)
        .map((cookie) => cookie.split(";")[0])
        .filter(Boolean)
        .join("; "),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });

  if (!apiResponse.ok) {
    throw new Error(`NSE API HTTP ${apiResponse.status}`);
  }

  const payload: unknown = await apiResponse.json();

  if (!Array.isArray(payload)) {
    throw new Error("NSE returned an unexpected JSON structure.");
  }

  if (payload.length === 0) {
    throw new Error("NSE returned zero IPO records.");
  }

  const records = payload as NseRecord[];

  const prepared = records.flatMap((record) => {
    const companyName = (
      record.companyName || record.company || ""
    ).trim();

    const symbol = (record.symbol || "").trim().toUpperCase();
    const securityType = (record.securityType || "").trim();

    if (!companyName || !symbol) return [];

    if (!["SME", "EQUITY"].includes(securityType.toUpperCase())) {
      return [];
    }

    const openDate = parseNseDate(record.ipoStartDate);
    const closeDate = parseNseDate(record.ipoEndDate);
    const listingDate = parseNseDate(record.listingDate);

    if (!openDate || !closeDate || !listingDate) return [];

    const identity = {
      symbol,
      companyName,
      openDate,
      closeDate,
      listingDate,
    };

    const contentHash = makeHash(identity);

    return [{
      source_name: SOURCE,
      source_url: API_URL,
      external_id: symbol,
      company_name: companyName,
      ipo_type:
        securityType.toUpperCase() === "SME"
          ? "SME"
          : "Mainboard",
      open_date: openDate,
      close_date: closeDate,
      listing_date: listingDate,
      detected_status: "nse_historical",
      raw_payload: record,
      content_hash: contentHash,
      review_status: "pending",
      collected_at: new Date().toISOString(),
      normalized_company_name:
        normalizeCompanyName(companyName),
      verification_status: "unverified",
      confidence_score: 0,
    }];
  });

  if (prepared.length === 0) {
    throw new Error("No valid IPO records with all three dates.");
  }

  let inserted = 0;
  let duplicates = 0;

  // Check existing records in batches.
  const hashes = prepared.map((item) => item.content_hash);
  const existingHashes = new Set<string>();

  for (let i = 0; i < hashes.length; i += 100) {
    const batch = hashes.slice(i, i + 100);

    const { data, error } = await supabaseAdmin
      .from("ipo_import_queue")
      .select("content_hash")
      .eq("source_name", SOURCE)
      .in("content_hash", batch);

    if (error) {
      throw new Error(`Duplicate check failed: ${error.message}`);
    }

    for (const row of data || []) {
      if (row.content_hash) existingHashes.add(row.content_hash);
    }
  }

  const newRecords = prepared.filter((item) => {
    if (existingHashes.has(item.content_hash)) {
      duplicates++;
      return false;
    }
    return true;
  });

  // Insert only new records, always pending review.
  for (let i = 0; i < newRecords.length; i += 50) {
    const batch = newRecords.slice(i, i + 50);

    const { data, error } = await supabaseAdmin
      .from("ipo_import_queue")
      .insert(batch)
      .select("id");

    if (error) {
      throw new Error(
        `IPO queue insert failed after ${inserted} records: ${error.message}`
      );
    }

    inserted += data?.length || 0;
  }

  return {
    success: true,
    source: SOURCE,
    dateRange: { fromDate, toDate },
    detected: records.length,
    validRecords: prepared.length,
    inserted,
    duplicates,
    invalidRecords: records.length - prepared.length,
    databaseWrites: inserted,
    automaticPublication: 0,
    reviewStatus: "pending",
    message: "NSE historical IPO collection completed.",
  };
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
    return jsonResponse(await collectNseIpos());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown NSE error";

    console.error("NSE historical IPO collector:", message);

    return jsonResponse(
      { success: false, error: message },
      502
    );
  }
}
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (
    !secret ||
    request.headers.get("authorization") !== `Bearer ${secret}`
  ) {
    return jsonResponse(
      { success: false, error: "Unauthorized" },
      401
    );
  }

  try {
    return jsonResponse(await collectNseIpos());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "NSE cron failed";

    console.error("NSE cron failed:", message);

    return jsonResponse(
      { success: false, error: message },
      502
    );
  }
}
