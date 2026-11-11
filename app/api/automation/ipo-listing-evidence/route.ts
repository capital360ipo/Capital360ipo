
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_SIZE = 16 * 1024;

const ALLOWED_EVIDENCE_TYPES = [
  "nse_listing_circular",
  "nse_security_master",
  "sebi_filing",
  "issuer_website",
  "other",
] as const;

const OFFICIAL_HOSTS = [
  "nseindia.com",
  "sebi.gov.in",
];

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isHostUnder(hostname: string, domain: string) {
  return (
    hostname === domain ||
    hostname.endsWith(`.${domain}`)
  );
}

function isOfficialHost(hostname: string) {
  return OFFICIAL_HOSTS.some((domain) =>
    isHostUnder(hostname, domain)
  );
}

function validOptionalText(
  value: unknown,
  maxLength: number
): value is string | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" &&
      value.length <= maxLength)
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return jsonResponse(
      { success: false, error: "Invalid request origin." },
      403
    );
  }

  const auth = await requireApiRole([
    "owner",
    "admin",
    "editor",
  ]);

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const contentLength = Number(
      request.headers.get("content-length") || 0
    );

    if (contentLength > MAX_BODY_SIZE) {
      return jsonResponse(
        { success: false, error: "Request body is too large." },
        413
      );
    }

    const rawBody = await request.text();

    if (
      !rawBody ||
      new TextEncoder().encode(rawBody).length > MAX_BODY_SIZE
    ) {
      return jsonResponse(
        { success: false, error: "Invalid request size." },
        413
      );
    }

    let body: Record<string, unknown>;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse(
        { success: false, error: "Invalid JSON body." },
        400
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return jsonResponse(
        { success: false, error: "Invalid request data." },
        400
      );
    }

    const {
      listing_history_id,
      source_name,
      source_url,
      evidence_type,
      field_name,
      field_value,
      issuer_name,
    } = body;

    if (
      typeof listing_history_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        listing_history_id
      )
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Valid listing_history_id is required.",
        },
        400
      );
    }

    if (
      typeof source_name !== "string" ||
      !source_name.trim() ||
      source_name.trim().length > 100
    ) {
      return jsonResponse(
        { success: false, error: "Valid source_name is required." },
        400
      );
    }

    if (
      typeof evidence_type !== "string" ||
      !ALLOWED_EVIDENCE_TYPES.includes(
        evidence_type as (typeof ALLOWED_EVIDENCE_TYPES)[number]
      )
    ) {
      return jsonResponse(
        { success: false, error: "Invalid evidence_type." },
        400
      );
    }

    if (
      !validOptionalText(source_url, 2000) ||
      !validOptionalText(field_name, 200) ||
      !validOptionalText(field_value, 1000) ||
      !validOptionalText(issuer_name, 250)
    ) {
      return jsonResponse(
        {
          success: false,
          error: "One or more fields are invalid or too long.",
        },
        400
      );
    }

    let safeUrl: string | null = null;
    let officialSource = false;

    if (typeof source_url === "string" && source_url.trim()) {
      let parsedUrl: URL;

      try {
        parsedUrl = new URL(source_url.trim());
      } catch {
        return jsonResponse(
          { success: false, error: "Invalid source URL." },
          400
        );
      }

      if (
        parsedUrl.protocol !== "https:" ||
        parsedUrl.username ||
        parsedUrl.password
      ) {
        return jsonResponse(
          {
            success: false,
            error: "Only secure HTTPS URLs are allowed.",
          },
          400
        );
      }

      safeUrl = parsedUrl.toString();

      officialSource = isOfficialHost(
        parsedUrl.hostname.toLowerCase()
      );
    }

    const urlHost = safeUrl
      ? new URL(safeUrl).hostname.toLowerCase()
      : "";

    if (
      (evidence_type === "nse_listing_circular" ||
        evidence_type === "nse_security_master") &&
      (!safeUrl || !isHostUnder(urlHost, "nseindia.com"))
    ) {
      return jsonResponse(
        {
          success: false,
          error: "NSE evidence must use an NSE official URL.",
        },
        400
      );
    }

    if (
      evidence_type === "sebi_filing" &&
      (!safeUrl || !isHostUnder(urlHost, "sebi.gov.in"))
    ) {
      return jsonResponse(
        {
          success: false,
          error: "SEBI evidence must use a SEBI official URL.",
        },
        400
      );
    }

    if (
      evidence_type === "issuer_website" &&
      officialSource
    ) {
      officialSource = false;
    }

    const { data: listing, error: listingError } =
      await supabaseAdmin
        .from("ipo_listing_history")
        .select("id, company_name, symbol, review_status")
        .eq("id", listing_history_id)
        .maybeSingle();

    if (listingError) {
      console.error("Listing history lookup failed:", listingError);

      return jsonResponse(
        {
          success: false,
          error: "Could not verify listing record.",
        },
        500
      );
    }

    if (!listing) {
      return jsonResponse(
        {
          success: false,
          error: "Listing history record not found.",
        },
        404
      );
    }

    const { data, error } = await supabaseAdmin
      .from("ipo_listing_evidence")
      .insert({
        listing_history_id,
        source_name: source_name.trim(),
        source_url: safeUrl,
        evidence_type,

        field_name:
          typeof field_name === "string"
            ? field_name.trim() || null
            : null,

        field_value:
          typeof field_value === "string"
            ? field_value.trim() || null
            : null,

        issuer_name:
          typeof issuer_name === "string"
            ? issuer_name.trim() || null
            : null,

        is_official_source: officialSource,

        validation_status: "unverified",
        validated_by: null,
        validated_at: null,
        validation_notes: null,

        metadata: {
          submitted_by_api: true,
          listing_symbol: listing.symbol,
          listing_company_name: listing.company_name,
          submitted_at: new Date().toISOString(),
        },
      })
      .select(
        "id, listing_history_id, source_name, evidence_type, is_official_source, validation_status, created_at"
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return jsonResponse(
          {
            success: false,
            error: "Duplicate evidence already exists.",
          },
          409
        );
      }

      console.error("IPO evidence insert failed:", error);

      return jsonResponse(
        {
          success: false,
          error: "Evidence could not be saved.",
        },
        500
      );
    }

    return jsonResponse({
      success: true,
      message: "Evidence submitted for verification.",
      evidence: data,
      note:
        "Evidence remains unverified. No IPO approval, identity verification or publication was performed.",
    });
  } catch (error) {
    console.error("IPO listing evidence API error:", error);

    return jsonResponse(
      {
        success: false,
        error: "Evidence submission failed.",
      },
      500
    );
  }
}
