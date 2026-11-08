
import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { classifyLifecycleEvidence } from "@/lib/ipo-lifecycle";

type EvidenceRow = {
  id: string;
  queue_id: string;
  source_name: string;
  evidence_type: string;
  field_name: string | null;
  validation_status: string;
  metadata: Record<string, unknown> | null;
};

export async function runIpoLifecycleAssessment() {
  const { data: evidence, error: evidenceError } =
    await supabaseAdmin
      .from("ipo_source_evidence")
      .select(
        "id, queue_id, source_name, evidence_type, field_name, validation_status, metadata"
      )
      .limit(5000);

  if (evidenceError) {
    throw new Error(
      `Evidence fetch failed: ${evidenceError.message}`
    );
  }

  const { data: existing, error: existingError } =
    await supabaseAdmin
      .from("ipo_lifecycle_assessments")
      .select("evidence_ids")
      .limit(10000);

  if (existingError) {
    throw new Error(
      `Existing assessment fetch failed: ${existingError.message}`
    );
  }

  const processedEvidence = new Set<string>();

  for (const assessment of existing || []) {
    const ids = assessment.evidence_ids;

    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id === "string") {
          processedEvidence.add(id);
        }
      }
    }
  }

  const eligibleEvidence = (evidence || []).filter(
    (item: EvidenceRow) =>
      item.source_name === "NSE" &&
      item.evidence_type === "nse_attachment" &&
      item.validation_status !== "invalid" &&
      item.validation_status !== "conflict" &&
      item.metadata?.superseded !== true
  );

  const assessmentRows = [];

  let skipped = 0;

  for (const item of eligibleEvidence) {
    if (processedEvidence.has(item.id)) {
      skipped++;
      continue;
    }

    const candidate = classifyLifecycleEvidence(
      item.field_name
    );

    if (candidate.lifecycle_stage === "unknown") {
      skipped++;
      continue;
    }

    assessmentRows.push({
      queue_id: item.queue_id,
      lifecycle_stage: candidate.lifecycle_stage,
      identity_match_status:
        candidate.identity_match_status,
      assessment_status: candidate.assessment_status,
      confidence_score: candidate.confidence_score,
      effective_date: candidate.effective_date,
      evidence_ids: [item.id],
      source_summary:
        `${item.source_name}: ${item.field_name}`,
      assessment_notes: candidate.reason,
    });
  }

  if (assessmentRows.length === 0) {
    return {
      success: true,
      detected: eligibleEvidence.length,
      inserted: 0,
      skipped,
      message: "No new lifecycle assessments to create.",
    };
  }

  const batchSize = 200;
  let inserted = 0;

  for (
    let i = 0;
    i < assessmentRows.length;
    i += batchSize
  ) {
    const batch = assessmentRows.slice(
      i,
      i + batchSize
    );

    const { data, error } = await supabaseAdmin
      .from("ipo_lifecycle_assessments")
      .insert(batch)
      .select("id");

    if (error) {
      throw new Error(
        `Lifecycle assessment insert failed: ${error.message}`
      );
    }

    inserted += data?.length || 0;
  }

  return {
    success: true,
    detected: eligibleEvidence.length,
    inserted,
    skipped,
    message:
      "Pending lifecycle assessments created. No IPO was verified or published.",
  };
}
