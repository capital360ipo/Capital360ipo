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

    if (Number.isNaN(date.getTime())) continue;

    const isoDate = date.toISOString().slice(0, 10);

    // Reject impossible calendar dates.
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(match[0]) &&
      isoDate !== match[0]
    ) {
      continue;
    }

    return isoDate;
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
    SEBI_HOSTS.includes(url.hostname) &&
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

      let queueId: string;

      const { data: newQueueRecord, error: queueError } =
        await supabaseAdmin
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
            content_hash: queueHash,
            review_status: "pending",
            collected_at: new Date().toISOString(),
          })
          .select("id")
          .single();

      if (queueError?.code === "23505") {
        duplicates++;

        const { data: existingRecord, error: lookupError } =
          await supabaseAdmin
            .from("ipo_import_queue")
            .select("id")
            .eq("source_name", "SEBI")
            .eq("content_hash", queueHash)
            .maybeSingle();

        if (lookupError || !existingRecord) {
          throw new Error(
            "Could not find the existing SEBI queue record."
          );
        }

        queueId = existingRecord.id;
      } else if (queueError || !newQueueRecord) {
        throw new Error("IPO queue insert failed.");
      } else {
        inserted++;
        queueId = newQueueRecord.id;
      }

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

      const { data: evidenceData, error: evidenceError } =
        await supabaseAdmin
          .from("ipo_source_evidence")
          .upsert(
            {
              queue_id: queueId,
              source_name: "SEBI",
              source_url: filing.sourceUrl,
              evidence_type: "drhp_filing_listing",
              field_name: "drhp_filed_date",
              field_value: filing.filingDate,
              issuer_name: filing.companyName,
              is_official_source: true,
              validation_status: "unverified",
              content_hash: evidenceHash,
              observed_at: new Date().toISOString(),
              metadata: {
                title: filing.title,
                listing_page: SEBI_URL,
                evidence_scope:
                  "SEBI listing entry detected; document contents not independently validated.",
              },
            },
            {
              onConflict: "queue_id,evidence_type,content_hash",
              ignoreDuplicates: true,
            }
          )
          .select("id");

      if (evidenceError) {
        throw new Error("SEBI source evidence could not be saved.");
      }

      if (evidenceData && evidenceData.length > 0) {
        evidenceInserted += evidenceData.length;
      } else {
        evidenceDuplicates++;
      }
    }

    const collectionMessage =
      `Detected: ${detected}, Inserted: ${inserted}, ` +
      `Duplicates: ${duplicates}, Evidence inserted: ${evidenceInserted}, ` +
      `Evidence duplicates: ${evidenceDuplicates}`;

    // Matching is a separate read-only dry run.
    let matchingResult = null;
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

    // Collection success is logged independently of matching.
    await writeLog(
      "SEBI IPO DRHP Collection",
      "success",
      collectionMessage
    );

    const matchingStatus = matchingError
      ? "failed"
      : "completed";

    return NextResponse.json(
      {
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
          status: matchingStatus,
          mode: "dry_run",
          result: matchingResult,
          error: matchingError,
        },
        review_status: "pending",
        evidence_status: "unverified",
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

    await writeLog(
      "SEBI IPO DRHP Collection",
      "failed",
      message
    );

    return NextResponse.json(
      {
        success: false,
        status: "failed",
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

    // Browser manual requests must include the exact same origin.
    if (!origin || origin !== request.nextUrl.origin) {
      return NextResponse.json(
        { success: false, error: "Invalid request origin." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const auth = await requireApiRole(["owner", "admin"]);

    if (!auth.authorized) {
      return auth.response;
    }

    return await collectIpos();
  } catch (error) {
    console.error("Manual IPO collection authorization failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to authorize collection request.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
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
      { success: false, error: "Unauthorized cron request." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  return await collectIpos();
}
