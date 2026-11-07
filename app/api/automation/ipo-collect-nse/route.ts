import "server-only";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_URL =
  "https://www.nseindia.com/static/companies-listing/public-issue-advertisements";

const NSE_HOSTS = ["www.nseindia.com", "nseindia.com"];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

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

function parseNseDate(value: string): string | null {
  const months: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };

  const numeric = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);

  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const named = value.match(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i
  );

  if (named) {
    const month = months[named[2].slice(0, 3).toLowerCase()];
    return `${named[3]}-${month}-${String(Number(named[1])).padStart(2, "0")}`;
  }

  return null;
}

async function writeLog(
  status: "success" | "failed",
  message: string
) {
  const { error } = await supabaseAdmin
    .from("automation_logs")
    .insert({
      task_name: "NSE IPO DRHP Collection",
      status,
      message: message.slice(0, 500),
    });

  if (error) {
    console.error("NSE automation log failed:", error.message);
  }
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
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
        { error: "Owner/Admin access required." },
        { status: 403 }
      );
    }

    const response = await fetch(NSE_URL, {
      method: "GET",
      cache: "no-store",
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

    const rows =
      html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

    const filings = new Map<
      string,
      {
        companyName: string;
        ipoType: string | null;
        filingDate: string;
        sourceUrl: string;
      }
    >();

    for (const row of rows) {
      const cells = [
        ...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
      ].map((cell) => cleanText(cell[1]));

      if (cells.length < 4) continue;

      const companyName = cells[0];
      const issueType = cells[1].toLowerCase();
      const board = cells[2].toLowerCase();
      const filingDate = parseNseDate(cells[3]);

      if (
        !companyName ||
        !issueType.includes("ipo") ||
        !filingDate
      ) {
        continue;
      }

      let ipoType: string | null = null;

      if (board.includes("sme")) {
        ipoType = "SME";
      } else if (board.includes("main")) {
        ipoType = "Mainboard";
      }

      const links = [
        ...row.matchAll(
          /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi
        ),
      ];

      let sourceUrl = NSE_URL;

      for (const link of links) {
        try {
          const url = new URL(link[1], NSE_URL);

          if (NSE_HOSTS.includes(url.hostname)) {
            sourceUrl = url.href;
            break;
          }
        } catch {
          continue;
        }
      }

      const key = `${companyName}|${filingDate}`;

      filings.set(key, {
        companyName,
        ipoType,
        filingDate,
        sourceUrl,
      });
    }

    if (filings.size === 0) {
      throw new Error(
        `No NSE records parsed. HTML length: ${html.length}; rows found: ${rows.length}. NSE page structure needs verification.`
      );
    }

    let detected = 0;
    let inserted = 0;
    let duplicates = 0;

    for (const filing of filings.values()) {
      detected++;

      const contentHash = createHash("sha256")
        .update(
          `NSE|${filing.companyName}|${filing.filingDate}`
        )
        .digest("hex");

      const { error } = await supabaseAdmin
        .from("ipo_import_queue")
        .insert({
          source_name: "NSE",
          source_url: filing.sourceUrl,
          external_id: contentHash,
          company_name: filing.companyName,
          ipo_type: filing.ipoType,
          drhp_filed_date: filing.filingDate,
          detected_status: "drhp_filed",
          raw_payload: {
            company_name: filing.companyName,
            filing_date: filing.filingDate,
            ipo_type: filing.ipoType,
            source_url: filing.sourceUrl,
            source: "NSE",
          },
          content_hash: contentHash,
          review_status: "pending",
          collected_at: new Date().toISOString(),
        });

      if (error?.code === "23505") {
        duplicates++;
        continue;
      }

      if (error) {
        throw new Error(
          `IPO queue insert failed: ${error.message}`
        );
      }

      inserted++;
    }

    const message =
      `Detected: ${detected}, Inserted: ${inserted}, Duplicates: ${duplicates}`;

    await writeLog("success", message);

    return NextResponse.json(
      {
        success: true,
        source: "NSE",
        detected,
        inserted,
        duplicates,
        review_status: "pending",
        message,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown collection error";

    console.error("NSE IPO collection failed:", message);

    await writeLog("failed", message);

    return NextResponse.json(
      {
        success: false,
        error: "NSE IPO collection failed. Check server logs.",
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
