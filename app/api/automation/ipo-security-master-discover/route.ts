
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_URL = "https://www.nseindia.com/all-reports";

const REPORTS_SCRIPT =
  "https://www.nseindia.com/dist/js/sections/all-reports.js?v=06112026";

const NSE_MIN_SCRIPT =
  "https://www.nseindia.com/assets/js/nse-min.js?v=06112026";

const MAX_SCRIPTS = 30;
const MAX_SCRIPT_SIZE = 2 * 1024 * 1024;
const MAX_TOTAL_SIZE = 12 * 1024 * 1024;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/javascript,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: NSE_URL,
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function fetchText(url: string, maxSize: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: HEADERS,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    const contentLength = Number(
      response.headers.get("content-length") || 0
    );

    if (contentLength > maxSize) {
      throw new Error("NSE resource exceeds inspection size limit.");
    }

    const text = await response.text();

    if (text.length > maxSize) {
      throw new Error("NSE response exceeds inspection size limit.");
    }

    return {
      ok: response.ok,
      status: response.status,
      length: text.length,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractContexts(
  source: string,
  terms: string[],
  before = 1200,
  after = 2200,
  maxResults = 12
) {
  const results: {
    term: string;
    position: number;
    context: string;
  }[] = [];

  const lower = source.toLowerCase();

  for (const term of terms) {
    const needle = term.toLowerCase();
    let position = 0;

    while (position < lower.length) {
      const found = lower.indexOf(needle, position);

      if (found === -1) break;

      results.push({
        term,
        position: found,
        context: source.slice(
          Math.max(0, found - before),
          Math.min(source.length, found + needle.length + after)
        ),
      });

      position = found + needle.length;

      if (results.length >= maxResults) return results;
    }
  }

  return results;
}

function getScriptUrls(html: string) {
  const urls = new Set<string>();
  const pattern = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    try {
      const url = new URL(match[1], NSE_URL);

      // Only inspect scripts hosted on the official NSE website.
      if (
        url.protocol === "https:" &&
        url.hostname === "www.nseindia.com"
      ) {
        urls.add(url.toString());
      }
    } catch {
      // Ignore malformed script references.
    }

    if (urls.size >= MAX_SCRIPTS) break;
  }

  urls.add(REPORTS_SCRIPT);
  urls.add(NSE_MIN_SCRIPT);

  return [...urls].slice(0, MAX_SCRIPTS);
}

function countTerms(source: string, terms: string[]) {
  const lower = source.toLowerCase();

  return terms.map((term) => {
    const needle = term.toLowerCase();
    let count = 0;
    let position = 0;
    const positions: number[] = [];

    while (position < lower.length) {
      const found = lower.indexOf(needle, position);

      if (found === -1) break;

      count++;

      if (positions.length < 12) {
        positions.push(found);
      }

      position = found + needle.length;
    }

    return { term, count, positions };
  });
}

async function inspectScripts(urls: string[]) {
  const results: {
    url: string;
    status: number | null;
    length: number;
    fetched: boolean;
    matches: ReturnType<typeof extractContexts>;
    error?: string;
  }[] = [];

  let totalSize = 0;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < urls.length) {
      const index = nextIndex++;
      const url = urls[index];

      if (totalSize >= MAX_TOTAL_SIZE) {
        results[index] = {
          url,
          status: null,
          length: 0,
          fetched: false,
          matches: [],
          error: "Total inspection size limit reached.",
        };
        continue;
      }

      try {
        const remaining = MAX_TOTAL_SIZE - totalSize;
        const maxSize = Math.min(MAX_SCRIPT_SIZE, remaining);

        const response = await fetchText(url, maxSize);
        totalSize += response.length;

        const matches = response.ok
          ? extractContexts(
              response.text,
              [
                "ReportCard",
                "report-card",
                "reportcard",
                "filePath",
                "fileActlName",
                "item.filePath",
                "reportData",
                "reportsData",
                "reportList",
                "ReportCard(",
                "instantiate('ReportCard'",
                'instantiate("ReportCard"',
                "cr_equity_archives_mii_security_file_nse",
              ],
              1500,
              2500,
              8
            )
          : [];

        results[index] = {
          url,
          status: response.status,
          length: response.length,
          fetched: true,
          matches,
        };
      } catch (error) {
        results[index] = {
          url,
          status: null,
          length: 0,
          fetched: false,
          matches: [],
          error:
            error instanceof Error
              ? error.message
              : "Script inspection failed.",
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(4, urls.length) },
      () => worker()
    )
  );

  return {
    scripts: results,
    totalSize,
  };
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");

    if (origin !== request.nextUrl.origin) {
      return jsonResponse(
        { success: false, error: "Invalid request origin." },
        403
      );
    }

    const auth = await requireApiRole(["owner", "admin"]);

    if (!auth.authorized) {
      return auth.response;
    }

    const page = await fetchText(NSE_URL, 5 * 1024 * 1024);

    if (!page.ok || page.length < 1000) {
      return jsonResponse(
        {
          success: false,
          error: "NSE All Reports page could not be inspected.",
          status: page.status,
          length: page.length,
        },
        502
      );
    }

    const scriptUrls = getScriptUrls(page.text);

    const inlineScriptContexts = extractContexts(
      page.text,
      [
        "ReportCard",
        "reportData",
        "reportsData",
        "reportList",
        "cr_equity_archives_mii_security_file_nse",
        "capital-market",
        "daily-reports",
      ],
      1500,
      2500,
      20
    );

    const inspected = await inspectScripts(scriptUrls);

    const reportCardScripts = inspected.scripts.filter(
      (script) => script.matches.length > 0
    );

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_NSE_SECURITY_MASTER_INSPECTION_V14",

      page: {
        url: NSE_URL,
        status: page.status,
        length: page.length,
      },

      scriptDiscovery: {
        discoveredScriptCount: scriptUrls.length,
        inspectedScriptCount: inspected.scripts.filter(
          (item) => item.fetched
        ).length,
        totalScriptBytesInspected: inspected.totalSize,
        scriptUrls,
      },

      inlineScriptContexts,

      reportCardScripts,

      allScriptResults: inspected.scripts.map((script) => ({
        url: script.url,
        status: script.status,
        length: script.length,
        fetched: script.fetched,
        matchCount: script.matches.length,
        error: script.error || null,
      })),

      safety: {
        databaseWrites: 0,
        databaseModified: false,
        securityMasterFilesDownloaded: 0,
        externalDownloadEndpointsCalled: 0,
        onlyOfficialNseScriptsInspected: true,
      },

      nextStep:
        "Trace the ReportCard caller and identify the exact metadata provider. No security master file has been downloaded.",
    });
  } catch (error) {
    console.error("NSE Security Master V14 inspection error:", error);

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown NSE inspection error",
        databaseWrites: 0,
        databaseModified: false,
      },
      502
    );
  }
}
