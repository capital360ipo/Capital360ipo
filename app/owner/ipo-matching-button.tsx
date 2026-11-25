"use client";

import { useState } from "react";

type Pair = {
  first_company: string;
  first_source: string;
  second_company: string;
  second_source: string;
  similarity_score: number;
  threshold_gap: number;
  strong_match: boolean;
  first_ipo_type: string | null;
  second_ipo_type: string | null;
  issue_type_status: "match" | "mismatch";
  match_scope: "cross_source" | "same_source";
};

type SamplePair = {
  first_id: string;
  first_company: string;
  first_source: string;
  second_id: string;
  second_company: string;
  second_source: string;
  similarity_score: number;
  issue_type: string;
  match_scope: "cross_source" | "same_source";
};

type DiagnosticPair = {
  first_company: string;
  first_source: string;
  second_company: string;
  second_source: string;
  match_scope: "cross_source" | "same_source";
};

type PreviewResult = {
  mode?: string;
  readOnly?: boolean;
  databaseWrites?: number;
  processed?: number;
  sourceCounts?: Record<string, number>;
  statusCounts?: Record<string, number>;
  eligibleSourceCounts?: Record<string, number>;
  upcomingDrhpRecords?: number;
  eligibleUpcomingRecords?: number;
  missingOrUnknownTypeRecords?: number;
  historicalExcluded?: number;
  listedExcluded?: number;
  otherStatusExcluded?: number;
  totalPossiblePairs?: number;
  sameSourcePairsConsidered?: number;
  crossSourcePairsConsidered?: number;
  comparisons?: number;
  typeMismatchPairs?: number;
  typeMissingPairs?: number;
  tokenOverlapPairs?: number;
  noTokenOverlapPairs?: number;
  candidatePairs?: number;
  sameSourceCandidatePairs?: number;
  crossSourceCandidatePairs?: number;
  recordsWithCandidates?: number;
  topSimilarityPairs?: Pair[];
  topSimilarityLimit?: number;
  strongMatchThreshold?: number;
  samplePairs?: SamplePair[];
  sampleNoTokenOverlapPairs?: DiagnosticPair[];
  verified?: number;
  linked?: number;
  published?: number;
  candidate_linking?: {
    candidates_created?: number;
    existing_candidates_reused?: number;
    queue_records_linked?: number;
  };
  evidence_linking?: {
    evidence_linked?: number;
  };
};

type Result = {
  success?: boolean;
  mode?: "preview" | "executed";
  result?: PreviewResult;
  message?: string;
  error?: string;
};

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">
        {value ?? 0}
      </p>
    </div>
  );
}

