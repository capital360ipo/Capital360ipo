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
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: NSE_PAGE,
  Origin: "https://www.nseindia.com",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function extractCookies(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  const values =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [response.headers.get("set-cookie") || ""];

  return values
    .flatMap((value) => value.split(/,(?=[^;,]+=)/))
    .map((value) => value.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function requestNseApi(cookies?: string) {
  const headers: Record<string, string> = { ...HEADERS };

  if (cookies) {
    headers.Cookie = cookies;
  }

  const response = await fetch(NSE_API, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    throw new Error(`NSE IPO API failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("json")) {
    throw new Error(
      "NSE API returned a non-JSON response. Access may be restricted."
    );
  }

  return await response.json();
}

async function fetchUpcomingIpos() {
  // First attempt: direct API request without requiring cookies.
  try {
    return await requestNseApi();
  } catch (directError) {
    // Second attempt: create an NSE browser session.
    const session = await fetch(NSE_PAGE, {
      headers: {
        ...HEADERS,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });

    if (!session.ok) {
      throw new Error(
        `NSE page session failed: HTTP ${session.status}. Direct API: ${
          directError instanceof Error
            ? directError.message
            : "Request failed"
        }`
      );
    }

    const cookies = extractCookies(session);

    if (!cookies) {
      throw new Error(
        `NSE did not provide session cookies. Direct API result: ${
          directError instanceof Error
            ? directError.message
            : "Request failed"
        }`
      );
    }

    return await requestNseApi(cookies);
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

  try {
    const payload = await fetchUpcomingIpos();

    const records = Array.isArray(payload)
      ? payload
      : payload &&
          typeof payload === "object" &&
          Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data
        : null;

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_SCHEMA_PREVIEW",
      source: "NSE_UPCOMING_IPO",
      responseType: Array.isArray(payload)
        ? "array"
        : typeof payload,
      responseKeys:
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload)
          ? Object.keys(payload)
          : [],
      detected: records?.length ?? null,
      sampleRecords: records ? records.slice(0, 10) : payload,
      databaseWrites: 0,
      automaticPublication: false,
      message:
        "NSE response received. Raw structure preview only; no database changes made.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown NSE error";

    console.error("Upcoming IPO preview failed:", message);

    return jsonResponse(
      {
        success: false,
        mode: "READ_ONLY_SCHEMA_PREVIEW",
        error: message,
        databaseWrites: 0,
        automaticPublication: false,
      },
      502
    );
  }
}
