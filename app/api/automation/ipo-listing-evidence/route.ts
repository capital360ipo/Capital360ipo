
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function isOfficialHost(hostname: string) {
  return OFFICIAL_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`)
  );
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) {
      return NextResponse.json(
        { success: false, error: "Invalid request origin." },
        { status: 403 }
      );
    }

    await requireApiRole(["owner", "admin", "editor"]);

    const body = await request.json();

    const {
      listing_history_id,
      source_name,
      source_url,
      evidence_type,
      field_name,
      field_value,
      issuer_name,
    } = body ?? {};

    if (
      typeof listing_history_id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(listing_history_id)
    ) {
      return NextResponse.json(
        { success: false, error: "Valid listing_history_id is required." },
        { status: 400 }
      );
    }

    if (
      typeof source_name !== "string" ||
      !source_name.trim() ||
      source_name.trim().length > 100
    ) {
      return NextResponse.json(
        { success: false, error: "Valid source_name is required." },
        { status: 400 }
      );
    }

    if (
      !ALLOWED_EVIDENCE_TYPES.includes(evidence_type)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid evidence_type." },
        { status: 400 }
      );
    }

    if (
      source_url !== undefined &&
      source_url !== null &&
      (typeof source_url !== "string" || source_url.length > 2000)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid source_url." },
        { status: 400 }
      );
    }

    let safeUrl: string | null = null;
    let officialSource = false;

    if (source_url) {
      let parsedUrl: URL;

      try {
        parsedUrl = new URL(source_url);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid source URL." },
          { status: 400 }
        );
      }

      if (
        parsedUrl.protocol !== "https:" ||
        parsedUrl.username ||
        parsedUrl.password
      ) {
        return NextResponse.json(
          { success: false, error: "Only secure HTTPS URLs are allowed." },
          { status: 400 }
        );
      }

      safeUrl = parsedUrl.toString();
      officialSource = isOfficialHost(parsedUrl.hostname);
    }

    for (const [name, value] of Object.entries({
      field_name,
      field_value,
      issuer_name,
    })) {
      if (
        value !== undefined &&
        value !== null &&
        (typeof value !== "string" || value.length > 1000)
      ) {
        return NextResponse.json(
          { success: false, error: `Invalid ${name}.` },
          { status: 400 }
        );
      }
    }

    const { data: listing, error: listingError } =
      await supabaseAdmin
        .from("ipo_listing_history")
        .select("id, company_name, symbol, review_status")
        .eq("id", listing_history_id)
        .maybeSingle();

    if (listingError || !listing) {
      return NextResponse.json(
        { success: false, error: "Listing history record not found." },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("ipo_listing_evidence")
      .insert({
        listing_history_id,
        source_name: source_name.trim(),
        source_url: safeUrl,
        evidence_type,
        field_name: field_name?.trim() || null,
        field_value: field_value?.trim() || null,
        issuer_name: issuer_name?.trim() || null,
        is_official_source: officialSource,
        validation_status: "unverified",
        validated_by: null,
        validated_at: null,
        metadata: {
          submitted_by_api: true,
        },
      })
      .select("id, listing_history_id, source_name, evidence_type, validation_status, is_official_source")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Duplicate evidence already exists." },
          { status: 409 }
        );
      }

      console.error("IPO evidence insert error:", error);

      return NextResponse.json(
        { success: false, error: "Evidence could not be saved." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Evidence saved for verification.",
      evidence: data,
    });
  } catch (error) {
    console.error("IPO evidence API error:", error);

    return NextResponse.json(
      { success: false, error: "Request failed or access denied." },
      { status: 500 }
    );
  }
}
