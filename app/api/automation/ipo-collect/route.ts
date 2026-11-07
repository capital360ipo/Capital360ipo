import "server-only";

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { runIpoMatching } from "@/lib/run-ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEBI_URL =
  "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=10&ssid=15";

const SEBI_HOSTS = ["www.sebi.gov.in", "sebi.gov.in"];

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

function parseDate(value: string): string | null {
  const patterns = [
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i,
    /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i,
    /\b\d{4}-\d{2}-\d{2}\b/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const date = new Date(match[0]);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  return null;
}

function extractCompanyName(title: string): string {
  return cleanText(title)
    .replace(
      /\s*[-–—:]\s*(?:draft\s+)?(?:abridged\s+)?(?:red\s+herring\s+)?prospectus\b[\s\S]*$/i,
      ""
    )
    .replace(
      /\s*[\[(]?\s*(?:U?DRHP|RHP)(?:[-\s]*I{1,3})?\s*[\])]?(?:\s*advertisement)?[\s\S]*$/i,
      ""
    )
    .replace(
      /\s*[-–—:]\s*(?:addendum|corrigendum).*$/i,
      ""
    )
    .trim();
}

function isValidFilingTitle(title: string): boolean {
  if (!/\b(?:U?DRHP)\b|Draft Red Herring/i.test(title)) {
    return false;
  }

  if (/addendum|corrigendum/i.test(title)) {
    return false;
  }

  return true;
}

async function writeLog(
  status: "success" | "failed",
  message: string
) {
  const { error } = await supabaseAdmin
    .from("automation_logs")
    .insert({
      task_name: "SEBI IPO DRHP Collection",
      status,
      message: message.slice(0, 500),
    });

  if (error) {
    console.error("Automation log insert failed:", error.message);
  }
}

async function collectIpos() {
  try {
    const response = await fetch(SEBI_URL, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Capital360IPO/1.0)",
        Accept: "text/html,application/xhtml+xml",
        Referer: "https://www.sebi.gov.in/",
      },
    });

    if (!response.ok) {
      throw new Error(`SEBI returned HTTP ${response.status}`);
    }

    const html = await response.text();

    if (!html || html.length < 500) {
      throw new Error("SEBI returned an empty or incomplete page.");
    }

    const rows =
      html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

    const filings = new Map<
      string,
      {
        companyName: string;
        title: string;
        filingDate: string;
        sourceUrl: string;
      }
    >();

    for (const row of rows) {
      const rowText = cleanText(row);
      const filingDate = parseDate(rowText);

      if (!filingDate) continue;

      const links = [
        ...row.matchAll(
          /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
        ),
      ];

      for (const link of links) {
        const title = cleanText(link[2]);

        if (!isValidFilingTitle(title)) continue;

        const companyName = extractCompanyName(title);

        if (!companyName || companyName.length < 3) continue;

        let sourceUrl: URL;

        try {
          sourceUrl = new URL(link[1], SEBI_URL);
        } catch {
          continue;
        }

        if (!SEBI_HOSTS.includes(sourceUrl.hostname)) continue;

        if (
          !sourceUrl.pathname.startsWith(
            "/filings/public-issues/"
          )
        ) {
          continue;
        }

        filings.set(sourceUrl.href, {
          companyName,
          title,
          filingDate,
          sourceUrl: sourceUrl.href,
        });
      }
    }

    if (filings.size === 0) {
      throw new Error(
        `No DRHP records parsed. HTML length: ${html.length}; rows found: ${rows.length}.`
      );
    }

    let detected = 0;
    let inserted = 0;
    let duplicates = 0;

    for (const filing of filings.values()) {
      detected++;

      const contentHash = createHash("sha256")
        .update(`SEBI|${filing.sourceUrl}`)
        .digest("hex");

      const { error } = await supabaseAdmin
        .from("ipo_import_queue")
        .insert({
          source_name: "SEBI",
          source_url: filing.sourceUrl,
          external_id: filing.sourceUrl,
          company_name: filing.companyName,
          ipo_type: null,
          drhp_filed_date: filing.filingDate,
          detected_status: "drhp_filed",
          raw_payload: {
            title: filing.title,
            filing_date: filing.filingDate,
            source_url: filing.sourceUrl,
            source: "SEBI",
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
        throw new Error("IPO queue insert failed.");
      }

      inserted++;
    }

    const collectionMessage =
      `Detected: ${detected}, Inserted: ${inserted}, Duplicates: ${duplicates}`;

    // Automatically run matching after successful collection.
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
        "Automatic IPO matching failed:",
        matchingError
      );

      await writeLog(
        "failed",
        `Automatic matching failed: ${matchingError}`
      );
    }

    await writeLog(
      "success",
      `${collectionMessage}. Matching: ${
        matchingError ? "failed" : "completed"
      }.`
    );

    return NextResponse.json(
      {
        success: true,
        source: "SEBI",
        detected,
        inserted,
        duplicates,
        matching: matchingResult,
        matchingError,
        review_status: "pending",
        message: collectionMessage,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown collection error";

    console.error("IPO collection failed:", message);

    await writeLog("failed", message);

    return NextResponse.json(
      {
        success: false,
        error: "IPO collection failed. Check server logs.",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

// Manual collection: Owner/Admin only.
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");

    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 }
      );
    }

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

    const { data: profile, error: profileError } =
      await supabase
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

    return await collectIpos();
  } catch (error) {
    console.error(
      "Manual IPO collection authorization failed:",
      error
    );

    return NextResponse.json(
      { error: "Unable to authorize collection request." },
      { status: 500 }
    );
  }
}

// Automatic collection: Vercel Cron only.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json(
      { error: "Unauthorized cron request." },
      { status: 401 }
    );
  }

  return await collectIpos();
}
