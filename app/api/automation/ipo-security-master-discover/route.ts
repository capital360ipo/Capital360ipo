import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_PAGE = "https://www.nseindia.com/all-reports";
const NSE_HOST = "www.nseindia.com";

const TARGET_SCRIPTS = [
  "https://www.nseindia.com/assets/js/nse-min.js?v=06112026",
  "https://www.nseindia.com/dist/js/components/quick-links.js?v=06112026",
];

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
    signal: AbortSignal.timeout(15000),
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

function extractContexts(source: string, sourceName: string) {
  const terms = [
    "SingledownloadReports",
    "downloadReports",
    "genDownloadLink",
    "api/zipem",
    "fileURLs",
    "function SingledownloadReports",
    "function downloadReports",
    "window.SingledownloadReports",
    "SingledownloadReports =",
    "downloadReports =",
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

    while (count < 12) {
      const index = lower.indexOf(search, position);

      if (index === -1) break;

      matches.push({
        term,
        position: index,
      });

      position = index + search.length;
      count++;
    }
  }

  matches.sort((a, b) => a.position - b.position);

  const results: string[] = [];
  let lastEnd = -1;

  for (const match of matches) {
    const start = Math.max(0, match.position - 1200);
    const end = Math.min(source.length, match.position + 3000);

    if (start < lastEnd - 300) continue;

    results.push(
      `SOURCE: ${sourceName}\n` +
        `MATCH: ${match.term}\n` +
        `POSITION: ${match.position}\n\n` +
        source.slice(start, end)
    );

    lastEnd = end;

    if (results.length >= 30) break;
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
    // Confirm the NSE report page is reachable.
    const html = await fetchText(NSE_PAGE);

    if (html.length < 1000) {
      throw new Error("NSE returned an incomplete report page.");
    }

    const scriptResults = await Promise.all(
      TARGET_SCRIPTS.map(async (url) => {
        try {
          const source = await fetchText(url);

          if (source.length < 1000) {
            throw new Error("Script appears incomplete.");
          }

          return {
            url,
            success: true,
            length: source.length,
            contexts: extractContexts(source, url),
            error: null,
          };
        } catch (error) {
          return {
            url,
            success: false,
            length: 0,
            contexts: [],
            error:
              error instanceof Error
                ? error.message
                : "Script inspection failed.",
          };
        }
      })
    );

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_NSE_SECURITY_MASTER_INSPECTION_V8",
      pageLength: html.length,
      scriptsInspected: scriptResults.length,
      scriptsFetched: scriptResults.filter(
        (item) => item.success
      ).length,
      scriptsFailed: scriptResults.filter(
        (item) => !item.success
      ).length,
      scriptInventory: scriptResults.map((item) => ({
        url: item.url,
        success: item.success,
        length: item.length,
        matches: item.contexts.length,
        error: item.error,
      })),
      scriptContexts: scriptResults.flatMap(
        (item) => item.contexts
      ),
      databaseWrites: 0,
      filesDownloaded: 0,
      note:
        "Only two NSE JavaScript files were inspected. No download endpoint was called, no files were downloaded and no database records were modified.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown NSE V8 inspection error.";

    console.error("NSE V8 inspection failed:", message);

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
