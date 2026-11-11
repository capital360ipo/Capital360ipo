import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_URL = "https://www.nseindia.com/all-reports";

const SCRIPT_URL =
  "https://www.nseindia.com/dist/js/sections/all-reports.js?v=06112026";

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

function extractContexts(
  source: string,
  terms: string[],
  before = 1200,
  after = 2200,
  maxResults = 35
) {
  const results: {
    term: string;
    position: number;
    context: string;
  }[] = [];

  const lowerSource = source.toLowerCase();
  const seen = new Set<string>();

  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    let position = 0;

    while (position < source.length) {
      const found = lowerSource.indexOf(lowerTerm, position);

      if (found === -1) break;

      const start = Math.max(0, found - before);
      const end = Math.min(
        source.length,
        found + term.length + after
      );

      const key = `${found}:${term}`;

      if (!seen.has(key)) {
        seen.add(key);

        results.push({
          term,
          position: found,
          context: source.slice(start, end),
        });
      }

      position = found + term.length;

      if (results.length >= maxResults) {
        return results;
      }
    }
  }

  return results;
}

async function fetchNseText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: HEADERS,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    const text = await response.text();

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

    const page = await fetchNseText(NSE_URL);

    if (!page.ok || page.length < 1000) {
      return jsonResponse(
        {
          success: false,
          error: "NSE All Reports page could not be inspected.",
          httpStatus: page.status,
          htmlLength: page.length,
        },
        502
      );
    }

    const script = await fetchNseText(SCRIPT_URL);

    if (!script.ok || script.length < 1000) {
      return jsonResponse(
        {
          success: false,
          error: "NSE all-reports.js could not be inspected.",
          httpStatus: script.status,
          scriptLength: script.length,
        },
        502
      );
    }

    // Exact Security Master IDs are checked first.
    // This prevents unrelated archive matches from using the result limit.
    const htmlTerms = [
      "cr_equity_archives_mii_security_file_nse",
      "cr_equity_archives_mii_security_file_nse_bse",
      "mii_security_file_nse",
      "NSE MII Security",
      "NSE_CM_security",
      "reportsDownload",
      "cr_equity_archives",
      "all-reports.js",
    ];

    const jsTerms = [
      "cr_equity_archives_mii_security_file_nse",
      "cr_equity_archives_mii_security_file_nse_bse",
      "SingledownloadReports",
      "function SingledownloadReports",
      "function fileDownload",
      "fileDownload",
      "filePath",
      "fileActlName",
      "displayName",
      "reportsDownload",
      "api/reports",
      "api/zipem",
      "archives",
      "reportDate",
      "B.get(",
      "B.post(",
      "fetch(",
      "$.ajax",
      "XMLHttpRequest",
      "getReport",
      "reportData",
      "reportList",
    ];

    const htmlContexts = extractContexts(
      page.text,
      htmlTerms,
      1800,
      3000,
      35
    );

    const jsContexts = extractContexts(
      script.text,
      jsTerms,
      1200,
      2600,
      45
    );

    const filenamePattern =
      /NSE_CM_security_[0-9]{8}\.csv\.gz/gi;

    const filenames = [
      ...new Set(script.text.match(filenamePattern) || []),
    ];

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_NSE_SECURITY_MASTER_INSPECTION_V11",

      inspection: {
        pageUrl: NSE_URL,
        scriptUrl: SCRIPT_URL,
        htmlLength: page.length,
        scriptLength: script.length,
        htmlHttpStatus: page.status,
        scriptHttpStatus: script.status,
      },

      htmlContexts,
      javascriptContexts: jsContexts,

      filenameMatches: filenames,

      safety: {
        databaseWrites: 0,
        filesDownloaded: 0,
        externalDownloadEndpointsCalled: 0,
        databaseModified: false,
      },

      nextStep:
        "Inspect exact Security Master card metadata and identify its report metadata source before any download.",
    });
  } catch (error) {
    console.error("NSE Security Master V11 inspection error:", error);

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown NSE inspection error",
        databaseWrites: 0,
        filesDownloaded: 0,
        databaseModified: false,
      },
      502
    );
  }
}
