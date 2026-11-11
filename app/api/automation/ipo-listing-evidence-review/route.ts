
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiRole(["owner", "admin", "editor"]);

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const listingHistoryId =
      request.nextUrl.searchParams.get("listing_history_id");

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!listingHistoryId || !uuidPattern.test(listingHistoryId)) {
      return jsonResponse(
        {
          success: false,
          error: "A valid listing_history_id is required.",
        },
        400
      );
    }

    const { data, error, count } = await supabaseAdmin
      .from("ipo_listing_evidence")
      .select(
        `
          id,
          listing_history_id,
          source_name,
          source_url,
          evidence_type,
          field_name,
          field_value,
          issuer_name,
          is_official_source,
          validation_status,
          observed_at,
          validated_by,
          validated_at,
          validation_notes,
          created_at
        `,
        { count: "exact" }
      )
      .eq("listing_history_id", listingHistoryId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(error.message);
    }

    return jsonResponse({
      success: true,
      mode: "READ_ONLY",
      total: count ?? 0,
      returned: data?.length ?? 0,
      evidence: data ?? [],
      note:
        "Evidence records fetched for review. No verification or database changes were performed.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown evidence review error";

    console.error("IPO listing evidence review API failed:", message);

    return jsonResponse(
      {
        success: false,
        error: "Unable to load IPO evidence records.",
      },
      500
    );
  }
}
