import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";
import { runIpoMatching } from "@/lib/run-ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    // PREVIEW: use the new lifecycle-aware, read-only engine.
    if (!confirmLinking) {
      const result = await runIpoMatching();

      return NextResponse.json(
        {
          success: true,
          mode: "preview",
          result,
          message:
            "Upcoming DRHP matching preview completed. Historical and listed records are excluded. No database records were changed.",
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    // CONFIRM: preserve the existing candidate/evidence linking workflow.
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
        automatic_verification: false,
        automatic_publication: false,
        message:
          "Candidate and eligible evidence linking completed. Evidence verification and IPO publication were not changed.",
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
