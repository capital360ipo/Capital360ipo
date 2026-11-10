"use client";

import { useState } from "react";

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
    result?: {
      processed?: number;
      comparisons?: number;
      candidatePairs?: number;
      recordsWithCandidates?: number;
      verified?: number;
      linked?: number;
      published?: number;
    } | null;
  };
};

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

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-slate-500">Detected</p>
                  <p className="mt-1 text-xl font-bold">
                    {result.collection?.detected ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-slate-500">Inserted</p>
                  <p className="mt-1 text-xl font-bold">
                    {result.collection?.inserted ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-slate-500">Duplicates</p>
                  <p className="mt-1 text-xl font-bold">
                    {result.collection?.duplicates ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-slate-500">Evidence Inserted</p>
                  <p className="mt-1 text-xl font-bold">
                    {result.collection?.evidenceInserted ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-slate-500">Evidence Duplicates</p>
                  <p className="mt-1 text-xl font-bold">
                    {result.collection?.evidenceDuplicates ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t border-slate-700 pt-4">
                <p className="font-semibold text-blue-400">
                  IPO Matching Dry Run
                </p>

                {result.matching?.success ? (
                  <>
                    <p className="mt-2 text-emerald-400">
                      Read-only analysis completed
                    </p>

                    <p className="mt-2 text-slate-300">
                      Records processed: {result.matching.result?.processed ?? 0}
                    </p>
                    <p className="text-slate-300">
                      Comparisons: {result.matching.result?.comparisons ?? 0}
                    </p>
                    <p className="text-slate-300">
                      Potential matches: {result.matching.result?.candidatePairs ?? 0}
                    </p>
                    <p className="text-slate-300">
                      Records with candidates: {result.matching.result?.recordsWithCandidates ?? 0}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-amber-400">
                    Matching failed: {result.matching?.error ?? "No matching result returned."}
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
