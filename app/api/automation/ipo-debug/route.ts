
import "server-only";

import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEBI_URL =
  "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=10&ssid=15";

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

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    const auth = await requireApiRole(["owner", "admin"]);

    if (!auth.authorized) {
      return auth.response;
    }

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
      return jsonResponse({
        success: false,
        error: `SEBI HTTP ${response.status}`,
      }, 502);
    }

    const html = await response.text();

    if (!html || html.length < 500) {
      return jsonResponse({
        success: false,
        error: "SEBI returned an empty or incomplete page.",
      }, 502);
    }

    const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

    const keywords =
      /DRHP|UDRHP|RHP|RED HERRING|PROSPECTUS|PUBLIC ISSUE|DRAFT/i;

    const samples: {
      row_text: string;
      links: {
        title: string;
        url: string;
      }[];
    }[] = [];

    for (const row of rows) {
      const rowText = cleanText(row);

      const links = [
        ...row.matchAll(
          /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
        ),
      ];

      const parsedLinks = links.map((link) => {
        let url = "";

        try {
          const parsed = new URL(
            link[1].replace(/&amp;/gi, "&"),
            SEBI_URL
          );

          if (
            parsed.protocol === "https:" &&
            ["www.sebi.gov.in", "sebi.gov.in"].includes(parsed.hostname)
          ) {
            url = parsed.href;
          }
        } catch {
          // Invalid links are ignored.
        }

        return {
          title: cleanText(link[2]),
          url,
        };
      }).filter((link) => link.title || link.url);

      if (
        keywords.test(rowText) ||
        parsedLinks.some((link) => keywords.test(link.title))
      ) {
        samples.push({
          row_text: rowText.slice(0, 1500),
          links: parsedLinks.slice(0, 10),
        });
      }

      if (samples.length >= 60) break;
    }

    return jsonResponse({
      success: true,
      source: "SEBI",
      html_length: html.length,
      rows_found: rows.length,
      matching_rows: samples.length,
      samples,
      database_writes: 0,
      read_only: true,
    });
  } catch (error) {
    console.error("SEBI debug failed:", error);

    return jsonResponse({
      success: false,
      error: "SEBI debug request failed. Check server logs.",
    }, 500);
  }
}
