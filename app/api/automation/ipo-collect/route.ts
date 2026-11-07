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
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNseDate(value: string): string | null {
  const numeric = value.match(
    /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/
  );

  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date.toISOString().slice(0, 10);
    }
  }

  const named = value.match(
    /\b(\d{1,2})[-\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s,]+(\d{4})\b/i
  );

  if (named) {
    const date = new Date(
      `${named[2]} ${named[1]}, ${named[3]} UTC`
    );

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
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
    console.error("NSE log error:", error.message);
  }
}

export async function POST() {
  try {
    // 1. Authentication.
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

    // 2. Owner/Admin permission.
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

    // 3. Fetch official NSE page.
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

    // 4. Parse IPO table rows.
    const rows =
      html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const records = new Map<
      string,
      {
        companyName: string;
        ipoType: string;
        filingDate: string;
        sourceUrl: string;
        board: string;
      }
    >();

    for (const row of rows) {
      const cells = [
        ...row.matchAll(
          /<td\b[^>]*>([\s\S]*?)<\/td>/gi
        ),
      ].map((cell) => cleanText(cell[1]));

      if (cells.length < 4) continue;

      const companyName = cells[0];
      const issueType = cells[1].toLowerCase();
      const board = cells[2];

      // Only IPO records.
      if (!issueType.includes("ipo")) continue;

      let ipoType: string;

      if (/sme/i.test(board)) {
        ipoType = "SME";
      } else if (/main\s*board/i.test(board)) {
        ipoType = "Mainboard";
      } else {
        continue;
      }

      // Column 4: Draft Offer Document Date.
      const filingDate = parseNseDate(cells[3]);

      if (!filingDate || filingDate < cutoffDate) {
        continue;
      }

      if (
        !companyName ||
        companyName.length < 3 ||
        /^(name of the company|archives)$/i.test(companyName)
      ) {
        continue;
      }

      // Prefer an official NSE PDF link when available.
      let sourceUrl = NSE_URL;

      const links = [
        ...row.matchAll(
          /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi
        ),
      ];

      for (const link of links) {
        try {
          const url = new URL(link[1], NSE_URL);

          if (
            NSE_HOSTS.includes(url.hostname) &&
            /\.pdf(?:$|\?)/i.test(url.href)
          ) {
            sourceUrl = url.href;
            break;
          }
        } catch {
          continue;
        }
      }

      const recordKey =
        `${companyName.toLowerCase()}|${filingDate}`;

      records.set(recordKey, {
        companyName,
        ipoType,
        filingDate,
        sourceUrl,
        board,
      });
    }

    if (records.size === 0) {
      throw new Error(
        `No recent NSE IPO records parsed. Rows: ${rows.length}, HTML length: ${html.length}.`
      );
    }

    // 5. Insert records into review queue.
    let detected = 0;
    let inserted = 0;
    let duplicates = 0;

    for (const record of records.values()) {
      detected++;

      const externalId =
        `NSE:${record.companyName.toLowerCase()}:${record.filingDate}`;

      const contentHash = createHash("sha256")
        .update(externalId)
        .digest("hex");

      const { error } = await supabaseAdmin
        .from("ipo_import_queue")
        .insert({
          source_name: "NSE",
          source_url: record.sourceUrl,
          external_id: externalId,
          company_name: record.companyName,
          ipo_type: record.ipoType,
          drhp_filed_date: record.filingDate,
          detected_status: "drhp_filed",
          raw_payload: {
            company_name: record.companyName,
            issue_type: "IPO",
            board: record.board,
            filing_date: record.filingDate,
            source: "NSE",
            source_url: record.sourceUrl,
            source_stage: "Draft Offer Document Date",
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
          `NSE queue insert failed: ${error.message}`
        );
      }

      inserted++;
    }

    // 6. Log result.
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
        : "Unknown NSE collection error";

    console.error("NSE IPO collection failed:", message);

    await writeLog("failed", message);

    return NextResponse.json(
      {
        success: false,
        error: "NSE collection failed. Check server logs.",
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
