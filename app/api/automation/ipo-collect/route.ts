
import "server-only";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
  return title
    .replace(/\s*[-–—:]\s*Draft Red Herring.*$/i, "")
    .replace(/\s*[-–—:]\s*UDRHP(?:[-\s]*I{1,2})?.*$/i, "")
    .replace(/\s*[-–—:]\s*DRHP.*$/i, "")
    .replace(/\s*[-–—:]\s*Addendum.*$/i, "")
    .replace(/\s*[-–—:]\s*Corrigendum.*$/i, "")
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

export async function POST() {
  try {
    // 1. Verify login.
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

    // 2. Only Owner/Admin can run the collector.
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

    // 3. Fetch official SEBI public issues page.
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
      throw new Error(
        `SEBI returned HTTP ${response.status}`
      );
    }

    const html = await response.text();

    if (!html || html.length < 500) {
      throw new Error("SEBI returned an empty or incomplete page.");
    }

    // 4. Parse SEBI listing rows.
    // The listing contains a date and one or more title links per row.
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

        if (!isValidFilingTitle(title)) {
          continue;
        }

        const companyName = extractCompanyName(title);

        if (!companyName || companyName.length < 3) {
          continue;
        }

        let sourceUrl: URL;

        try {
          sourceUrl = new URL(link[1], SEBI_URL);
        } catch {
          continue;
        }

        if (!SEBI_HOSTS.includes(sourceUrl.hostname)) {
          continue;
        }

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
        `No DRHP records parsed. HTML length: ${html.length}; rows found: ${rows.length}. SEBI response format needs review.`
      );
    }

    // 5. Insert detected filings into the review queue.
    let detected = 0;
    let inserted = 0;
    let duplicates = 0;

    for (const filing of filings.values()) {
      detected++;

      // URL-based hash prevents the same filing being added again.
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
        throw new Error(
          `IPO queue insert failed: ${error.message}`
        );
      }

      inserted++;
    }

    // 6. Save collection result.
    const message =
      `Detected: ${detected}, Inserted: ${inserted}, Duplicates: ${duplicates}`;

    await writeLog("success", message);

    return NextResponse.json(
      {
        success: true,
        source: "SEBI",
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

    console.error("IPO collection failed:", message);

    await writeLog("failed", message);

    return NextResponse.json(
      {
        success: false,
        error: "IPO collection failed. Check server logs.",
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
