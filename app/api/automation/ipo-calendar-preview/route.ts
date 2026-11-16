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

type LifecycleStatus =
  | "UPCOMING"
  | "OPEN"
  | "HISTORICAL"
  | "UNKNOWN";

type IpoCandidate = {
  companyName: string;
  normalizedName: string;
  ipoType: "MAINBOARD" | "SME" | "UNKNOWN";
  openDate: string | null;
  closeDate: string | null;
  priceBand: string | null;
  issueSize: string | null;
  lifecycleStatus: LifecycleStatus;
  sourceNames: string[];
  sourceUrls: string[];
  verificationStatus: "UNVERIFIED";
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getIndiaTodayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getLifecycleStatus(
  openDate: string | null,
  closeDate: string | null
): LifecycleStatus {
  if (!openDate) return "UNKNOWN";

  const today = getIndiaTodayISO();

  if (today < openDate) return "UPCOMING";
  if (closeDate && today > closeDate) return "HISTORICAL";

  return "OPEN";
}

function cleanHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (match, code) => {
      try {
        const number = code.toLowerCase().startsWith("x")
          ? parseInt(code.slice(1), 16)
          : parseInt(code, 10);

        if (
          !Number.isFinite(number) ||
          number < 0 ||
          number > 0x10ffff
        ) {
          return match;
        }

        return String.fromCodePoint(number);
      } catch {
        return match;
      }
    })
    .replace(/\s+/g, " ")
    .trim();
}

function extractPageTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);

  if (!match) return null;

  const title = cleanHtml(match[1]);

  return title ? title.slice(0, 200) : null;
}

function detectPageCondition(html: string, rows: number) {
  const text = cleanHtml(html).toLowerCase();

  const blockedPatterns = [
    /access denied/,
    /request blocked/,
    /captcha/,
    /verify you are human/,
    /cloudflare/,
    /akamai/,
    /just a moment/,
    /temporarily unavailable/,
  ];

  if (blockedPatterns.some((pattern) => pattern.test(text))) {
    return {
      assessment: "POSSIBLE_ACCESS_BLOCK",
      diagnostic:
        "Response contains possible CAPTCHA, security challenge, or access-blocking text.",
    };
  }

  if (rows === 0) {
    const javascriptIndicators = [
      /enable javascript/,
      /javascript is required/,
      /__next_data__/,
      /id="root"/,
      /id="app"/,
      /webpack/,
    ];

    if (
      javascriptIndicators.some((pattern) => pattern.test(html))
    ) {
      return {
        assessment: "POSSIBLE_JAVASCRIPT_RENDERING",
        diagnostic:
          "No HTML table rows detected. Page contains indicators of JavaScript-based rendering.",
      };
    }

    return {
      assessment: "NO_TABLE_ROWS",
      diagnostic:
        "HTTP response received, but no HTML table rows detected. Markup may have changed or data may load dynamically.",
    };
  }

  return {
    assessment: "HTML_ROWS_DETECTED",
    diagnostic: null,
  };
}

function extractRows(html: string) {
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

  return rows
    .map((row) => {
      const cells = row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];

      return cells.map((cell) => cleanHtml(cell)).filter(Boolean);
    })
    .filter((cells) => cells.length >= 2)
    .slice(0, 30);
}

function extractStructuredRows(html: string) {
  const tables = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) || [];

  const records: Array<{
    cells: string[];
    headers: string[];
  }> = [];

  for (const table of tables) {
    const rows = table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    let headers: string[] = [];

    for (const row of rows) {
      const cells = row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
      const values = cells.map((cell) => cleanHtml(cell)).filter(Boolean);

      if (values.length < 2) continue;

      const isHeader = values.some((value) =>
        /^(name|company|company name|ipo name)$/i.test(value)
      );

      if (isHeader) {
        headers = values.map((value) => value.toLowerCase());
        continue;
      }

      records.push({ cells: values, headers });
    }
  }

  if (records.length === 0) {
    return extractRows(html).map((cells) => ({
      cells,
      headers: [],
    }));
  }

  return records;
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(limited|ltd|private|pvt)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;

  const cleaned = value.trim();

  if (
    !cleaned ||
    /to be announced|not announced|tba|^[-–—]$/i.test(cleaned)
  ) {
    return null;
  }

  const timestamp = Date.parse(cleaned);

  if (!Number.isFinite(timestamp)) return null;

  return new Date(timestamp).toISOString().slice(0, 10);
}

