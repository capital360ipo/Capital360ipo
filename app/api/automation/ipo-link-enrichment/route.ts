
import "server-only";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiRole(["owner", "admin"]);

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("ipo_master")
      .select(
        "id, company_name, open_date, close_date, status, registrar_name, registrar_url, apply_url"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    const records = (data ?? []).filter(
      (ipo) =>
        !ipo.registrar_url?.trim() ||
        !ipo.apply_url?.trim()
    );

    return NextResponse.json({
      success: true,
      mode: "READ_ONLY",
      total: records.length,
      records,
      databaseModified: false,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("IPO link enrichment error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to inspect IPO link records.",
      },
      { status: 500 }
    );
  }
}