export default function IpoMatchingButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runMatching(confirmLinking = false) {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/automation/ipo-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          confirmLinking ? { confirmLinking: true } : {}
        ),
      });

      const data = (await response.json()) as Result;

      if (!response.ok || !data.success) {
        setResult({
          success: false,
          error: data.error || "IPO matching failed.",
        });
        return;
      }

      setResult(data);
    } catch {
      setResult({
        success: false,
        error: "Matching request failed. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  const preview = result?.result;

  return (
    <section className="mt-6 rounded-2xl border border-cyan-500/30 bg-slate-900 p-5">
      <p className="text-sm font-semibold text-cyan-400">
        IPO MATCHING ENGINE
      </p>

      <h2 className="mt-2 text-xl font-bold text-white">
        Cross-Source & Duplicate Detection
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Upcoming DRHP records are compared across different sources
        and within the same source. Historical and listed IPOs are
        excluded. All matching results are diagnostic only.
      </p>

      <button
        type="button"
        onClick={() => runMatching(false)}
        disabled={loading}
        className="mt-4 rounded-lg bg-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Checking..." : "Run Matching Preview"}
      </button>

      {result && (
        <div className="mt-4 rounded-lg border border-slate-700 p-4 text-sm">
          {result.success ? (
            <>
              <p className="font-semibold text-emerald-400">
                {result.mode === "executed"
                  ? "Linking completed"
                  : "Preview completed"}
              </p>

              <p className="mt-2 text-cyan-300">
                Mode: {result.mode || "preview"}
              </p>

              {result.mode === "preview" && preview && (
                <>
                  <h3 className="mt-5 font-semibold text-white">
                    1. IPO Lifecycle Filtering
                  </h3>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Stat label="Total queue records" value={preview.processed} />
                    <Stat label="Upcoming DRHP" value={preview.upcomingDrhpRecords} />
                    <Stat label="Eligible upcoming" value={preview.eligibleUpcomingRecords} />
                    <Stat label="Unknown IPO type" value={preview.missingOrUnknownTypeRecords} />
                    <Stat label="Historical excluded" value={preview.historicalExcluded} />
                    <Stat label="Listed excluded" value={preview.listedExcluded} />
                  </div>

                  <h3 className="mt-5 font-semibold text-white">
                    2. Matching Comparison Statistics
                  </h3>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Stat label="Total possible pairs" value={preview.totalPossiblePairs} />
                    <Stat label="Comparisons performed" value={preview.comparisons} />
                    <Stat label="Same-source pairs" value={preview.sameSourcePairsConsidered} />
                    <Stat label="Cross-source pairs" value={preview.crossSourcePairsConsidered} />
                    <Stat label="Type mismatches" value={preview.typeMismatchPairs} />
                    <Stat label="Type missing records" value={preview.typeMissingPairs} />
                    <Stat label="Token overlap pairs" value={preview.tokenOverlapPairs} />
                    <Stat label="No token overlap" value={preview.noTokenOverlapPairs} />
                  </div>

                  <h3 className="mt-5 font-semibold text-white">
                    3. Potential Duplicate Matches
                  </h3>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Stat label="All strong matches" value={preview.candidatePairs} />
                    <Stat label="Records with matches" value={preview.recordsWithCandidates} />
                    <Stat label="Same-source matches" value={preview.sameSourceCandidatePairs} />
                    <Stat label="Cross-source matches" value={preview.crossSourceCandidatePairs} />
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    Strong match threshold: {preview.strongMatchThreshold ?? 90}%.
                    These are name-based signals, not verified IPO identities.
                  </p>

                  {preview.eligibleSourceCounts && (
                    <div className="mt-5 border-t border-slate-700 pt-3">
                      <h3 className="font-semibold text-cyan-300">
                        Eligible upcoming records by source
                      </h3>
                      {Object.entries(preview.eligibleSourceCounts).map(
                        ([source, count]) => (
                          <p key={source} className="mt-1 text-slate-300">
                            {source}: {count}
                          </p>
                        )
                      )}
                    </div>
                  )}

                  {preview.topSimilarityPairs &&
                    preview.topSimilarityPairs.length > 0 && (
                      <div className="mt-5 border-t border-slate-700 pt-3">
                        <h3 className="font-semibold text-cyan-300">
                          Top Similarity Matches
                        </h3>

                        <div className="mt-3 space-y-3">
                          {preview.topSimilarityPairs.map((pair, index) => (
                            <div
                              key={`${pair.first_source}-${pair.first_company}-${pair.second_source}-${pair.second_company}-${index}`}
                              className="rounded-lg border border-slate-700 p-3"
                            >
                              <div className="flex flex-wrap justify-between gap-2">
                                <span className="font-semibold text-white">
                                  Match #{index + 1}
                                </span>
                                <span className="text-cyan-300">
                                  {pair.similarity_score}%
                                </span>
                              </div>

                              <p className="mt-2 text-slate-200">
                                {pair.first_company}
                              </p>
                              <p className="text-xs text-slate-400">
                                Source: {pair.first_source}
                              </p>

                              <p className="my-2 text-center text-slate-500">
                                compared with
                              </p>

                              <p className="text-slate-200">
                                {pair.second_company}
                              </p>
                              <p className="text-xs text-slate-400">
                                Source: {pair.second_source}
                              </p>

                              <p className="mt-2 text-xs text-slate-400">
                                Scope: {pair.match_scope === "same_source"
                                  ? "Same source"
                                  : "Cross source"}
                              </p>

                              <p className="text-xs text-slate-400">
                                IPO type: {pair.first_ipo_type || "Unknown"}
                                {" / "}
                                {pair.second_ipo_type || "Unknown"}
                              </p>

                              <p className="text-xs">
                                {pair.strong_match ? (
                                  <span className="text-emerald-400">
                                    Strong name match — requires evidence verification
                                  </span>
                                ) : (
                                  <span className="text-amber-300">
                                    Similarity signal only — not a confirmed match
                                  </span>
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {(!preview.topSimilarityPairs ||
                    preview.topSimilarityPairs.length === 0) && (
                    <p className="mt-4 rounded-lg border border-slate-700 p-3 text-slate-400">
                      No token-overlap similarity pairs were found in this preview.
                    </p>
                  )}

                  {preview.samplePairs &&
                    preview.samplePairs.length > 0 && (
                      <div className="mt-5 border-t border-slate-700 pt-3">
                        <h3 className="font-semibold text-cyan-300">
                          Strong Match Samples
                        </h3>
                        {preview.samplePairs.map((pair, index) => (
                          <p
                            key={`${pair.first_id}-${pair.second_id}`}
                            className="mt-2 text-slate-300"
                          >
                            {index + 1}. {pair.first_company} ↔ {pair.second_company}
                            {" — "}
                            {pair.similarity_score}% ({pair.match_scope})
                          </p>
                        ))}
                      </div>
                    )}

                  {preview.sampleNoTokenOverlapPairs &&
                    preview.sampleNoTokenOverlapPairs.length > 0 && (
                      <details className="mt-5 border-t border-slate-700 pt-3">
                        <summary className="cursor-pointer font-semibold text-slate-300">
                          No-token-overlap diagnostic samples
                        </summary>
                        {preview.sampleNoTokenOverlapPairs.map((pair, index) => (
                          <p
                            key={`${pair.first_source}-${pair.first_company}-${pair.second_source}-${pair.second_company}-${index}`}
                            className="mt-2 text-xs text-slate-400"
                          >
                            {pair.first_company} ({pair.first_source}) ↔{" "}
                            {pair.second_company} ({pair.second_source})
                            {" — "}
                            {pair.match_scope}
                          </p>
                        ))}
                      </details>
                    )}

                  <div className="mt-5 border-t border-slate-700 pt-3 text-slate-300">
                    <p>Database writes: {preview.databaseWrites ?? 0}</p>
                    <p>Verified: {preview.verified ?? 0}</p>
                    <p>Linked: {preview.linked ?? 0}</p>
                    <p>Published: {preview.published ?? 0}</p>
                  </div>

                  <p className="mt-3 text-emerald-300">
                    Read-only preview. No database records were changed.
                  </p>
                </>
              )}

              {result.mode === "executed" && (
                <div className="mt-3 space-y-2 text-slate-300">
                  <p>
                    Queue records linked:{" "}
                    {preview?.candidate_linking?.queue_records_linked ?? 0}
                  </p>
                  <p>
                    New candidates created:{" "}
                    {preview?.candidate_linking?.candidates_created ?? 0}
                  </p>
                  <p>
                    Existing candidates reused:{" "}
                    {preview?.candidate_linking?.existing_candidates_reused ?? 0}
                  </p>
                  <p>
                    Evidence records linked:{" "}
                    {preview?.evidence_linking?.evidence_linked ?? 0}
                  </p>
                  <p className="mt-2 text-amber-300">
                    Evidence verification and IPO publication were not performed.
                  </p>
                </div>
              )}

              <p className="mt-3 text-slate-400">
                {result.message}
              </p>

              {result.mode === "preview" && (
                <div className="mt-5 rounded-lg border border-amber-500/40 bg-amber-950/30 p-4">
                  <p className="font-semibold text-amber-300">
                    Confirm Automatic Linking
                  </p>

                  <p className="mt-2 text-slate-300">
                    This action links eligible queue and evidence records.
                    It does not verify evidence or publish IPOs.
                  </p>

                  <button
                    type="button"
                    onClick={() => runMatching(true)}
                    disabled={loading}
                    className="mt-4 rounded-lg bg-amber-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {loading ? "Linking..." : "Confirm Linking"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-red-400">
              {result.error || "IPO matching failed."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
