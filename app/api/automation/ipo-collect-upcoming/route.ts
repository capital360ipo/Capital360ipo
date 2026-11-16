
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

async function fetchUpcomingIpos() {
  const session = await fetch(NSE_PAGE, {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });

  if (!session.ok) {
    throw new Error(`NSE session failed: HTTP ${session.status}`);
  }

  const cookieHeaders =
    typeof session.headers.getSetCookie === "function"
      ? session.headers.getSetCookie()
      : [session.headers.get("set-cookie") || ""];

  const cookies = cookieHeaders
    .flatMap((value) => value.split(/,(?=[^;,]+=)/))
    .map((value) => value.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

  if (!cookies) {
    throw new Error("NSE session did not provide cookies.");
  }

  const response = await fetch(NSE_API, {
    headers: {
      ...HEADERS,
      Cookie: cookies,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    throw new Error(`NSE IPO API failed: HTTP ${response.status}`);
  }

  return await response.json();
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
      responseType: Array.isArray(payload) ? "array" : typeof payload,
      responseKeys:
        payload && typeof payload === "object" && !Array.isArray(payload)
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
      error instanceof Error ? error.message : "Unknown NSE error";

    console.error("Upcoming IPO preview failed:", message);

    return jsonResponse(
      {
        success: false,
        mode: "READ_ONLY_SCHEMA_PREVIEW",
        error: message,
        databaseWrites: 0,
      },
      502
    );
  }
}
