
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";
import {
  normalizeCompanyName,
  calculateCompanyNameSimilarity,
  isStrongCompanyNameMatch,
} from "@/lib/ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const MAX_RECORDS = 5000;

type QueueRecord = {
  id: string;
  source_name: string;
  company_name: string;
  ipo_type: string | null;
  normalized_company_name: string | null;
  candidate_id: string | null;
  matched_ipo_id: string | null;
  review_status: string | null;
  verification_status: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const requestOrigin = new URL(request.url).origin;

    if (!origin || origin !== requestOrigin) {
      return NextResponse.json(
        { success: false, error: "Invalid request origin." },
        { status: 403 }
      );
    }

    const auth = await requireApiRole(["owner", "admin"]);

    if (!auth.authorized) {
      return auth.response;
    }

    let confirmLinking = false;
    const bodyText = await request.text();

    if (bodyText.trim()) {
      let body: unknown;

      try {
        body = JSON.parse(bodyText);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid request body." },
          { status: 400 }
        );
      }

      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      ) {
        return NextResponse.json(
          { success: false, error: "Invalid request body." },
          { status: 400 }
        );
      }

      confirmLinking =
        (body as { confirmLinking?: unknown }).confirmLinking === true;
    }

    const records: QueueRecord[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("ipo_import_queue")
        .select(
          "id, source_name, company_name, ipo_type, normalized_company_name, candidate_id, matched_ipo_id, review_status, verification_status"
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

    if (confirmLinking) {
      const { data: candidateResult, error: candidateError } =
        await supabaseAdmin.rpc("link_ipo_queue_candidates");

      if (candidateError) {
        return NextResponse.json(
          {
            success: false,
            error: "Candidate linking failed.",
          },
          { status: 500 }
        );
      }

      const { data: evidenceResult, error: evidenceError } =
        await supabaseAdmin.rpc(
          "link_ipo_source_evidence_candidates"
        );

      if (evidenceError) {
        await supabaseAdmin.from("automation_logs").insert({
          task_name: "ipo_evidence_candidate_linking",
          status: "error",
          message: evidenceError.message,
        });

        return NextResponse.json(
          {
            success: false,
            candidate_linking: candidateResult,
            error:
              "Candidate linking completed, but evidence linking failed. Check the database before retrying.",
          },
          { status: 500 }
        );
      }

      const { error: logError } = await supabaseAdmin
        .from("automation_logs")
        .insert({
          task_name: "ipo_candidate_and_evidence_linking",
          status: "success",
          message: JSON.stringify({
            candidate_linking: candidateResult,
            evidence_linking: evidenceResult,
          }),
        });

      return NextResponse.json(
        {
          success: true,
          mode: "executed",
          result: {
            candidate_linking: candidateResult,
            evidence_linking: evidenceResult,
          },
          audit_log_saved: !logError,
          message:
            "Candidate and eligible evidence linking completed. Evidence verification and IPO publication were not changed.",
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const bestScores = new Map<string, number>();
    let candidatePairs = 0;
    let typeMismatchPairs = 0;

    const prepared = records.map((record) => ({
      ...record,
      normalized: normalizeCompanyName(record.company_name),
    }));

    for (let i = 0; i < prepared.length; i++) {
      const first = prepared[i];

      if (!first.normalized) continue;

      for (let j = i + 1; j < prepared.length; j++) {
        const second = prepared[j];

        if (
          !second.normalized ||
          first.source_name === second.source_name
        ) {
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

    const { count: totalCandidates, error: candidateError } =
      await supabaseAdmin
        .from("ipo_candidates")
        .select("id", { count: "exact", head: true });

    if (candidateError) {
      return NextResponse.json(
        { success: false, error: "Could not inspect candidate table." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        mode: "preview",
        processed: records.length,
        candidatePairs,
        recordsWithCandidates: bestScores.size,
        typeMismatchPairs,
        alreadyLinked: records.filter(
          (record) => record.candidate_id !== null
        ).length,
        masterMatched: records.filter(
          (record) => record.matched_ipo_id !== null
        ).length,
        pendingCandidateLinking: records.filter(
          (record) =>
            record.candidate_id === null &&
            record.ipo_type !== null &&
            record.normalized_company_name !== null &&
            record.normalized_company_name.trim() !== "" &&
            record.review_status !== "rejected" &&
            record.verification_status !== "conflict"
        ).length,
        unknownType: records.filter(
          (record) =>
            record.ipo_type === null ||
            record.normalized_company_name === null ||
            !record.normalized_company_name.trim()
        ).length,
        totalCandidates: totalCandidates ?? 0,
        verified: 0,
        published: 0,
        message:
          "Preview only. No database records were changed.",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("IPO matching failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "IPO matching failed. Check server logs.",
      },
      { status: 500 }
    );
  }
}
