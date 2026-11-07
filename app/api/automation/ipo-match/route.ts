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

const PAGE_SIZE = 500;
const MAX_RECORDS = 5000;
const UPDATE_BATCH_SIZE = 500;

type QueueRecord = {
  id: string;
  source_name: string;
  company_name: string;
  ipo_type: string | null;
  drhp_filed_date: string | null;
};

type MatchingUpdate = {
  id: string;
  normalized_company_name: string;
  confidence_score: number | null;
};

export async function POST(request: NextRequest) {
  try {
    // Same-origin protection
    const origin = request.headers.get("origin");
    const requestOrigin = new URL(request.url).origin;

    if (!origin || origin !== requestOrigin) {
      return NextResponse.json(
        { success: false, error: "Invalid request origin." },
        { status: 403 }
      );
    }

    // Owner/Admin authentication
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
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
        { success: false, error: "Owner/Admin access required." },
        { status: 403 }
      );
    }

    // Read queue in pages
    const records: QueueRecord[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("ipo_import_queue")
        .select(
          "id, source_name, company_name, ipo_type, drhp_filed_date"
        )
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json(
          { success: false, error: "Could not read IPO import queue." },
          { status: 500 }
        );
      }

      const page = (data || []) as QueueRecord[];
      records.push(...page);

      if (records.length > MAX_RECORDS) {
        return NextResponse.json(
          {
            success: false,
            error: `Queue exceeds the safe limit of ${MAX_RECORDS} records.`,
          },
          { status: 413 }
        );
      }

      if (page.length < PAGE_SIZE) break;

      offset += PAGE_SIZE;
    }

    // Prepare normalized records once
    const prepared = records.map((record) => ({
      ...record,
      normalized: normalizeCompanyName(record.company_name),
    }));

    const bestScores = new Map<string, number>();

    let candidatePairs = 0;
    let typeMismatchPairs = 0;

    // Compare records from different sources
    for (let i = 0; i < prepared.length; i++) {
      const first = prepared[i];

      if (!first.normalized) continue;

      for (let j = i + 1; j < prepared.length; j++) {
        const second = prepared[j];

        if (!second.normalized) continue;

        if (first.source_name === second.source_name) {
          continue;
        }

        const score = calculateCompanyNameSimilarity(
          first.company_name,
          second.company_name
        );

        if (
          !isStrongCompanyNameMatch(
            first.company_name,
            second.company_name
          )
        ) {
          continue;
        }

        // Same company name but different IPO board/type
        // is not treated as a confirmed event match.
        if (
          first.ipo_type &&
          second.ipo_type &&
          first.ipo_type !== second.ipo_type
        ) {
          typeMismatchPairs++;
          continue;
        }

        candidatePairs++;

        bestScores.set(
          first.id,
          Math.max(bestScores.get(first.id) || 0, score)
        );

        bestScores.set(
          second.id,
          Math.max(bestScores.get(second.id) || 0, score)
        );
      }
    }

    // Prepare safe metadata updates.
    // Verification and publication statuses are deliberately untouched.
    const updates: MatchingUpdate[] = prepared.map((record) => ({
      id: record.id,
      normalized_company_name: record.normalized,
      confidence_score: bestScores.get(record.id) ?? null,
    }));

    // Update records in batches.
    for (
      let i = 0;
      i < updates.length;
      i += UPDATE_BATCH_SIZE
    ) {
      const batch = updates.slice(i, i + UPDATE_BATCH_SIZE);

      const { error: updateError } = await supabaseAdmin
        .from("ipo_import_queue")
        .upsert(batch, { onConflict: "id" });

      if (updateError) {
        return NextResponse.json(
          {
            success: false,
            error: "Matching metadata update failed. Check server logs.",
          },
          { status: 500 }
        );
      }
    }

    const recordsWithCandidates = bestScores.size;

    await supabaseAdmin.from("automation_logs").insert({
      task_name: "ipo_matching",
      status: "success",
      message:
        `Processed ${records.length} records. ` +
        `${candidatePairs} cross-source candidate pairs found. ` +
        `${recordsWithCandidates} records have matching candidates. ` +
        `${typeMismatchPairs} type mismatches flagged. ` +
        "No records were automatically verified or published.",
    });

    return NextResponse.json(
      {
        success: true,
        processed: records.length,
        candidatePairs,
        recordsWithCandidates,
        typeMismatchPairs,
        verified: 0,
        published: 0,
        message:
          "IPO name matching completed. Verification and publication were not changed.",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "IPO matching failed. Check server logs.",
      },
      { status: 500 }
    );
  }
}
