import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_URL = "https://www.nseindia.com/all-reports";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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
    const response = await fetch(NSE_URL, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
      headers: HEADERS,
    });

    if (!response.ok) {
      throw new Error(`NSE returned HTTP ${response.status}`);
    }

    const html = await response.text();

    if (!html || html.length < 1000) {
      throw new Error("NSE returned an empty or incomplete page.");
    }

    const filenamePattern =
      /NSE_CM_security_[0-9]{8}\.csv\.gz/gi;

    const matches = [...html.matchAll(filenamePattern)];

    const snippets = matches.slice(0, 10).map((match) => {
      const index = match.index ?? 0;
      return html
        .slice(Math.max(0, index - 500), index + 700)
        .replace(/\s+/g, " ")
        .slice(0, 1200);
    });

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_DISCOVERY",
      source: NSE_URL,
      pageLength: html.length,
      filenameMatches: matches.length,
      snippets,
      databaseWrites: 0,
      note:
        "NSE report filename references discovered. No files were downloaded and no database records were modified.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown NSE discovery error";

    console.error("NSE security master discovery failed:", message);

    return jsonResponse(
      {
        success: false,
        error: message,
        databaseWrites: 0,
      },
      502
    );
  }
}
