import "server-only";

import { createHash } from "crypto";
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

    // Bonds and other non-equity instruments are excluded.
    if (!["equity", "sme"].includes(securityType.toLowerCase())) {
      continue;
    }

    if (!/^[A-Z0-9._&-]{1,30}$/.test(symbol)) continue;
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;

    // Debt-like series are not treated as IPO equity listings.
    if (["N0", "N1", "N2", "N3"].includes(series)) continue;

    let ipoType: "SME" | "Mainboard";

    if (
      securityType.toLowerCase() === "sme" ||
      ["ST", "SM"].includes(series)
    ) {
      ipoType = "SME";
    } else {
      ipoType = "Mainboard";
    }

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

async function writeLog(
  status: "success" | "failed",
  message: string
) {
  const { error } = await supabaseAdmin
    .from("automation_logs")
    .insert({
      task_name: "NSE Recent Equity Listing Collection",
      status,
      message: message.slice(0, 500),
    });

  if (error) {
    console.error("NSE listing log failed:", error.message);
  }
}

async function collectListings() {
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
      "No Equity listing rows parsed. NSE page structure or response needs verification."
    );
  }

  // Only pending/approved IPO queue records are considered.
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

  let detected = listings.length;
  let matched = 0;
  let unmatched = 0;
  let evidenceInserted = 0;
  let evidenceDuplicates = 0;
  let ambiguous = 0;

  for (const listing of listings) {
    const normalizedListingName = normalizeCompanyName(
      listing.companyName
    );

    const possibleMatches = queue.filter((item) => {
      if (!item.ipo_type) return false;

      const sameName =
        normalizeCompanyName(item.company_name) ===
        normalizedListingName;

      const sameType =
        item.ipo_type.toLowerCase() ===
        listing.ipoType.toLowerCase();

      return sameName && sameType;
    });

    // A company name alone is not verified identity.
    if (possibleMatches.length === 0) {
      unmatched++;
      continue;
    }

    // Multiple queue matches require manual resolution.
    if (possibleMatches.length !== 1) {
      ambiguous++;
      continue;
    }

    const queueRecord = possibleMatches[0];
    matched++;

    const contentHash = createHash("sha256")
      .update(
        [
          "NSE_RECENT_LISTING",
          listing.listingDate,
          listing.securityType,
          listing.symbol,
          listing.companyName,
          listing.series,
          listing.isin,
        ].join("|")
      )
      .digest("hex");

    const evidencePayload = {
      queue_id: queueRecord.id,
      candidate_id: queueRecord.candidate_id,
      source_name: "NSE",
      source_url: NSE_URL,
      evidence_type: "nse_recent_listing_record",
      field_name: "listing_date",
      field_value: listing.listingDate,
      issuer_name: listing.companyName,
      is_official_source: true,
      validation_status: "unverified",
      content_hash: contentHash,
      observed_at: new Date().toISOString(),
      metadata: {
        security_type: listing.securityType,
        symbol: listing.symbol,
        company_name: listing.companyName,
        series: listing.series,
        isin: listing.isin,
        ipo_type: listing.ipoType,
        lifecycle_stage_proposed: "listed",
        identity_match_status: "unverified",
        review_status: "pending_manual_review",
        source_type: "NSE Recent Listing",
        automatic_status_change: false,
      },
    };

    // Existing unique key prevents duplicate evidence records.
    const { data, error } = await supabaseAdmin
      .from("ipo_source_evidence")
      .upsert(evidencePayload, {
        onConflict: "queue_id,evidence_type,content_hash",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      throw new Error(
        `Evidence save failed for ${listing.companyName}: ${error.message}`
      );
    }

    if (data && data.length > 0) {
      evidenceInserted++;
    } else {
      evidenceDuplicates++;
    }
  }

  return {
    detected,
    matched,
    unmatched,
    ambiguous,
    evidenceInserted,
    evidenceDuplicates,
    bondsAndNonEquityExcluded: true,
    automaticListingUpdates: 0,
    automaticPublication: 0,
  };
}

async function handleCollection() {
  try {
    const result = await collectListings();

    const message =
      `Detected: ${result.detected}; Matched: ${result.matched}; Unmatched: ${result.unmatched}; Ambiguous: ${result.ambiguous}; Evidence inserted: ${result.evidenceInserted}; Evidence duplicates: ${result.evidenceDuplicates}`;

    await writeLog("success", message);

    return jsonResponse({
      success: true,
      source: "NSE Recent Listings",
      collection: result,
      message,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown NSE listing collection error";

    console.error("NSE listing collection failed:", message);
    await writeLog("failed", message);

    return jsonResponse(
      {
        success: false,
        source: "NSE Recent Listings",
        error: "NSE listing collection failed. Check server logs.",
      },
      502
    );
  }
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

  return handleCollection();
}
