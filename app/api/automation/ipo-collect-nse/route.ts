import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";
import { normalizeCompanyName } from "@/lib/ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_URL =
  "https://www.nseindia.com/market-data/new-stock-exchange-listings-recent";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

type Listing = {
  listingDate: string;
  securityType: string;
  symbol: string;
  companyName: string;
  series: string;
  isin: string;
  ipoType: "SME" | "Mainboard";
};

type QueueRecord = {
  id: string;
  company_name: string;
  ipo_type: string | null;
  candidate_id: string | null;
  review_status: string;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function cleanText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: string): string | null {
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04",
    may: "05", jun: "06", jul: "07", aug: "08",
    sep: "09", oct: "10", nov: "11", dec: "12",
  };

  const match = value.match(
    /^\s*(\d{1,2})[-/\s]([A-Za-z]{3,}|[0-9]{1,2})[-/\s](\d{4})\s*$/
  );

  if (!match) return null;

  const day = Number(match[1]);
  const month = /^\d+$/.test(match[2])
    ? Number(match[2])
    : Number(months[match[2].slice(0, 3).toLowerCase()]);
  const year = Number(match[3]);

  if (
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseListings(html: string): Listing[] {
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const listings: Listing[] = [];

  for (const row of rows) {
    const cells = [
      ...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
    ].map((cell) => cleanText(cell[1]));

    if (cells.length < 6) continue;

    const listingDate = parseDate(cells[0]);
    const securityType = cells[1].trim();
    const symbol = cells[2].trim().toUpperCase();
    const companyName = cells[3].trim();
    const series = cells[4].trim().toUpperCase();
    const isin = cells[5].trim().toUpperCase();

    if (!listingDate || !companyName || companyName.length < 3) {
      continue;
    }

    if (!["equity", "sme"].includes(securityType.toLowerCase())) {
      continue;
    }

    if (!/^[A-Z0-9._&-]{1,30}$/.test(symbol)) continue;
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;

    if (["N0", "N1", "N2", "N3"].includes(series)) continue;

    const ipoType: "SME" | "Mainboard" =
      securityType.toLowerCase() === "sme" ||
      ["ST", "SM"].includes(series)
        ? "SME"
        : "Mainboard";

    listings.push({
      listingDate,
      securityType,
      symbol,
      companyName,
      series,
      isin,
      ipoType,
    });
  }

  return listings;
}

async function runDryRun() {
  const response = await fetch(NSE_URL, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(25000),
    headers: HEADERS,
  });

  if (!response.ok) {
    throw new Error(`NSE returned HTTP ${response.status}`);
  }

  const html = await response.text();

  if (!html || html.length < 500) {
    throw new Error("NSE returned an empty or incomplete page.");
  }

  const listings = parseListings(html);

  if (listings.length === 0) {
    throw new Error(
      "No equity listing rows parsed. NSE page structure needs verification."
    );
  }

  // READ ONLY: Fetch existing IPO queue records.
  const { data: queueRows, error: queueError } =
    await supabaseAdmin
      .from("ipo_import_queue")
      .select(
        "id, company_name, ipo_type, candidate_id, review_status"
      )
      .in("review_status", ["pending", "approved"])
      .limit(5000);

  if (queueError) {
    throw new Error(`IPO queue read failed: ${queueError.message}`);
  }

  const queue = (queueRows || []) as QueueRecord[];

  let matched = 0;
  let unmatched = 0;
  let ambiguous = 0;

  const preview = listings.map((listing) => {
    const normalizedName = normalizeCompanyName(
      listing.companyName
    );

    const possibleMatches = queue.filter((item) => {
      if (!item.ipo_type) return false;

      return (
        normalizeCompanyName(item.company_name) === normalizedName &&
        item.ipo_type.toLowerCase() === listing.ipoType.toLowerCase()
      );
    });

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

    if (possibleMatches.length === 0) {
      unmatched++;
      matchStatus = "unmatched";
    } else if (possibleMatches.length > 1) {
      ambiguous++;
      matchStatus = "ambiguous";
    } else {
      matched++;
      matchStatus = "possible_match";

      matchedQueue = {
        id: possibleMatches[0].id,
        companyName: possibleMatches[0].company_name,
        candidateId: possibleMatches[0].candidate_id,
        reviewStatus: possibleMatches[0].review_status,
      };
    }

    return {
      listingDate: listing.listingDate,
      companyName: listing.companyName,
      symbol: listing.symbol,
      isin: listing.isin,
      series: listing.series,
      securityType: listing.securityType,
      ipoType: listing.ipoType,
      matchStatus,
      identityVerified: false,
      matchMethod: "Exact normalized company name + IPO type only",
      matchedQueue,
    };
  });

  return {
    mode: "READ_ONLY_DRY_RUN",
    detected: listings.length,
    matched,
    unmatched,
    ambiguous,
    preview: preview.slice(0, 50),
    previewLimit: 50,
    queueRecordsChecked: queue.length,
    bondsAndNonEquityExcluded: true,
    databaseWrites: 0,
    evidenceInserted: 0,
    lifecycleUpdates: 0,
    automaticPublication: 0,
    identityVerification: 0,
    note:
      "Possible matches are based only on company name and IPO type. Symbol and ISIN are displayed for manual identity verification. No database records are changed.",
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
    const result = await runDryRun();

    return jsonResponse({
      success: true,
      source: "NSE Recent Equity Listings",
      collection: result,
      message: "Read-only NSE listing dry run completed.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown NSE listing dry run error";

    console.error("NSE listing dry run failed:", message);

    return jsonResponse(
      {
        success: false,
        source: "NSE Recent Equity Listings",
        error: message,
        databaseWrites: 0,
      },
      502
    );
  }
}
