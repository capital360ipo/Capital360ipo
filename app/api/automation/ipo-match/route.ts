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
  ipo_type: string | null;
  drhp_filed_date: string | null;
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

    // Read queue safely in pages
    const records: QueueRecord[] = [];
    const pageSize = 500;
    let offset = 0;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("ipo_import_queue")
        .select(
          "id, source_name, company_name, ipo_type, drhp_filed_date"
        )
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        return NextResponse.json(
          { success: false, error: "Could not read IPO import queue." },
          { status: 500 }
        );
      }

      const page = (data || []) as QueueRecord[];
      records.push(...page);

      if (page.length < pageSize) break;

      offset += pageSize;

      if (records.length >= 5000) {
        return NextResponse.json(
          {
            success: false,
            error: "Queue exceeds the safe processing limit of 5,000 records.",
          },
          { status: 413 }
        );
      }
    }

    let processed = 0;
    let candidatesFound = 0;

    for (const record of records) {
      const normalizedName = normalizeCompanyName(record.company_name);

      let bestScore = 0;
      let hasCandidate = false;

      for (const other of records) {
        if (other.id === record.id) continue;
        if (other.source_name === record.source_name) continue;

        const score = calculateCompanyNameSimilarity(
          record.company_name,
          other.company_name
        );

        if (
          isStrongCompanyNameMatch(
            record.company_name,
            other.company_name
          ) &&
          score > bestScore
        ) {
          bestScore = score;
          hasCandidate = true;
        }
      }

      if (hasCandidate) candidatesFound++;

      // Name similarity is only a candidate signal.
      // It does NOT prove that two records refer to the same IPO.
      const { error: updateError } = await supabaseAdmin
        .from("ipo_import_queue")
        .update({
          normalized_company_name: normalizedName,
          verification_status: "unverified",
          confidence_score: hasCandidate ? bestScore : null,
        })
        .eq("id", record.id);

      if (updateError) {
        return NextResponse.json(
          {
            success: false,
            error: "A queue record could not be updated. Check server logs.",
            processed,
          },
          { status: 500 }
        );
      }

      processed++;
    }

    await supabaseAdmin.from("automation_logs").insert({
      task_name: "ipo_matching",
      status: "success",
      message: `Processed ${processed} records. ${candidatesFound} records had strong cross-source name candidates. No records were automatically verified or published.`,
    });

    return NextResponse.json(
      {
        success: true,
        processed,
        candidatesFound,
        verified: 0,
        message:
          "Name matching completed. All records remain unverified pending independent source checks.",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "IPO matching failed. Check server logs." },
      { status: 500 }
    );
  }
}