function parsePeriod(value: string | undefined) {
  if (!value) {
    return { openDate: null, closeDate: null };
  }

  const parts = value.split(/\s+-\s+|\s+to\s+/i);

  if (parts.length >= 2) {
    return {
      openDate: parseDate(parts[0]),
      closeDate: parseDate(parts[1]),
    };
  }

  return {
    openDate: parseDate(value),
    closeDate: null,
  };
}

function cleanPriceBand(value: string | undefined) {
  if (!value) return null;

  const cleaned = value.trim();

  if (
    /^[-–—]$/.test(cleaned) ||
    /^₹?\s*0\s*-\s*0$/.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function cleanIssueSize(value: string | undefined) {
  if (!value) return null;

  const cleaned = value.trim();

  if (/^[-–—]$/.test(cleaned)) return null;

  return cleaned;
}

function getHeaderValue(
  cells: string[],
  headers: string[],
  pattern: RegExp
) {
  const index = headers.findIndex((header) => pattern.test(header));

  return index >= 0 ? cells[index] : undefined;
}

function detectIpoType(
  sourceName: string,
  cells: string[]
): IpoCandidate["ipoType"] {
  if (sourceName === "BSE_SME") return "SME";
  if (sourceName === "BSE_MAINBOARD") return "MAINBOARD";

  const text = cells.join(" ").toLowerCase();

  if (/\bsme\b/.test(text)) return "SME";
  if (/\bmainboard\b/.test(text)) return "MAINBOARD";

  return "UNKNOWN";
}

function extractCandidates(
  source: (typeof SOURCES)[number],
  html: string
): IpoCandidate[] {
  const records = extractStructuredRows(html);
  const candidates: IpoCandidate[] = [];

  for (const record of records) {
    const { cells, headers } = record;

    const company =
      getHeaderValue(cells, headers, /company|name/) || cells[0];

    if (
      !company ||
      /^(name|company|company name|ipo name)$/i.test(company.trim()) ||
      company.length > 120
    ) {
      continue;
    }

    const openValue = getHeaderValue(cells, headers, /open date/);
    const closeValue = getHeaderValue(cells, headers, /close date/);

    const periodValue = getHeaderValue(
      cells,
      headers,
      /issue period|issue date|date/
    );

    const period = parsePeriod(periodValue);

    const openDate = parseDate(openValue) || period.openDate;
    const closeDate = parseDate(closeValue) || period.closeDate;

    const priceBand = cleanPriceBand(
      getHeaderValue(cells, headers, /price band/)
    );

    const issueSize = cleanIssueSize(
      getHeaderValue(cells, headers, /issue size/)
    );

    const normalizedName = normalizeName(company);

    if (!normalizedName || normalizedName.length < 2) continue;

    candidates.push({
      companyName: company.trim(),
      normalizedName,
      ipoType: detectIpoType(source.name, cells),
      openDate,
      closeDate,
      priceBand,
      issueSize,
      lifecycleStatus: getLifecycleStatus(openDate, closeDate),
      sourceNames: [source.name],
      sourceUrls: [source.url],
      verificationStatus: "UNVERIFIED",
    });
  }

  return candidates;
}

function datesAreCompatible(
  first: IpoCandidate,
  second: IpoCandidate
) {
  if (
    first.openDate &&
    second.openDate &&
    first.openDate !== second.openDate
  ) {
    return false;
  }

  if (
    first.closeDate &&
    second.closeDate &&
    first.closeDate !== second.closeDate
  ) {
    return false;
  }

  return true;
}

function typesAreCompatible(
  first: IpoCandidate,
  second: IpoCandidate
) {
  return (
    first.ipoType === "UNKNOWN" ||
    second.ipoType === "UNKNOWN" ||
    first.ipoType === second.ipoType
  );
}

function mergeCandidates(candidates: IpoCandidate[]) {
  const merged: IpoCandidate[] = [];

  for (const candidate of candidates) {
    const existing = merged.find(
      (item) =>
        item.normalizedName === candidate.normalizedName &&
        datesAreCompatible(item, candidate) &&
        typesAreCompatible(item, candidate)
    );

    if (!existing) {
      merged.push({ ...candidate });
      continue;
    }

    if (existing.ipoType === "UNKNOWN") {
      existing.ipoType = candidate.ipoType;
    }

    existing.openDate ||= candidate.openDate;
    existing.closeDate ||= candidate.closeDate;
    existing.priceBand ||= candidate.priceBand;
    existing.issueSize ||= candidate.issueSize;

    existing.lifecycleStatus = getLifecycleStatus(
      existing.openDate,
      existing.closeDate
    );

    existing.sourceNames = Array.from(
      new Set([...existing.sourceNames, ...candidate.sourceNames])
    );

    existing.sourceUrls = Array.from(
      new Set([...existing.sourceUrls, ...candidate.sourceUrls])
    );
  }

  return merged.slice(0, 100);
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

    const finalUrl = response.url || source.url;
    const contentType = response.headers.get("content-type");

    if (!response.ok) {
      return {
        source: source.name,
        success: false,
        reachable: false,
        usableData: false,
        requestedUrl: source.url,
        finalUrl,
        pageTitle: null,
        httpStatus: response.status,
        contentType,
        htmlLength: 0,
        detectedRows: 0,
        candidateCount: 0,
        sampleRows: [],
        candidates: [],
        assessment: "HTTP_ERROR",
        diagnostic: `Source returned HTTP ${response.status}.`,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();

    if (!html || html.length > 5 * 1024 * 1024) {
      return {
        source: source.name,
        success: true,
        reachable: true,
        usableData: false,
        requestedUrl: source.url,
        finalUrl,
        pageTitle: extractPageTitle(html || ""),
        httpStatus: response.status,
        contentType,
        htmlLength: html?.length || 0,
        detectedRows: 0,
        candidateCount: 0,
        sampleRows: [],
        candidates: [],
        assessment: "EMPTY_OR_OVERSIZED_RESPONSE",
        diagnostic: "Response was empty or exceeded the 5 MB inspection limit.",
        error: "Empty or oversized response",
      };
    }

    const rows = extractRows(html);
    const candidates = extractCandidates(source, html);
    const pageCondition = detectPageCondition(html, rows.length);

    return {
      source: source.name,
      success: true,
      reachable: true,
      usableData: candidates.length > 0,
      requestedUrl: source.url,
      finalUrl,
      pageTitle: extractPageTitle(html),
      httpStatus: response.status,
      contentType,
      htmlLength: html.length,
      detectedRows: rows.length,
      candidateCount: candidates.length,
      sampleRows: rows,
      candidates,
      assessment: pageCondition.assessment,
      diagnostic:
        candidates.length > 0
          ? "IPO candidate data extracted from the response."
          : pageCondition.diagnostic,
      pageContainsUpcoming:
        /upcoming|public issue|ipo issues/i.test(cleanHtml(html)),
      message: "Read-only source inspection. No records saved.",
    };
  } catch (error) {
    const err = error instanceof Error ? error : null;
    const cause =
      err?.cause instanceof Error ? err.cause : null;

    return {
      source: source.name,
      success: false,
      reachable: false,
      usableData: false,
      requestedUrl: source.url,
      finalUrl: null,
      pageTitle: null,
      httpStatus: null,
      contentType: null,
      htmlLength: 0,
      detectedRows: 0,
      candidateCount: 0,
      sampleRows: [],
      candidates: [],
      assessment: "FETCH_FAILED",
      diagnostic: "The source could not be fetched. Check timeout, network, or source-side restrictions.",
      errorName: err?.name || "UnknownError",
      error: err?.message || "Unknown source error",
      causeName: cause?.name || null,
      causeMessage: cause?.message || null,
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

  const allCandidates = results.flatMap((item) => item.candidates);
  const normalizedCandidates = mergeCandidates(allCandidates);

  const reachableSources = results.filter(
    (item) => item.reachable
  ).length;

  const usableSources = results.filter(
    (item) => item.usableData
  ).length;

  return jsonResponse({
    success: true,
    mode: "READ_ONLY_NORMALIZED_IPO_DISCOVERY",
    indiaToday: getIndiaTodayISO(),

    sourcesChecked: results.length,

    // HTTP response received, whether or not IPO data was extracted.
    reachableSources,

    // At least one IPO candidate extracted successfully.
    usableSources,

    // Kept for compatibility: means HTTP reachable.
    successfulSources: reachableSources,

    totalDetectedRows: results.reduce(
      (total, item) => total + item.detectedRows,
      0
    ),

    rawCandidateCount: allCandidates.length,
    uniqueCandidateCount: normalizedCandidates.length,
    duplicateCount: allCandidates.length - normalizedCandidates.length,

    databaseWrites: 0,
    automaticPublication: false,

    normalizedCandidates,
    results,

    message:
      "IPO candidates extracted and normalized for review. No database records were changed.",
  });
}
