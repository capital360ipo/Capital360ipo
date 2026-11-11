
import "server-only";

import { NextResponse } from "next/server";
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

export async function GET() {
  const auth = await requireApiRole(["owner", "admin", "editor"]);

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { data, error, count } = await supabaseAdmin
      .from("ipo_listing_history")
      .select(
        `
          id,
          company_name,
          symbol,
          listing_date,
          issue_price,
          listing_day_close,
          listing_day_gain_percent,
          ltp,
          current_gain_percent,
          review_status,
          source,
          source_observed_at,
          created_at
        `,
        { count: "exact" }
      )
      .eq("review_status", "pending")
      .order("listing_date", { ascending: false })
      .order("company_name", { ascending: true })
      .limit(1000);

    if (error) {
      throw new Error(error.message);
    }

    return jsonResponse({
      success: true,
      mode: "READ_ONLY",
      total: count ?? 0,
      records: data ?? [],
      returned: data?.length ?? 0,
      note:
        "Pending listing history records fetched for review. No database records were modified.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown listing history review error";

    console.error("IPO listing history review API failed:", message);

    return jsonResponse(
      {
        success: false,
        error: "Unable to load IPO listing history records.",
      },
      500
    );
  }
}
