
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

function findArrays(value: unknown, depth = 0): unknown[][] {
  if (depth > 8 || value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    const results: unknown[][] = [value];

    for (const item of value.slice(0, 5)) {
      results.push(...findArrays(item, depth + 1));
    }

    return results;
  }

  const results: unknown[][] = [];

  for (const item of Object.values(value as Record<string, unknown>)) {
    results.push(...findArrays(item, depth + 1));
  }

  return results;
}

function getObjectKeys(value: unknown): string[] {
  if (value === null || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    const first = value.find(
      (item) => item !== null && typeof item === "object"
    );

    return first && typeof first === "object"
      ? Object.keys(first)
      : [];
  }

  return Object.keys(value as Record<string, unknown>);
}

async function fetchNseSchedule() {
  const pageResponse = await fetch(NSE_PAGE, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: HEADERS,
  });

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
    .flatMap((value) => value.split(","))
    .map((value) => value.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

  const apiResponse = await fetch(NSE_API, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(25000),
    headers: {
      ...HEADERS,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });

  if (!apiResponse.ok) {
    throw new Error(
      `NSE schedule API returned HTTP ${apiResponse.status}`
    );
  }

  const payload: unknown = await apiResponse.json();

  const arrays = findArrays(payload);

  const candidate = arrays
    .filter((items) => items.length > 0)
    .sort((a, b) => b.length - a.length)[0];

  if (!candidate) {
    throw new Error(
      "NSE response received, but no data array was found."
    );
  }

  return {
    payload,
    candidate,
  };
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
    const result = await fetchNseSchedule();

    const { payload, candidate } = result;

    return jsonResponse({
      success: true,
      source: "NSE Official Upcoming IPO Schedule",
      mode: "READ_ONLY_TEST",
      detected: candidate.length,
      responseKeys: getObjectKeys(payload),
      recordKeys: getObjectKeys(candidate),
      preview: candidate.slice(0, 10),
      databaseWrites: 0,
      automaticPublication: 0,
      message:
        "NSE schedule data fetched successfully. No database records were changed.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown NSE schedule collection error";

    console.error("NSE schedule test failed:", message);

    return jsonResponse(
      {
        success: false,
        source: "NSE Official Upcoming IPO Schedule",
        mode: "READ_ONLY_TEST",
        error: message,
        databaseWrites: 0,
      },
      502
    );
  }
}
