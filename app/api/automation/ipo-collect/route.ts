import "server-only";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEBI_URL =
  "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15";

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: string): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export async function POST() {
  try {
    // Authenticate the current user.
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

    // Verify Owner/Admin role.
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

    // Fetch official SEBI public issue filings.
    const response = await fetch(SEBI_URL, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        "User-Agent": "Capital360IPO/1.0",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      throw new Error(`SEBI source returned ${response.status}`);
    }

    const html = await response.text();

    const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

    let detected = 0;
    let inserted = 0;
    let duplicates = 0;

    for (const row of rows) {
      const cells = [
        ...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
      ];

      if (cells.length < 2) continue;

      const filingDate = parseDate(cleanText(cells[0][1]));

      if (!filingDate) continue;

      const titleCell = cells[1][1];

      const links = [
        ...titleCell.matchAll(
          /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
        ),
      ];

      for (const link of links) {
        const title = cleanText(link[2]);

        if (!/DRHP|Draft Red Herring/i.test(title)) {
          continue;
        }

        const companyName = title
          .replace(/[-–—:]?\s*DRHP.*$/i, "")
          .replace(/[-–—:]?\s*Draft Red Herring.*$/i, "")
          .trim();

        if (!companyName || companyName.length < 3) {
          continue;
        }

        const sourceUrl = new URL(link[1], SEBI_URL);

        if (sourceUrl.hostname !== "www.sebi.gov.in") {
          continue;
        }

        detected++;

        const contentHash = createHash("sha256")
          .update(
            `SEBI|${companyName.toLowerCase()}|${filingDate}|${sourceUrl.href}`
          )
          .digest("hex");

        const { error } = await supabaseAdmin
          .from("ipo_import_queue")
          .insert({
            source_name: "SEBI",
            source_url: sourceUrl.href,
            external_id: sourceUrl.href,
            company_name: companyName,
            ipo_type: null,
            drhp_filed_date: filingDate,
            detected_status: "drhp_filed",
            raw_payload: {
              title,
              filing_date: filingDate,
              source_url: sourceUrl.href,
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
          throw new Error(error.message);
        }

        inserted++;
      }
    }

    // Save successful automation log.
    const { error: successLogError } = await supabaseAdmin
      .from("automation_logs")
      .insert({
        task_name: "SEBI IPO DRHP Collection",
        status: "success",
        message: `Detected: ${detected}, Inserted: ${inserted}, Duplicates: ${duplicates}`,
      });

    if (successLogError) {
      console.error("Automation success log failed:", successLogError.message);
    }

    return NextResponse.json(
      {
        success: true,
        source: "SEBI",
        detected,
        inserted,
        duplicates,
        review_status: "pending",
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

    // Best-effort failure logging.
    try {
      const { error: logError } = await supabaseAdmin
        .from("automation_logs")
        .insert({
          task_name: "SEBI IPO DRHP Collection",
          status: "failed",
          message: message.slice(0, 500),
        });

      if (logError) {
        console.error("Automation failure log failed:", logError.message);
      }
    } catch (loggingError) {
      console.error("Automation logging exception:", loggingError);
    }

    console.error("IPO collection failed:", message);

    return NextResponse.json(
      { error: "IPO collection failed. Check server logs." },
      { status: 500 }
    );
  }
}
