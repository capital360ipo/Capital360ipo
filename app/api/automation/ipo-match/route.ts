
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeCompanyName,
  calculateCompanyNameSimilarity,
  isStrongCompanyNameMatch,
} from "@/lib/ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QueueRecord = {
  id: string;
  source_name: string;
  company_name: string;
  normalized_company_name: string | null;
  verification_status: string;
  confidence_score: number | string | null;
};

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");

    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (
      profileError ||
      !profile ||
      !["owner", "admin"].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: "Owner/Admin access required." },
        { status: 403 }
      );
    }

    const records: QueueRecord[] = [];
    const pageSize = 500;
    let offset = 0;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("ipo_import_queue")
        .select(
          "id, source_name, company_name, normalized_company_name, verification_status, confidence_score"
        )
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error("Unable to read IPO import queue.");
      }

      const page = (data || []) as QueueRecord[];
      records.push(...page);

      if (page.length < pageSize) break;

      offset += pageSize;

      if (records.length >= 5000) {
        throw new Error(
          "Queue exceeds the initial matching limit of 5000 records."
        );
      }
    }

    const prepared = records.map((record) => ({
      ...record,
      normalized: normalizeCompanyName(record.company_name),
    }));

    let normalized = 0;
    let corroborated = 0;
    let conflicts = 0;
    let updated = 0;

    for (const record of prepared) {
      if (!record.normalized) continue;

      const candidates = prepared.filter(
        (other) =>
          other.id !== record.id &&
          other.source_name !== record.source_name &&
          isStrongCompanyNameMatch(
            record.normalized,
            other.normalized
          )
      );

      const candidateNames = new Set(
        candidates.map((candidate) => candidate.normalized)
      );

      let verificationStatus = "unverified";
      let confidenceScore: number | null = null;

      if (candidates.length > 0) {
        confidenceScore = Math.max(
          ...candidates.map((candidate) =>
            calculateCompanyNameSimilarity(
              record.normalized,
              candidate.normalized
            )
          )
        );

        if (candidateNames.size === 1) {
          verificationStatus = "corroborated";
          corroborated++;
        } else {
          verificationStatus = "conflict";
          conflicts++;
        }
      }

      normalized++;

      const oldScore =
        record.confidence_score === null
          ? null
          : Number(record.confidence_score);

      const changed =
        record.normalized_company_name !== record.normalized ||
        record.verification_status !== verificationStatus ||
        oldScore !== confidenceScore;

      if (!changed) continue;

      const { error } = await supabaseAdmin
        .from("ipo_import_queue")
        .update({
          normalized_company_name: record.normalized,
          verification_status: verificationStatus,
          confidence_score: confidenceScore,
        })
        .eq("id", record.id);

      if (error) {
        throw new Error("Unable to update matching result.");
      }

      updated++;
    }

    const message =
      `Scanned: ${records.length}, Normalized: ${normalized}, Corroborated: ${corroborated}, Conflicts: ${conflicts}, Updated: ${updated}`;

    await supabaseAdmin.from("automation_logs").insert({
      task_name: "IPO Multi-Source Matching",
      status: "success",
      message: message.slice(0, 500),
    });

    return NextResponse.json(
      {
        success: true,
        scanned: records.length,
        normalized,
        corroborated,
        conflicts,
        updated,
        message,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown matching error";

    console.error("IPO matching failed:", message);

    await supabaseAdmin.from("automation_logs").insert({
      task_name: "IPO Multi-Source Matching",
      status: "failed",
      message: message.slice(0, 500),
    });

    return NextResponse.json(
      { success: false, error: "IPO matching failed." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
