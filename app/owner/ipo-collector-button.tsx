
"use client";

import { useState } from "react";

type MatchingResult = {
  processed?: number;
  sourceCounts?: Record<string, number>;
  totalPossiblePairs?: number;
  sameSourcePairsExcluded?: number;
  possibleCrossSourcePairs?: number;
  crossSourcePairsConsidered?: number;
  comparisons?: number;
  typeMismatchPairs?: number;
  tokenOverlapPairs?: number;
  noTokenOverlapPairs?: number;
  candidatePairs?: number;
  recordsWithCandidates?: number;
  verified?: number;
  linked?: number;
  published?: number;
  readOnly?: boolean;
  databaseWrites?: number;
};

type Result = {
  success?: boolean;
  status?: string;
  error?: string;
  review_status?: string;
  evidence_status?: string;
  collection?: {
    success?: boolean;
    detected?: number;
    inserted?: number;
    duplicates?: number;
    evidenceInserted?: number;
    evidenceDuplicates?: number;
    message?: string;
  };
  matching?: {
    success?: boolean;
    status?: string;
    mode?: string;
    error?: string | null;
    result?: MatchingResult | null;
  };
};

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-100">
        {value}
      </p>
    </div>
  );
}

export default function IpoCollectorButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runCollection() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/automation/ipo-collect", {
        method: "POST",
        credentials: "same-origin",
      });

      const data: Result = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "SEBI collection failed.");
      }

      setResult(data);
    } catch (error) {
      setResult({
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  }

  const matching = result?.matching?.result;

  return (
    <section className="mt-6 rounded-2xl border border-emerald-500/30 bg-slate-900 p-6">
      <p className="text-sm font-semibold text-emerald-400">
        SEBI AUTOMATION CONTROL
      </p>

      <h2 className="mt-2 text-xl font-bold">
        SEBI IPO Data Collection
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Collect official SEBI IPO filing records into the pending review
        queue. Collected evidence remains unverified until review.
      </p>

      <button
        type="button"
        onClick={runCollection}
        disabled={loading}
        className="mt-5 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Collecting SEBI Data..." : "Run SEBI Collection"}
      </button>

      {result && (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm">
          {result.error ? (
            <p className="text-red-400">{result.error}</p>
          ) : (
            <>
              <p className="font-semibold text-emerald-400">
                {result.status === "partial_success"
                  ? "Collection completed; matching needs attention"
                  : "SEBI Collection Completed"}
              </p>

              <h3 className="mt-4 font-semibold text-slate-200">
                Collection Summary
              </h3>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric label="Detected" value={result.collection?.detected ?? 0} />
                <Metric label="Inserted" value={result.collection?.inserted ?? 0} />
                <Metric label="Duplicates" value={result.collection?.duplicates ?? 0} />
                <Metric label="Evidence Inserted" value={result.collection?.evidenceInserted ?? 0} />
                <Metric label="Evidence Duplicates" value={result.collection?.evidenceDuplicates ?? 0} />
              </div>

              <div className="mt-5 border-t border-slate-700 pt-4">
                <p className="font-semibold text-blue-400">
                  IPO Matching Dry Run
                </p>

                {result.matching?.success && matching ? (
                  <>
                    <p className="mt-2 text-emerald-400">
                      Read-only analysis completed
                    </p>

                    <h4 className="mt-4 font-semibold text-slate-200">
                      Matching Overview
                    </h4>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Metric label="Records Processed" value={matching.processed ?? 0} />
                      <Metric label="Total Possible Pairs" value={matching.totalPossiblePairs ?? 0} />
                      <Metric label="Same-source Excluded" value={matching.sameSourcePairsExcluded ?? 0} />
                      <Metric label="Possible Cross-source Pairs" value={matching.possibleCrossSourcePairs ?? 0} />
                      <Metric label="Cross-source Considered" value={matching.crossSourcePairsConsidered ?? 0} />
                      <Metric label="Actual Comparisons" value={matching.comparisons ?? 0} />
                    </div>

                    <h4 className="mt-5 font-semibold text-slate-200">
                      Matching Diagnostics
                    </h4>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Metric label="Token Overlap Pairs" value={matching.tokenOverlapPairs ?? 0} />
                      <Metric label="No Token Overlap Pairs" value={matching.noTokenOverlapPairs ?? 0} />
                      <Metric label="IPO Type Mismatches" value={matching.typeMismatchPairs ?? 0} />
                      <Metric label="Potential Matches" value={matching.candidatePairs ?? 0} />
                      <Metric label="Records with Candidates" value={matching.recordsWithCandidates ?? 0} />
                    </div>

                    {matching.sourceCounts && (
                      <>
                        <h4 className="mt-5 font-semibold text-slate-200">
                          Source-wise Records
                        </h4>

                        <div className="mt-2 space-y-2">
                          {Object.entries(matching.sourceCounts).map(
                            ([source, count]) => (
                              <div
                                key={source}
                                className="flex justify-between rounded-lg bg-slate-900 px-3 py-2"
                              >
                                <span className="text-slate-300">{source}</span>
                                <span className="font-semibold text-slate-100">
                                  {count}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </>
                    )}

                    <div className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <p className="font-semibold text-emerald-400">
                        Safety Status
                      </p>
                      <p className="mt-2 text-slate-300">
                        Read-only: {matching.readOnly === true ? "Yes" : "Not confirmed"}
                      </p>
                      <p className="text-slate-300">
                        Database writes: {matching.databaseWrites ?? "Not reported"}
                      </p>
                      <p className="text-slate-300">
                        Automatically verified: {matching.verified ?? 0}
                      </p>
                      <p className="text-slate-300">
                        Automatically linked: {matching.linked ?? 0}
                      </p>
                      <p className="text-slate-300">
                        Automatically published: {matching.published ?? 0}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-amber-400">
                    Matching failed:{" "}
                    {result.matching?.error ??
                      "No matching result returned."}
                  </p>
                )}
              </div>

              <p className="mt-4 text-xs text-slate-400">
                Source: SEBI · Review: Pending · Evidence: Unverified
              </p>

              <p className="mt-2 text-xs text-slate-500">
                Matching is read-only. No IPO is automatically verified,
                approved, linked, or published.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
