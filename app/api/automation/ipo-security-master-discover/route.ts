
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

function cleanText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
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
      throw new Error("NSE returned an incomplete page.");
    }

    const filenamePattern =
      /NSE_CM_security_[0-9]{8}\.csv\.gz/gi;

    const filenameMatches = [
      ...html.matchAll(filenamePattern),
    ];

    const anchors =
      html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];

    const securityLinks: string[] = [];

    for (const anchor of anchors) {
      const text = cleanText(anchor);

      if (
        /security|mii|listed securities/i.test(
          anchor + " " + text
        )
      ) {
        securityLinks.push(
          anchor
            .replace(/\s+/g, " ")
            .slice(0, 1800)
        );
      }

      if (securityLinks.length >= 30) break;
    }

    const scriptTags =
      html.match(/<script\b[^>]*>/gi) || [];

    const scriptReferences = scriptTags
      .filter((tag) =>
        /security|report|download|api/i.test(tag)
      )
      .slice(0, 20);

    const securitySnippets: string[] = [];
    const lowerHtml = html.toLowerCase();
    let searchFrom = 0;

    while (securitySnippets.length < 20) {
      const index = lowerHtml.indexOf(
        "security",
        searchFrom
      );

      if (index === -1) break;

      securitySnippets.push(
        html
          .slice(
            Math.max(0, index - 300),
            Math.min(html.length, index + 900)
          )
          .replace(/\s+/g, " ")
      );

      searchFrom = index + 8;
    }

    const snippets = [
      ...securityLinks.map(
        (item) => "SECURITY LINK: " + item
      ),
      ...scriptReferences.map(
        (item) => "SCRIPT REFERENCE: " + item
      ),
      ...securitySnippets.map(
        (item) => "SECURITY HTML: " + item
      ),
    ].slice(0, 30);

    return jsonResponse({
      success: true,
      mode: "READ_ONLY_DISCOVERY_V2",
      source: NSE_URL,
      pageLength: html.length,
      filenameMatches: filenameMatches.length,
      securityLinkMatches: securityLinks.length,
      scriptReferenceMatches: scriptReferences.length,
      securityHtmlMatches: securitySnippets.length,
      snippets,
      databaseWrites: 0,
      filesDownloaded: 0,
      note:
        "NSE security-related page references inspected. No files downloaded and no database records modified.",
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
