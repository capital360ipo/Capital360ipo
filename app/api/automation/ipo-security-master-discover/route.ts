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

function isNseUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === NSE_HOST;
  } catch {
    return false;
  }
}

async function fetchText(url: string) {
  if (!isNseUrl(url)) {
    throw new Error("Blocked non-NSE resource.");
  }

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12000),
    headers: HEADERS,
  });

  if (!response.ok) {
    throw new Error(`NSE returned HTTP ${response.status}`);
  }

  const content = await response.text();

  if (!content) {
    throw new Error("NSE returned an empty response.");
  }

  return content;
}

function findAllReportsScript(html: string) {
  const tags = html.match(/<script\b[^>]*>/gi) || [];

  for (const tag of tags) {
    const match = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!match) continue;

    try {
      const url = new URL(match[1], NSE_PAGE).toString();

      if (
        isNseUrl(url) &&
        /\/all-reports\.js(?:[?#]|$)/i.test(url)
      ) {
        return url;
      }
    } catch {
      // Ignore invalid script URLs.
    }
  }

  return null;
}

function extractFocusedContexts(source: string) {
  const terms = [
    "cr_equity_archives_mii_security_file_nse",
    "SingledownloadReports",
    "downloadReports",
    "genDownloadLink",
    "api/zipem",
    "fileURLs",
    "reportsDownload",
    "function download",
    "function single",
    "window.open",
    "data-link",
  ];

  const lower = source.toLowerCase();
  const matches: Array<{
    term: string;
    position: number;
  }> = [];

  for (const term of terms) {
    const search = term.toLowerCase();
    let position = 0;
    let count = 0;

    while (count < 5) {
      const index = lower.indexOf(search, position);
      if (index === -1) break;

      matches.push({ term, position: index });
      position = index + search.length;
      count++;
    }
  }

  matches.sort((a, b) => a.position - b.position);

  const results: string[] = [];
  let lastEnd = -1;

  for (const match of matches) {
    const start = Math.max(0, match.position - 900);
    const end = Math.min(source.length, match.position + 2200);

    // Avoid returning the same surrounding code repeatedly.
    if (start < lastEnd - 250) continue;

    results.push(
      `SOURCE: NSE all-reports.js\n` +
        `MATCH: ${match.term}\n` +
        `POSITION: ${match.position}\n\n` +
        source.slice(start, end)
    );

    lastEnd = end;

    if (results.length >= 25) break;
  }

  return results;
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

    const scriptUrl = findAllReportsScript(html);

    if (!scriptUrl) {
      throw new Error(
        "NSE all-reports.js script was not found in the page."
      );
    }

    const source = await fetchText(scriptUrl);

    if (source.length < 1000) {
      throw new Error("NSE all-reports.js appears incomplete.");
    }

    const scriptContexts = extractFocusedContexts(source);

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_NSE_SECURITY_MASTER_INSPECTION_V7",
      pageLength: html.length,
      scriptUrl,
      scriptLength: source.length,
      focusedMatchCount: scriptContexts.length,
      scriptContexts,
      databaseWrites: 0,
      filesDownloaded: 0,
      note:
        "Only the NSE all-reports.js file was inspected for download functions and endpoint references. No download endpoint was called, no files were downloaded and no database records were modified.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown NSE V7 inspection error.";

    console.error("NSE V7 inspection failed:", message);

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
