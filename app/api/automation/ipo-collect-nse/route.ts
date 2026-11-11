import "server-only";

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";
import { runIpoMatching } from "@/lib/run-ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_URL =
  "https://www.nseindia.com/companies-listing/corporate-public-issue-advertisements";

const NSE_HOSTS = new Set(["www.nseindia.com", "nseindia.com"]);

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

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
    .replace(/\s+/g, " ")
    .trim();
}

function validDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseNseDate(value: string): string | null {
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4,
    may: 5, jun: 6, jul: 7, aug: 8,
    sep: 9, oct: 10, nov: 11, dec: 12,
  };

  const numeric = value.match(
    /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/
  );

  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);

    if (!validDate(year, month, day)) return null;

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const named = value.match(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i
  );

  if (named) {
    const day = Number(named[1]);
    const month = months[named[2].slice(0, 3).toLowerCase()];
    const year = Number(named[3]);

    if (!validDate(year, month, day)) return null;

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function getNseSourceUrl(href: string): string | null {
  try {
    const url = new URL(href, NSE_URL);

    if (
      url.protocol !== "https:" ||
      !NSE_HOSTS.has(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
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

async function collectIpos() {
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

  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

  const filings = new Map<
    string,
    {
      companyName: string;
      ipoType: string | null;
      filingDate: string;
      sourceUrl: string;
      boardType: string;
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
      companyName.length < 3 ||
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

    // If an attachment link exists, it must pass NSE host validation.
    // If no link exists, retain the official NSE listing page as the source.
    let sourceUrl = NSE_URL;

    if (links.length > 0) {
      const validatedUrl = getNseSourceUrl(links[0][1]);

      if (!validatedUrl) {
        console.warn(
          "Skipping NSE record with an invalid source URL:",
          companyName
        );
        continue;
      }

      sourceUrl = validatedUrl;
    }

    const key = `${companyName}|${filingDate}|${ipoType ?? "unknown"}`;

    filings.set(key, {
      companyName,
      ipoType,
      filingDate,
      sourceUrl,
      boardType: cells[2],
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
  let evidenceInserted = 0;
  let evidenceDuplicates = 0;

  for (const filing of filings.values()) {
    detected++;

    const contentHash = createHash("sha256")
      .update(
        `NSE|${filing.companyName}|${filing.filingDate}|${filing.ipoType ?? ""}`
      )
      .digest("hex");

    const collectedAt = new Date().toISOString();

    const queuePayload = {
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
        board_type: filing.boardType,
        source_url: filing.sourceUrl,
        source: "NSE",
      },
      content_hash: contentHash,
      review_status: "pending",
      collected_at: collectedAt,
    };

    const evidencePayload = {
      source_name: "NSE",
      source_url: filing.sourceUrl,
      evidence_type: "nse_csv_filing_record",
      field_name: "drhp_filed_date",
      field_value: filing.filingDate,
      issuer_name: filing.companyName,
      is_official_source: true,
      content_hash: contentHash,
      observed_at: collectedAt,
      metadata: {
        evidence_scope: "NSE public issue advertisement filing",
        board_type: filing.boardType,
        issue_type: filing.ipoType,
        related_date_column: "filing_date",
        related_date_value: filing.filingDate,
        review_status: "pending_manual_review",
      },
    };

    // One database function call saves queue + evidence atomically.
    const { data, error } = await supabaseAdmin.rpc(
      "save_ipo_collection_record",
      {
        p_queue: queuePayload,
        p_evidence: evidencePayload,
      }
    );

    if (error) {
      throw new Error(
        `NSE atomic collection failed for ${filing.companyName}: ${error.message}`
      );
    }

    const result = data as AtomicSaveResult | null;

    if (
      !result ||
      result.success !== true ||
      !result.queue_id
    ) {
      throw new Error(
        `NSE atomic RPC returned an invalid result for ${filing.companyName}.`
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

  return {
    detected,
    inserted,
    duplicates,
    evidenceInserted,
    evidenceDuplicates,
  };
}

async function handleCollection() {
  try {
    const collection = await collectIpos();

    let matching: {
      success: boolean;
      mode?: string;
      result?: unknown;
      error?: string;
    };

    try {
      const result = await runIpoMatching();

      matching = {
        success: true,
        mode: "dry_run",
        result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Matching failed";

      console.error("NSE matching dry run failed:", message);
      await writeLog("failed", `Matching Dry Run failed: ${message}`);

      matching = {
        success: false,
        error: message,
      };
    }

    const message =
      `Detected: ${collection.detected}, Inserted: ${collection.inserted}, Duplicates: ${collection.duplicates}, Evidence inserted: ${collection.evidenceInserted}, Evidence duplicates: ${collection.evidenceDuplicates}`;

    await writeLog("success", message);

    return jsonResponse({
      success: true,
      status: matching.success ? "success" : "partial_success",
      source: "NSE",

      // Backward-compatible dashboard fields
      detected: collection.detected,
      inserted: collection.inserted,
      duplicates: collection.duplicates,

      // Detailed collection result
      collection: {
        success: true,
        ...collection,
        review_status: "pending",
        evidence_status: "unverified",
      },

      // Matching is read-only; it does not approve or publish IPOs
      matching,
      message,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown collection error";

    console.error("NSE IPO collection failed:", message);
    await writeLog("failed", message);

    return jsonResponse(
      {
        success: false,
        source: "NSE",
        error: "NSE IPO collection failed. Check server logs.",
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
