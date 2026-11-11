
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
  before = 1000,
  after = 1800,
  maxResults = 30
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

      const key = `${found}:${term}`;

      if (!seen.has(key)) {
        seen.add(key);

        results.push({
          term,
          position: found,
          context: source.slice(
            Math.max(0, found - before),
            Math.min(source.length, found + term.length + after)
          ),
        });
      }

      position = found + lowerTerm.length;

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

    const contentLength = Number(
      response.headers.get("content-length") || 0
    );

    if (contentLength > 5 * 1024 * 1024) {
      throw new Error("NSE inspection resource exceeds 5 MB limit.");
    }

    const text = await response.text();

    if (text.length > 5 * 1024 * 1024) {
      throw new Error("NSE inspection response exceeds 5 MB limit.");
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

    // Read-only: inspect NSE page and JavaScript resources only.
    const [page, reportsScript, nseMinScript] = await Promise.all([
      fetchNseText(NSE_URL),
      fetchNseText(REPORTS_SCRIPT),
      fetchNseText(NSE_MIN_SCRIPT),
    ]);

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

    if (!reportsScript.ok || reportsScript.length < 1000) {
      return jsonResponse(
        {
          success: false,
          error: "NSE all-reports.js could not be inspected.",
          httpStatus: reportsScript.status,
          scriptLength: reportsScript.length,
        },
        502
      );
    }

    if (!nseMinScript.ok || nseMinScript.length < 1000) {
      return jsonResponse(
        {
          success: false,
          error: "NSE nse-min.js could not be inspected.",
          httpStatus: nseMinScript.status,
          scriptLength: nseMinScript.length,
        },
        502
      );
    }

    const htmlContexts = extractContexts(
      page.text,
      [
        "cr_equity_archives_mii_security_file_nse",
        "cr_equity_archives_mii_security_file_nse_bse",
        "reportsDownload",
        "mii_security_file_nse",
      ],
      1800,
      2600,
      12
    );

    const reportsContexts = extractContexts(
      reportsScript.text,
      [
        "cr_equity_archives_mii_security_file_nse",
        "SingledownloadReports",
        "function fileDownload",
        "fileDownload",
        "api/reports",
        "archives",
      ],
      1000,
      1800,
      15
    );

    // Report metadata discovery in nse-min.js.
    const metadataContexts = extractContexts(
      nseMinScript.text,
      [
        "ReportCard",
        "filePath",
        "fileActlName",
        "downloadLink",
        "data-link",
        "reportData",
        "reportList",
        "getReportData",
        "reportDetails",
        "reportMaster",
        "axios.get",
        "axios.post",
        "fetch(",
        "XMLHttpRequest",
        "baseURL",
      ],
      1400,
      2200,
      35
    );

    // Extract possible API path strings from the inspected script.
    // These are clues only; no endpoint is called.
    const apiPathPattern =
      /["'`]([^"'`]{0,180}(?:\/api\/|\/api\/v\d+\/)[^"'`]{0,220})["'`]/gi;

    const apiPathMatches: string[] = [];
    let match: RegExpExecArray | null;

    while (
      (match = apiPathPattern.exec(nseMinScript.text)) !== null &&
      apiPathMatches.length < 40
    ) {
      const candidate = match[1];

      if (
        !apiPathMatches.includes(candidate) &&
        !candidate.includes("${")
      ) {
        apiPathMatches.push(candidate);
      }
    }

    // Known filename pattern scan only. No download.
    const filenamePattern =
      /NSE_CM_security_[0-9]{8}\.csv\.gz/gi;

    const filenameMatches = [
      ...new Set(
        (
          nseMinScript.text.match(filenamePattern) || []
        )
      ),
    ];

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_NSE_SECURITY_MASTER_INSPECTION_V12",

      inspection: {
        pageUrl: NSE_URL,
        reportsScriptUrl: REPORTS_SCRIPT,
        nseMinScriptUrl: NSE_MIN_SCRIPT,
        htmlLength: page.length,
        reportsScriptLength: reportsScript.length,
        nseMinScriptLength: nseMinScript.length,
        htmlHttpStatus: page.status,
        reportsScriptHttpStatus: reportsScript.status,
        nseMinScriptHttpStatus: nseMinScript.status,
      },

      htmlContexts,
      reportsJavascriptContexts: reportsContexts,
      metadataContexts,
      possibleApiPaths: apiPathMatches,
      filenameMatches,

      safety: {
        databaseWrites: 0,
        filesDownloaded: 0,
        externalDownloadEndpointsCalled: 0,
        databaseModified: false,
      },

      nextStep:
        "Inspect ReportCard metadata source and identify the exact NSE Security Master resource before any download.",
    });
  } catch (error) {
    console.error("NSE Security Master V12 inspection error:", error);

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
