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

async function checkRole() {
  return requireApiRole(["owner", "admin"]);
}

export async function GET() {
  const auth = await checkRole();

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

    if (error) throw error;

    const records = (data ?? []).filter(
      (ipo) =>
        !ipo.registrar_url?.trim() ||
        !ipo.apply_url?.trim()
    );

    return jsonResponse({
      success: true,
      mode: "READ_ONLY",
      total: records.length,
      records,
      databaseModified: false,
    });
  } catch (error) {
    console.error("IPO link enrichment GET error:", error);

    return jsonResponse({
      success: false,
      error: "Unable to inspect IPO link records.",
    }, 500);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return jsonResponse({
      success: false,
      error: "Invalid request origin.",
    }, 403);
  }

  const auth = await checkRole();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { data: ipos, error: fetchError } = await supabaseAdmin
      .from("ipo_master")
      .select(
        "id, company_name, registrar_name, registrar_url, apply_url"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (fetchError) throw fetchError;

    const candidates = (ipos ?? []).filter(
      (ipo) =>
        !ipo.registrar_url?.trim() ||
        !ipo.apply_url?.trim()
    );

    if (candidates.length === 0) {
      return jsonResponse({
        success: true,
        mode: "PENDING_QUEUE_SYNC",
        detected: 0,
        inserted: 0,
        databaseModified: false,
      });
    }

    const queueRecords = candidates.map((ipo) => ({
      ipo_master_id: ipo.id,
      registrar_name: ipo.registrar_name,
      registrar_url: ipo.registrar_url,
      apply_url: ipo.apply_url,
      verification_status: "pending",
      approval_status: "pending",
      source_name: "IPO Master queue discovery",
    }));

    const { data: insertedRecords, error: insertError } =
      await supabaseAdmin
        .from("ipo_link_enrichment")
        .upsert(queueRecords, {
          onConflict: "ipo_master_id",
          ignoreDuplicates: true,
        })
        .select("id");

    if (insertError) throw insertError;

    const inserted = insertedRecords?.length ?? 0;

    return jsonResponse({
      success: true,
      mode: "PENDING_QUEUE_SYNC",
      detected: candidates.length,
      inserted,
      alreadyPresent: candidates.length - inserted,
      verificationStatus: "pending",
      approvalStatus: "pending",
      automaticVerification: 0,
      automaticApproval: 0,
      automaticPublication: 0,
      databaseModified: inserted > 0,
      note:
        "Queue records created without verifying, approving or publishing any links. Existing records were not overwritten.",
    });
  } catch (error) {
    console.error("IPO link enrichment POST error:", error);

    return jsonResponse({
      success: false,
      error: "Unable to create IPO link enrichment queue.",
      databaseModified: false,
    }, 500);
  }
}
