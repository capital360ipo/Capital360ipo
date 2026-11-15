import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_PAGE =
  "https://www.nseindia.com/market-data/all-upcoming-issues-ipo";

const NSE_API =
  "https://www.nseindia.com/api/all-upcoming-issues?category=ipo";

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

function getErrorDetails(error: unknown) {
  const err = error as Error & {
    cause?: {
      code?: string;
      message?: string;
    };
  };

  return {
    error: err?.message || "Unknown error",
    cause: err?.cause?.message ?? null,
    causeCode: err?.cause?.code ?? null,
  };
}

function inspectStructure(
  value: unknown,
  path = "$",
  depth = 0,
  result: Array<{
    path: string;
    length: number;
    firstRecordKeys: string[];
  }> = []
) {
  if (depth > 7 || value === null || typeof value !== "object") {
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
      firstRecordKeys:
        firstObject && typeof firstObject === "object"
          ? Object.keys(firstObject)
          : [],
    });

    value.slice(0, 3).forEach((item, index) => {
      inspectStructure(
        item,
        `${path}[${index}]`,
        depth + 1,
        result
      );
    });

    return result;
  }

  for (const [key, item] of Object.entries(
    value as Record<string, unknown>
  )) {
    inspectStructure(
      item,
      `${path}.${key}`,
      depth + 1,
      result
    );
  }

  return result;
}

function safePreview(payload: unknown) {
  try {
    return JSON.stringify(payload).slice(0, 3000);
  } catch {
    return "Preview unavailable";
  }
}

async function fetchNseSchedule() {
  let pageResponse: Response;

  try {
    pageResponse = await fetch(NSE_PAGE, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: HEADERS,
    });
  } catch (error) {
    const details = getErrorDetails(error);

    throw new Error(
      `NSE_PAGE_CONNECTION_FAILED: ${details.error}; ${details.cause ?? ""}`
    );
  }

  if (!pageResponse.ok) {
    throw new Error(
      `NSE page returned HTTP ${pageResponse.status}`
    );
  }

  const cookieHeaders = pageResponse.headers as Headers & {
    getSetCookie?: () => string[];
  };

  const cookies =
    cookieHeaders.getSetCookie?.() ??
    [pageResponse.headers.get("set-cookie") ?? ""];

  const cookie = cookies
    .map((value) => value.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

  let apiResponse: Response;

  try {
    apiResponse = await fetch(NSE_API, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
      headers: {
        ...HEADERS,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
  } catch (error) {
    const details = getErrorDetails(error);

    throw new Error(
      `NSE_API_CONNECTION_FAILED: ${details.error}; ${details.cause ?? ""}`
    );
  }

  if (!apiResponse.ok) {
    throw new Error(
      `NSE schedule API returned HTTP ${apiResponse.status}`
    );
  }

  const contentType =
    apiResponse.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("json")) {
    throw new Error(
      `NSE API returned non-JSON response. Content-Type: ${contentType}`
    );
  }

  let payload: unknown;

  try {
    payload = await apiResponse.json();
  } catch {
    throw new Error("NSE API returned invalid JSON.");
  }

  const arrays = inspectStructure(payload);

  const candidate = arrays
    .filter((item) => item.length > 0)
    .sort((a, b) => b.length - a.length)[0];

  return {
    payload,
    arrays,
    candidate,
    apiStatus: apiResponse.status,
    apiFinalUrl: apiResponse.url,
    contentType,
    pageFinalUrl: pageResponse.url,
  };
}

async function authorizeOwner(request?: NextRequest) {
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

async function runReadOnlyTest() {
  const result = await fetchNseSchedule();

  const responseKeys =
    result.payload !== null &&
    typeof result.payload === "object" &&
    !Array.isArray(result.payload)
      ? Object.keys(result.payload as Record<string, unknown>)
      : [];

  if (!result.candidate) {
    return {
      success: false,
      source: "NSE Official Upcoming IPO Schedule",
      mode: "READ_ONLY_DIAGNOSTIC",
      error: "No non-empty data array found in NSE response.",
      apiStatus: result.apiStatus,
      apiFinalUrl: result.apiFinalUrl,
      pageFinalUrl: result.pageFinalUrl,
      contentType: result.contentType,
      payloadType: Array.isArray(result.payload)
        ? "array"
        : typeof result.payload,
      responseKeys,
      arrayStructure: result.arrays,
      payloadPreview: safePreview(result.payload),
      databaseWrites: 0,
    };
  }

  const candidateArray = (() => {
    let current: unknown = result.payload;

    for (const part of result.candidate!.path
      .replace(/^\$\.?/, "")
      .split(".")) {
      if (!part) continue;

      const match = part.match(/^(.+)\[(\d+)\]$/);

      if (match) {
        current =
          (current as Record<string, unknown>)[match[1]];
        current = (current as unknown[])[Number(match[2])];
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  })();

  const records = Array.isArray(candidateArray)
    ? candidateArray
    : [];

  return {
    success: true,
    source: "NSE Official Upcoming IPO Schedule",
    mode: "READ_ONLY_DIAGNOSTIC",
    detected: records.length,
    apiStatus: result.apiStatus,
    apiFinalUrl: result.apiFinalUrl,
    contentType: result.contentType,
    responseKeys,
    arrayStructure: result.arrays,
    recordKeys: result.candidate.firstRecordKeys,
    preview: records.slice(0, 5),
    databaseWrites: 0,
  };
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwner(request);

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    return jsonResponse(await runReadOnlyTest());
  } catch (error) {
    const details = getErrorDetails(error);

    console.error("NSE schedule POST test failed:", details);

    return jsonResponse(
      {
        success: false,
        source: "NSE Official Upcoming IPO Schedule",
        mode: "READ_ONLY_DIAGNOSTIC",
        ...details,
        databaseWrites: 0,
      },
      502
    );
  }
}

export async function GET() {
  const auth = await authorizeOwner();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    return jsonResponse(await runReadOnlyTest());
  } catch (error) {
    const details = getErrorDetails(error);

    console.error("NSE schedule GET test failed:", details);

    return jsonResponse(
      {
        success: false,
        source: "NSE Official Upcoming IPO Schedule",
        mode: "READ_ONLY_DIAGNOSTIC",
        ...details,
        databaseWrites: 0,
      },
      502
    );
  }
}
