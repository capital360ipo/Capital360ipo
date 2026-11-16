
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_PAGE =
  "https://www.nseindia.in/market-data/all-upcoming-issues-ipo";

const NSE_API =
  "https://www.nseindia.in/api/public-past-issues";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: NSE_PAGE,
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getIndiaDateRange() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  const today = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day)
    )
  );

  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 365);

  function format(date: Date) {
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();

    return `${day}-${month}-${year}`;
  }

  return {
    fromDate: format(from),
    toDate: format(today),
  };
}

async function getNseCookies() {
  const response = await fetch(NSE_PAGE, {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
    headers: HEADERS,
  });

  if (!response.ok) {
    throw new Error(`NSE_PAGE_HTTP_${response.status}`);
  }

  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  const values =
    headers.getSetCookie?.() ??
    [response.headers.get("set-cookie") ?? ""];

  const cookies = values
    .map((value) => value.split(";")[0].trim())
    .filter(Boolean);

  return {
    cookie: cookies.join("; "),
    cookieCount: cookies.length,
    finalUrl: response.url,
  };
}

function findRecordArrays(
  value: unknown,
  path = "$",
  depth = 0,
  result: Array<{
    path: string;
    length: number;
    recordKeys: string[];
    preview: unknown[];
    score: number;
  }> = []
) {
  if (
    depth > 7 ||
    value === null ||
    typeof value !== "object"
  ) {
    return result;
  }

  if (Array.isArray(value)) {
    const first = value.find(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item)
    );

    const keys =
      first && typeof first === "object"
        ? Object.keys(first)
        : [];

    const expected = [
      "symbol",
      "companyName",
      "ipoStartDate",
      "ipoEndDate",
      "listingDate",
      "securityType",
      "issuePrice",
    ];

    const score = expected.filter((key) =>
      keys.includes(key)
    ).length;

    result.push({
      path,
      length: value.length,
      recordKeys: keys,
      preview: value.slice(0, 5),
      score,
    });

    return result;
  }

  for (const [key, item] of Object.entries(
    value as Record<string, unknown>
  )) {
    findRecordArrays(
      item,
      `${path}.${key}`,
      depth + 1,
      result
    );
  }

  return result;
}

async function runDiagnostic() {
  const dates = getIndiaDateRange();
  const session = await getNseCookies();

  const url = new URL(NSE_API);

  url.searchParams.set("from_date", dates.fromDate);
  url.searchParams.set("to_date", dates.toDate);
  url.searchParams.set("security_type", "all");

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
    headers: {
      ...HEADERS,
      ...(session.cookie
        ? { Cookie: session.cookie }
        : {}),
    },
  });

  const contentType =
    response.headers.get("content-type") || "";

  const responseText = await response.text();

  let payload: unknown = null;
  let parseError: string | null = null;

  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    parseError = (error as Error).message;
  }

  const arrays = findRecordArrays(payload);

  const bestArray = [...arrays].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.length - a.length;
  })[0];

  const records = bestArray?.preview ?? [];
  const detected = bestArray?.length ?? 0;

  return {
    success: response.ok && payload !== null,
    source: "NSE Official Historical IPO API",
    mode: "READ_ONLY_HISTORICAL_DIAGNOSTIC",

    requestedUrl: url.toString(),
    finalUrl: response.url,

    httpStatus: response.status,
    contentType,

    dateRange: {
      fromDate: dates.fromDate,
      toDate: dates.toDate,
      securityType: "all",
    },

    session: {
      pageFinalUrl: session.finalUrl,
      cookieCount: session.cookieCount,
    },

    payloadType: Array.isArray(payload)
      ? "array"
      : typeof payload,

    detected,
    arrayStructure: arrays.map(
      ({ path, length, recordKeys, score }) => ({
        path,
        length,
        recordKeys,
        score,
      })
    ),

    recordKeys: bestArray?.recordKeys ?? [],
    preview: records,

    parseError,
    responsePreview: responseText.slice(0, 1500),

    databaseWrites: 0,
    automaticPublication: 0,

    message: !response.ok
      ? "NSE returned an HTTP error."
      : payload === null
        ? "NSE response could not be parsed as JSON."
        : detected > 0
          ? "Historical IPO records detected successfully."
          : "NSE responded, but no historical records were detected.",
  };
}

async function authorize(request?: NextRequest) {
  if (request) {
    const origin = request.headers.get("origin");

    if (!origin || origin !== request.nextUrl.origin) {
      return {
        authorized: false as const,
        response: jsonResponse(
          {
            success: false,
            error: "Invalid request origin.",
          },
          403
        ),
      };
    }
  }

  const auth = await requireApiRole(["owner", "admin"]);

  if (!auth.authorized) {
    return {
      authorized: false as const,
      response: auth.response,
    };
  }

  return { authorized: true as const };
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);

  if (!auth.authorized) return auth.response;

  try {
    return jsonResponse(await runDiagnostic());
  } catch (error) {
    const err = error as Error;

    console.error("NSE historical IPO diagnostic:", err);

    return jsonResponse(
      {
        success: false,
        mode: "READ_ONLY_HISTORICAL_DIAGNOSTIC",
        error: err.message,
        databaseWrites: 0,
      },
      502
    );
  }
}

export async function GET() {
  const auth = await authorize();

  if (!auth.authorized) return auth.response;

  try {
    return jsonResponse(await runDiagnostic());
  } catch (error) {
    const err = error as Error;

    console.error("NSE historical IPO diagnostic:", err);

    return jsonResponse(
      {
        success: false,
        mode: "READ_ONLY_HISTORICAL_DIAGNOSTIC",
        error: err.message,
        databaseWrites: 0,
      },
      502
    );
  }
}
