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
    return (
      url.protocol === "https:" &&
      url.hostname === NSE_HOST
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
    signal: AbortSignal.timeout(10000),
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

      if (isNseUrl(url) && /\.js(?:[?#]|$)/i.test(url)) {
        urls.add(url);
      }
    } catch {
      // Ignore invalid URLs.
    }
  }

  return Array.from(urls).slice(0, 20);
}

function extractContexts(
  source: string,
  terms: string[],
  sourceName: string,
  maxPerTerm = 3
) {
  const results: string[] = [];
  const lower = source.toLowerCase();

  for (const term of terms) {
    const search = term.toLowerCase();
    let position = 0;
    let count = 0;

    while (count < maxPerTerm) {
      const index = lower.indexOf(search, position);

      if (index === -1) break;

      results.push(
        `SOURCE: ${sourceName}\n` +
        `MATCH: ${term}\n` +
        `POSITION: ${index}\n\n` +
        source.slice(
          Math.max(0, index - 1200),
          Math.min(source.length, index + 2800)
        )
      );

      position = index + search.length;
      count++;
    }
  }

  return results.slice(0, 40);
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

    const htmlContexts = extractContexts(
      html,
      [
        "cr_equity_archives_mii_security_file_nse",
        "CM - MII - Security File",
        "NSE Listed securities",
        "class=\"download\"",
        "class='download'",
        "reportsDownload",
      ],
      "NSE ALL REPORTS HTML",
      5
    );

    const scriptUrls = extractScriptUrls(html);

    const scriptResults = await Promise.all(
      scriptUrls.map(async (url) => {
        try {
          const source = await fetchText(url);

          const contexts = extractContexts(
            source,
            [
              "cr_equity_archives_mii_security_file_nse",
              "genDownloadLink",
              "SingledownloadReports",
              "downloadReports",
              ".download",
              "reportsDownload",
              "data-link",
              "fileURLs",
              "api/zipem",
              "ajax",
            ],
            url,
            3
          );

          return {
            url,
            success: true,
            length: source.length,
            contexts,
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

    const scriptContexts = scriptResults
      .flatMap((item) => item.contexts)
      .slice(0, 40);

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_NSE_SECURITY_MASTER_INSPECTION_V6",
      pageLength: html.length,
      htmlMatchCount: htmlContexts.length,
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
        contextMatches: item.contexts.length,
        error: item.error ?? null,
      })),
      htmlContexts,
      scriptContexts,
      databaseWrites: 0,
      filesDownloaded: 0,
      note:
        "NSE report HTML and JavaScript inspected only. No download endpoint called, no files downloaded and no database records modified.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown NSE inspection error.";

    console.error("NSE V6 inspection failed:", message);

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
