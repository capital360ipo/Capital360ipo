import "server-only";

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";
import { runIpoMatching } from "@/lib/run-ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEBI_URL =
  "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=10&ssid=15";

const SEBI_HOSTS = new Set(["www.sebi.gov.in", "sebi.gov.in"]);

type AtomicSaveResult = {
  success?: boolean;
  queue_id?: string;
  queue_inserted?: boolean;
  queue_duplicate?: boolean;
  evidence_inserted?: boolean;
  evidence_duplicate?: boolean;
  evidence_status?: string;
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
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function validDate(year: number, month: number, day: number): boolean {
  if (
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value: string): string | null {
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  // ISO format: YYYY-MM-DD
  const iso = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);

    if (validDate(year, month, day)) {
      return formatDate(year, month, day);
    }
  }

  // Month-first format: Jan 15, 2026
  const monthFirst = value.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i
  );

  if (monthFirst) {
    const month = months[monthFirst[1].slice(0, 3).toLowerCase()];
    const day = Number(monthFirst[2]);
    const year = Number(monthFirst[3]);

    if (validDate(year, month, day)) {
      return formatDate(year, month, day);
    }
  }

  // Day-first format: 15 Jan 2026
  const dayFirst = value.match(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i
  );

  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = months[dayFirst[2].slice(0, 3).toLowerCase()];
    const year = Number(dayFirst[3]);

    if (validDate(year, month, day)) {
      return formatDate(year, month, day);
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

function isValidSebiUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    SEBI_HOSTS.has(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.port &&
    url.pathname.startsWith("/filings/public-issues/")
  );
}

async function writeLog(
  taskName: string,
  status: "success" | "failed",
  message: string
) {
  const { error } = await supabaseAdmin
    .from("automation_logs")
    .insert({
      task_name: taskName,
      status,
      message: message.slice(0, 500),
    });

  if (error) {
    console.error(
      `Automation log failed (${taskName}):`,
      error.message
    );
  }
}

async function collectIpos() {
  try {
    const response = await fetch(SEBI_URL, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
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

        if (!isValidSebiUrl(sourceUrl)) continue;

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
    let evidenceInserted = 0;
    let evidenceDuplicates = 0;

    for (const filing of filings.values()) {
      detected++;

      const queueHash = createHash("sha256")
        .update(`SEBI|${filing.sourceUrl}`)
        .digest("hex");

      const evidenceHash = createHash("sha256")
        .update(
          [
            "SEBI",
            "DRHP_FILING_LISTING",
            filing.sourceUrl,
            filing.filingDate,
            filing.title,
          ].join("|")
        )
        .digest("hex");

      const collectedAt = new Date().toISOString();

      const queuePayload = {
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
        content_hash: queueHash,
        review_status: "pending",
        collected_at: collectedAt,
      };

      const evidencePayload = {
        source_name: "SEBI",
        source_url: filing.sourceUrl,
        evidence_type: "drhp_filing_listing",
        field_name: "drhp_filed_date",
        field_value: filing.filingDate,
        issuer_name: filing.companyName,
        is_official_source: true,
        content_hash: evidenceHash,
        observed_at: collectedAt,
        metadata: {
          title: filing.title,
          listing_page: SEBI_URL,
          evidence_scope:
            "SEBI listing entry detected; document contents not independently validated.",
        },
      };

      // Queue and evidence are saved in one atomic database transaction.
      const { data, error } = await supabaseAdmin.rpc(
        "save_ipo_collection_record",
        {
          p_queue: queuePayload,
          p_evidence: evidencePayload,
        }
      );

      if (error) {
        throw new Error(
          `SEBI atomic collection failed for ${filing.companyName}: ${error.message}`
        );
      }

      const result = data as AtomicSaveResult | null;

      if (
        !result ||
        result.success !== true ||
        !result.queue_id
      ) {
        throw new Error(
          `SEBI atomic RPC returned an invalid result for ${filing.companyName}.`
        );
      }

      if (result.queue_inserted === true) {
        inserted++;
      } else {
        duplicates++;
      }

      if (result.evidence_inserted === true) {
        evidenceInserted++;
      } else {
        evidenceDuplicates++;
      }
    }

    const collectionMessage =
      `Detected: ${detected}, Inserted: ${inserted}, ` +
      `Duplicates: ${duplicates}, Evidence inserted: ${evidenceInserted}, ` +
      `Evidence duplicates: ${evidenceDuplicates}`;

    // Matching remains a separate read-only operation.
    let matchingResult: unknown = null;
    let matchingError: string | null = null;

    try {
      matchingResult = await runIpoMatching();
    } catch (error) {
      matchingError =
        error instanceof Error
          ? error.message
          : "Unknown matching error";

      console.error("IPO matching dry run failed:", matchingError);

      await writeLog(
        "SEBI IPO Matching Dry Run",
        "failed",
        matchingError
      );
    }

    await writeLog(
      "SEBI IPO DRHP Collection",
      "success",
      collectionMessage
    );

    return jsonResponse({
      success: true,
      status: matchingError ? "partial_success" : "success",
      collection: {
        success: true,
        detected,
        inserted,
        duplicates,
        evidenceInserted,
        evidenceDuplicates,
        message: collectionMessage,
      },
      matching: {
        success: !matchingError,
        status: matchingError ? "failed" : "completed",
        mode: "dry_run",
        result: matchingResult,
        error: matchingError,
      },
      review_status: "pending",
      evidence_status: "unverified",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown collection error";

    console.error("IPO collection failed:", message);

    await writeLog(
      "SEBI IPO DRHP Collection",
      "failed",
      message
    );

    return jsonResponse(
      {
        success: false,
        status: "failed",
        error: "IPO collection failed. Check server logs.",
      },
      502
    );
  }
}

// Manual collection: Owner/Admin only.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return jsonResponse(
      { success: false, error: "Invalid request origin." },
      403
    );
  }

  try {
    const auth = await requireApiRole(["owner", "admin"]);

    if (!auth.authorized) {
      return auth.response;
    }

    return await collectIpos();
  } catch (error) {
    console.error("Manual IPO collection authorization failed:", error);

    return jsonResponse(
      {
        success: false,
        error: "Unable to authorize collection request.",
      },
      500
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
    return jsonResponse(
      { success: false, error: "Unauthorized cron request." },
      401
    );
  }

  return collectIpos();
}
