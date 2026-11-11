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

function isNseUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === NSE_HOST
    );
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
    signal: AbortSignal.timeout(8000),
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

function extractScriptUrls(html: string) {
  const tags = html.match(/<script\b[^>]*>/gi) || [];
  const urls = new Set<string>();

  for (const tag of tags) {
    const match = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);

    if (!match) continue;

    try {
      const url = new URL(match[1], NSE_PAGE).toString();

      if (
        isNseUrl(url) &&
        /\.js(?:[?#]|$)/i.test(url)
      ) {
        urls.add(url);
      }
    } catch {
      // Ignore invalid script URLs.
    }
  }

  const priority = (url: string) => {
    const name = url.toLowerCase();

    if (name.includes("all-reports")) return 0;
    if (name.includes("report")) return 1;
    if (name.includes("download")) return 2;
    if (name.includes("common") || name.includes("global")) return 3;
    if (name.includes("main") || name.includes("bundle")) return 4;

    return 5;
  };

  return Array.from(urls)
    .sort((a, b) => priority(a) - priority(b))
    .slice(0, 20);
}

function extractFunctionContexts(
  source: string,
  sourceName: string
) {
  const terms = [
    "SingledownloadReports",
    "downloadReports",
    "function SingledownloadReports",
    "function downloadReports",
    "window.SingledownloadReports",
    "window.downloadReports",
    "filePath",
    "fileName",
    "downloadUrl",
    "fileUrl",
    "reportDownload",
    "ajax",
  ];

  const lower = source.toLowerCase();
  const results: string[] = [];

  for (const term of terms) {
    const search = term.toLowerCase();
    let position = 0;
    let count = 0;

    while (count < 3) {
      const index = lower.indexOf(search, position);

      if (index === -1) break;

      results.push(
        `FILE: ${sourceName}\n` +
        `MATCH: ${term}\n` +
        `POSITION: ${index}\n` +
        source.slice(
          Math.max(0, index - 900),
          Math.min(source.length, index + 2200)
        )
      );

      position = index + search.length;
      count++;
    }
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

    const scriptUrls = extractScriptUrls(html);

    if (scriptUrls.length === 0) {
      throw new Error("No official NSE JavaScript files found.");
    }

    const scriptResults = await Promise.all(
      scriptUrls.map(async (url) => {
        try {
          const source = await fetchText(url);

          return {
            url,
            success: true,
            length: source.length,
            contexts: extractFunctionContexts(source, url),
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
                : "Script inspection failed",
          };
        }
      })
    );

    const allContexts = scriptResults
      .flatMap((item) => item.contexts)
      .slice(0, 35);

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_NSE_SCRIPT_SCAN_V5",
      pageLength: html.length,
      scriptsDiscovered: scriptUrls.length,
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
        error: item.error ?? null,
        functionMatches: item.contexts.length,
      })),
      functionMatchCount: allContexts.length,
      functionContexts: allContexts,
      databaseWrites: 0,
      filesDownloaded: 0,
      note:
        "Official NSE JavaScript files inspected only. No security master file downloaded and no database records modified.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown NSE script inspection error";

    console.error("NSE V5 inspection failed:", message);

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
