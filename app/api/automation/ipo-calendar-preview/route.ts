import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = [
  {
    name: "BSE_MAINBOARD",
    url: "https://www.bseindia.com/markets/PublicIssues/IPOIssues_new.aspx?id=1&Type=p",
  },
  {
    name: "BSE_SME",
    url: "https://www.bsesme.com/PublicIssues/SMEIPODRHP.aspx",
  },
  {
    name: "ICICI_IPO_CALENDAR",
    url: "https://www.icicidirect.com/ipo",
  },
  {
    name: "GROWW_UPCOMING",
    url: "https://groww.in/ipo/upcoming",
  },
] as const;

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function cleanHtml(value: string): string {
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
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractRows(html: string) {
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

  return rows
    .map((row) => {
      const cells = row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];

      return cells
        .map((cell) => cleanHtml(cell))
        .filter(Boolean);
    })
    .filter((cells) => cells.length >= 2)
    .slice(0, 15);
}

async function inspectSource(source: (typeof SOURCES)[number]) {
  try {
    const response = await fetch(source.url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
      },
    });

    if (!response.ok) {
      return {
        source: source.name,
        success: false,
        httpStatus: response.status,
        detectedRows: 0,
        sampleRows: [],
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();

    if (!html || html.length > 5 * 1024 * 1024) {
      return {
        source: source.name,
        success: false,
        httpStatus: response.status,
        detectedRows: 0,
        sampleRows: [],
        error: "Empty or oversized response",
      };
    }

    const rows = extractRows(html);

    return {
      source: source.name,
      success: true,
      httpStatus: response.status,
      contentType: response.headers.get("content-type"),
      htmlLength: html.length,
      detectedRows: rows.length,
      sampleRows: rows,
      pageContainsUpcoming:
        /upcoming|public issue|ipo issues/i.test(cleanHtml(html)),
      message:
        "Read-only source inspection. No records saved.",
    };
  } catch (error) {
    return {
      source: source.name,
      success: false,
      httpStatus: null,
      detectedRows: 0,
      sampleRows: [],
      error:
        error instanceof Error
          ? error.message
          : "Unknown source error",
    };
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

  const results = await Promise.all(
    SOURCES.map((source) => inspectSource(source))
  );

  return jsonResponse({
    success: true,
    mode: "READ_ONLY_SOURCE_DISCOVERY",
    sourcesChecked: results.length,
    successfulSources: results.filter((item) => item.success).length,
    totalDetectedRows: results.reduce(
      (total, item) => total + item.detectedRows,
      0
    ),
    databaseWrites: 0,
    automaticPublication: false,
    results,
    message:
      "Source inspection completed. No database records were changed.",
  });
}
