export type IpoLifecycleStage =
  | "pre_filing"
  | "drhp_filed"
  | "udrhp_filed"
  | "rhp_filed"
  | "price_band_announced"
  | "issue_open"
  | "issue_closed"
  | "basis_of_allotment_published"
  | "listed"
  | "withdrawn"
  | "unknown";

export type LifecycleCandidate = {
  lifecycle_stage: IpoLifecycleStage;
  identity_match_status: "unverified";
  assessment_status: "pending";
  confidence_score: null;
  effective_date: null;
  reason: string;
};

export type LifecycleAssessment = {
  lifecycle_stage: IpoLifecycleStage;
  identity_match_status:
    | "unverified"
    | "matched"
    | "ambiguous"
    | "mismatch";
  assessment_status:
    | "pending"
    | "verified"
    | "conflict"
    | "rejected";
};

const FIELD_STAGE_MAP: Record<string, IpoLifecycleStage> = {
  prefilingofdraftofferdocumentadvertisement: "pre_filing",
  filingofdraftofferdocumentadvertisement: "drhp_filed",
  udrphiadvertisement: "udrhp_filed",
  filingofrhadvertisement: "rhp_filed",
  pricebandadvertisement: "price_band_announced",
  basisadvertisement: "basis_of_allotment_published",
};

export function normalizeEvidenceField(
  fieldName: string | null | undefined
): string {
  return (fieldName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function classifyLifecycleEvidence(
  fieldName: string | null | undefined
): LifecycleCandidate {
  const normalizedField = normalizeEvidenceField(fieldName);
  const stage = FIELD_STAGE_MAP[normalizedField] || "unknown";

  if (stage === "unknown") {
    return {
      lifecycle_stage: "unknown",
      identity_match_status: "unverified",
      assessment_status: "pending",
      confidence_score: null,
      effective_date: null,
      reason:
        "Document type is not recognized. Manual document verification is required.",
    };
  }

  return {
    lifecycle_stage: stage,
    identity_match_status: "unverified",
    assessment_status: "pending",
    confidence_score: null,
    effective_date: null,
    reason:
      "Potential lifecycle stage inferred from attachment category only. Document contents and issuer identity are not verified.",
  };
}

export function canAutoPublishLifecycle(
  assessment: LifecycleAssessment
): boolean {
  return (
    assessment.assessment_status === "verified" &&
    assessment.identity_match_status === "matched" &&
    assessment.lifecycle_stage !== "unknown"
  );
}
