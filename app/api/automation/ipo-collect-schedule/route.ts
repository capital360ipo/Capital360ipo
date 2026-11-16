import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_PAGE =
  "https://www.nseindia.com/market-data/all-upcoming-issues-ipo";

const NSE_ENDPOINTS = [
  {
    name: "NSE_CURRENT_IPO",
    url: "https://www.nseindia.com/api/ipo-current-issue",
  },
  {
    name: "NSE_UPCOMING_IPO",
    url: "https://www.nseindia.com/api/all-upcoming-issues?category=ipo",
  },
];

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

function findArrays(
  value: unknown,
  path = "$",
  depth = 0,
  result: Array<{
    path: string;
    length: number;
    recordKeys: string[];
    preview: unknown[];
  }> = []
) {
  if (depth > 8 || value === null || typeof value !== "object") {
    return result;
  }

  if (Array.isArray(value)) {
    const firstObject = value.find(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item)
    );

    result.push({
      path,
      length: value.length,
      recordKeys:
        firstObject && typeof firstObject === "object"
          ? Object.keys(firstObject)
          : [],
      preview: value.slice(0, 3),
    });

    value.slice(0, 5).forEach((item, index) => {
      findArrays(item, `${path}[${index}]`, depth + 1, result);
    });

    return result;
  }

  for (const [key, item] of Object.entries(
    value as Record<string, unknown>
  )) {
    findArrays(item, `${path}.${key}`, depth + 1, result);
  }

  return result;
}

function getRootKeys(payload: unknown) {
  if (
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload)
  ) {
    return Object.keys(payload as Record<string, unknown>);
  }

  return [];
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

  const cookie = values
    .map((value) => value.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

  return {
    cookie,
    finalUrl: response.url,
  };
}

async function fetchEndpoint(
  endpoint: (typeof NSE_ENDPOINTS)[number],
  cookie: string
) {
  try {
    const response = await fetch(endpoint.url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
      headers: {
        ...HEADERS,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });

    const contentType =
      response.headers.get("content-type") || "";

    const text = await response.text();

    let payload: unknown = null;

    if (contentType.toLowerCase().includes("json")) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    const arrays = findArrays(payload);

    const bestArray = arrays
      .filter((item) => item.length > 0)
      .sort((a, b) => b.length - a.length)[0];

    return {
      endpoint: endpoint.name,
      requestedUrl: endpoint.url,
      finalUrl: response.url,
      httpStatus: response.status,
      contentType,
      success: response.ok && payload !== null,
      responseKeys: getRootKeys(payload),
      arrayStructure: arrays.map(
        ({ path, length, recordKeys }) => ({
          path,
          length,
          recordKeys,
        })
      ),
      detected: bestArray?.length ?? 0,
      recordKeys: bestArray?.recordKeys ?? [],
      preview: bestArray?.preview ?? [],
      responsePreview: text.slice(0, 1500),
    };
  } catch (error) {
    const err = error as Error & {
      cause?: { code?: string; message?: string };
    };

    return {
      endpoint: endpoint.name,
      requestedUrl: endpoint.url,
      success: false,
      error: err.message,
      cause: err.cause?.message ?? null,
      causeCode: err.cause?.code ?? null,
      detected: 0,
    };
  }
}

async function runDiagnostic() {
  const session = await getNseCookies();

  const results = await Promise.all(
    NSE_ENDPOINTS.map((endpoint) =>
      fetchEndpoint(endpoint, session.cookie)
    )
  );

  const totalDetected = results.reduce(
    (total, item) => total + item.detected,
    0
  );

  return {
    success: totalDetected > 0,
    source: "NSE Official IPO APIs",
    mode: "READ_ONLY_DIAGNOSTIC",
    pageFinalUrl: session.finalUrl,
    totalDetected,
    endpoints: results,
    databaseWrites: 0,
    automaticPublication: 0,
    message:
      totalDetected > 0
        ? "NSE IPO records detected. Ready for field mapping."
        : "No records detected. Inspect endpoint responses before choosing a fallback source.",
  };
}

async function authorize(request?: NextRequest) {
  if (request) {
    const origin = request.headers.get("origin");

    if (!origin || origin !== request.nextUrl.origin) {
      return {
        authorized: false as const,
        response: jsonResponse(
          { success: false, error: "Invalid request origin." },
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

    console.error("NSE IPO diagnostic failed:", err);

    return jsonResponse(
      {
        success: false,
        mode: "READ_ONLY_DIAGNOSTIC",
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

    console.error("NSE IPO diagnostic failed:", err);

    return jsonResponse(
      {
        success: false,
        mode: "READ_ONLY_DIAGNOSTIC",
        error: err.message,
        databaseWrites: 0,
      },
      502
    );
  }
}
