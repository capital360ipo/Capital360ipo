
import "server-only";

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_BASE = "https://www.nseindia.com";

const NSE_PAGE =
  `${NSE_BASE}/market-data/all-upcoming-issues-ipo`;

const NSE_API =
  `${NSE_BASE}/api/all-upcoming-issues?category=ipo`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type NseIpo = {
  symbol?: string;
  companyName?: string;
  series?: string;
  status?: string;
  issueStartDate?: string;
  issueEndDate?: string;
  issuePrice?: string;
  issueSize?: string;
  [key: string]: unknown;
};

function parseDate(value?: string): string | null {
  if (!value) return null;

  const input = value.trim();

  const formats = [
    /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/,
    /^(\d{4})-(\d{2})-(\d{2})$/,
  ];

  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03",
    apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09",
    oct: "10", nov: "11", dec: "12",
  };

  const short = input.match(formats[0]);

  if (short) {
    const day = short[1].padStart(2, "0");
    const month = months[short[2].toLowerCase()];
    const year = short[3];

    if (!month) return null;
    return `${year}-${month}-${day}`;
  }

  const iso = input.match(formats[1]);

  if (iso) return input;

  return null;
}

function parsePriceBand(value?: string): string | null {
  if (!value) return null;

  const numbers = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/g);

  if (!numbers || numbers.length === 0) return null;

  if (numbers.length === 1) {
    return `₹${numbers[0]}`;
  }

  return `₹${numbers[0]} - ₹${numbers[1]}`;
}

function normalizeRecord(row: NseIpo) {
  const series = (row.series || "EQ").trim().toUpperCase();

  const status = (row.status || "forthcoming")
    .trim()
    .toLowerCase();

  return {
    source: "NSE_UPCOMING_IPO",
    company_name: (row.companyName || "").trim(),
    symbol: (row.symbol || "").trim(),
    ipo_type: series === "SME" ? "SME" : "Mainboard",
    detected_status: status,
    open_date: parseDate(row.issueStartDate),
    close_date: parseDate(row.issueEndDate),
    price_band: parsePriceBand(row.issuePrice),
    issue_size: row.issueSize ?? null,
    source_url: NSE_PAGE,
    raw_payload: row,
  };
}

async function fetchUpcomingIpos() {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: NSE_PAGE,
  };

  const session = await fetch(NSE_PAGE, {
    method: "GET",
    headers,
    cache: "no-store",
    redirect: "follow",
  });

  if (!session.ok) {
    throw new Error(
      `NSE session request failed: HTTP ${session.status}`
    );
  }

  const response = await fetch(NSE_API, {
    method: "GET",
    headers,
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `NSE IPO API failed: HTTP ${response.status}`
    );
  }

  const payload = await response.json();

  if (!Array.isArray(payload)) {
    throw new Error("NSE returned an unexpected IPO data format.");
  }

  return payload as NseIpo[];
}

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET is not configured." },
        { status: 500 }
      );
    }

    const authorization = request.headers.get("authorization");

    if (authorization !== `Bearer ${secret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const rows = await fetchUpcomingIpos();

    const records = rows
      .map(normalizeRecord)
      .filter((row) => row.company_name.length > 0)
      .filter(
        (row) =>
          row.detected_status !== "closed" &&
          row.detected_status !== "listed"
      );

    return NextResponse.json({
      success: true,
      mode: "READ_ONLY_DRY_RUN",
      source: "NSE_UPCOMING_IPO",
      detected: rows.length,
      validRecords: records.length,
      mainboard: records.filter(
        (row) => row.ipo_type === "Mainboard"
      ).length,
      sme: records.filter(
        (row) => row.ipo_type === "SME"
      ).length,
      databaseWrites: 0,
      automaticPublication: false,
      records,
      message: "NSE upcoming IPO data fetched successfully. No database changes made.",
    });
  } catch (error) {
    console.error("NSE upcoming IPO collector error:", error);

    return NextResponse.json(
      {
        success: false,
        mode: "READ_ONLY_DRY_RUN",
        error:
          error instanceof Error
            ? error.message
            : "Unknown collector error",
        databaseWrites: 0,
      },
      { status: 500 }
    );
  }
}
