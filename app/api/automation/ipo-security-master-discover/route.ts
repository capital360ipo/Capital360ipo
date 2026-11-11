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
  before = 2500,
  after = 3500,
  maxResults = 50
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

      const key = `${found}:${lowerTerm}`;

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
      throw new Error("NSE resource exceeds 5 MB limit.");
    }

    const text = await response.text();

    if (text.length > 5 * 1024 * 1024) {
      throw new Error("NSE response exceeds 5 MB limit.");
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

function extractUrlHints(source: string) {
  const pattern =
    /["'`]([^"'`]{1,300}(?:\/api\/|\.json(?:\?|$)|\.csv(?:\.gz)?(?:\?|$)|\.gz(?:\?|$))[^"'`]{0,300})["'`]/gi;

  const results: string[] = [];
  let match: RegExpExecArray | null;

  while (
    (match = pattern.exec(source)) !== null &&
    results.length < 80
  ) {
    const value = match[1];

    if (
      !value.includes("${") &&
      !results.includes(value)
    ) {
      results.push(value);
    }
  }

  return results;
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

    // Read-only inspection of public NSE page and static scripts.
    const [page, reportsScript, nseMinScript] = await Promise.all([
      fetchNseText(NSE_URL),
      fetchNseText(REPORTS_SCRIPT),
      fetchNseText(NSE_MIN_SCRIPT),
    ]);

    if (
      !page.ok ||
      page.length < 1000 ||
      !reportsScript.ok ||
      reportsScript.length < 1000 ||
      !nseMinScript.ok ||
      nseMinScript.length < 1000
    ) {
      return jsonResponse(
        {
          success: false,
          error: "One or more NSE inspection resources could not be fetched.",
          resources: {
            html: { status: page.status, length: page.length },
            reportsScript: {
              status: reportsScript.status,
              length: reportsScript.length,
            },
            nseMinScript: {
              status: nseMinScript.status,
              length: nseMinScript.length,
            },
          },
        },
        502
      );
    }

    const htmlContexts = extractContexts(
      page.text,
      [
        "cr_equity_archives_mii_security_file_nse",
        "cr_equity_archives_mii_security_file_nse_bse",
        "CM - MII - Security File",
        "reportsDownload",
      ],
      1800,
      2500,
      12
    );

    const reportsContexts = extractContexts(
      reportsScript.text,
      [
        "cr_equity_archives_mii_security_file_nse",
        "SingledownloadReports",
        "fileDownload",
        "api/reports",
        "archives",
      ],
      1200,
      2000,
      18
    );

    // Targeted inspection of NSE's ReportCard metadata logic.
    const metadataContexts = extractContexts(
      nseMinScript.text,
      [
        "ReportCard",
        "filePath",
        "fileActlName",
        "item.filePath",
        "item.fileActlName",
        "downloadLink",
        "data-link",
        "reportData",
        "reportList",
        "reportDetails",
        "reportMaster",
        "reportsData",
        "fileDownload",
        "fetch(",
        "axios.get",
        "axios.post",
        "XMLHttpRequest",
      ],
      3000,
      4500,
      50
    );

    // Exact occurrence counts help identify whether the source was found.
    const lowerScript = nseMinScript.text.toLowerCase();

    const exactSearches = [
      "ReportCard",
      "filePath",
      "fileActlName",
      "item.filePath",
      "item.fileActlName",
      "downloadLink",
      "data-link",
      "reportData",
      "reportList",
      "reportsData",
    ].map((term) => {
      const lowerTerm = term.toLowerCase();
      let count = 0;
      let position = 0;
      const positions: number[] = [];

      while (position < lowerScript.length) {
        const found = lowerScript.indexOf(lowerTerm, position);

        if (found === -1) break;

        count++;

        if (positions.length < 15) {
          positions.push(found);
        }

        position = found + lowerTerm.length;
      }

      return {
        term,
        count,
        positions,
      };
    });

    // URL clues only. These endpoints are NOT called.
    const possibleApiPaths = extractUrlHints(nseMinScript.text);

    // Search known filename pattern without downloading anything.
    const filenamePattern =
      /NSE_CM_security_[0-9]{8}\.csv\.gz/gi;

    const filenameMatches = [
      ...new Set(nseMinScript.text.match(filenamePattern) || []),
    ];

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_NSE_SECURITY_MASTER_INSPECTION_V13",

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
      exactSearches,
      possibleApiPaths,
      filenameMatches,

      safety: {
        databaseWrites: 0,
        filesDownloaded: 0,
        externalDownloadEndpointsCalled: 0,
        databaseModified: false,
      },

      nextStep:
        "Identify the ReportCard data provider and exact Security Master metadata source before any download.",
    });
  } catch (error) {
    console.error("NSE Security Master V13 inspection error:", error);

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
