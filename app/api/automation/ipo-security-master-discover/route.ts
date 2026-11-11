import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_PAGE = "https://www.nseindia.com/all-reports";
const NSE_HOST = "www.nseindia.com";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: NSE_PAGE,
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function fetchText(url: string) {
  const parsed = new URL(url);

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== NSE_HOST
  ) {
    throw new Error("Blocked non-NSE resource.");
  }

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(25000),
    headers: HEADERS,
  });

  if (!response.ok) {
    throw new Error(`NSE returned HTTP ${response.status}`);
  }

  const text = await response.text();

  if (!text) {
    throw new Error("NSE returned an empty response.");
  }

  return text;
}

function findScriptUrl(html: string) {
  const tags = html.match(/<script\b[^>]*>/gi) || [];

  for (const tag of tags) {
    if (!/all-reports\.js/i.test(tag)) continue;

    const match = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);

    if (!match) continue;

    return new URL(match[1], NSE_PAGE).toString();
  }

  return null;
}

function extractLastContexts(
  source: string,
  terms: string[],
  maxPerTerm = 4
) {
  const results: string[] = [];
  const lowerSource = source.toLowerCase();

  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    const positions: number[] = [];
    let position = 0;

    while (true) {
      const index = lowerSource.indexOf(lowerTerm, position);

      if (index === -1) break;

      positions.push(index);
      position = index + lowerTerm.length;
    }

    for (const index of positions.slice(-maxPerTerm)) {
      results.push(
        `MATCH: ${term} | Position: ${index}\n` +
          source.slice(
            Math.max(0, index - 1200),
            Math.min(source.length, index + 3000)
          )
      );
    }
  }

  return results.slice(0, 30);
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

  try {
    const html = await fetchText(NSE_PAGE);

    if (html.length < 1000) {
      throw new Error("NSE returned an incomplete page.");
    }

    const scriptUrl = findScriptUrl(html);

    if (!scriptUrl) {
      throw new Error(
        "NSE all-reports JavaScript reference was not found."
      );
    }

    const script = await fetchText(scriptUrl);

    const htmlContexts = extractLastContexts(html, [
      "cr_equity_archives_mii_security_file_nse",
      "cr_equity_archives_mii_security_file_nse_bse",
    ]);

    const scriptContexts = extractLastContexts(script, [
      "SingledownloadReports",
      "function SingledownloadReports",
      "downloadReports",
      "function downloadReports",
      "filePath",
      "fileName",
      "downloadUrl",
      "fileUrl",
      "reportDownload",
      "XMLHttpRequest",
      "$.ajax",
      "fetch(",
    ], 5);

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_FUNCTION_INSPECTION_V4",
      pageLength: html.length,
      scriptLength: script.length,
      scriptUrl,
      htmlButtonMatches: htmlContexts.length,
      scriptReferenceMatches: scriptContexts.length,
      htmlContexts,
      scriptContexts,
      databaseWrites: 0,
      filesDownloaded: 0,
      note:
        "NSE download-function references inspected only. No files downloaded and no database records modified.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown NSE function inspection error";

    console.error("NSE function inspection failed:", message);

    return jsonResponse(
      {
        success: false,
        error: message,
        databaseWrites: 0,
        filesDownloaded: 0,
      },
      502
    );
  }
}
