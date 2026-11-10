"use client";

import { useState } from "react";

type Result = {
  success?: boolean;
  status?: string;
  source?: string;
  detected?: number;
  inserted?: number;
  duplicates?: number;
  message?: string;
  error?: string;
  matching?: {
    success?: boolean;
    mode?: string;
    error?: string;
    result?: {
      processed?: number;
      comparisons?: number;
      candidatePairs?: number;
      recordsWithCandidates?: number;
      verified?: number;
      linked?: number;
      published?: number;
    };
  };
  collection?: {
    evidenceInserted?: number;
    evidence_status?: string;
  };
};

export default function NseIpoCollectorButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runCollection() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/automation/ipo-collect-nse", {
        method: "POST",
        credentials: "same-origin",
      });

      const data: Result = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "NSE collection failed.");
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
    <section className="mt-6 rounded-2xl border border-blue-500/30 bg-slate-900 p-6">
      <p className="text-sm font-semibold text-blue-400">
        NSE AUTOMATION
      </p>

      <h2 className="mt-2 text-xl font-bold">
        NSE IPO Data Collection
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Collect official NSE filing records into the pending review queue.
        All collected evidence remains unverified until review.
      </p>

      <button
        type="button"
        onClick={runCollection}
        disabled={loading}
        className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Collecting NSE Data..." : "Run NSE Collection"}
      </button>

      {result && (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm">
          {result.error ? (
            <p className="text-red-400">{result.error}</p>
          ) : (
            <>
              <p className="font-semibold text-emerald-400">
                {result.status === "partial_success"
                  ? "Collection completed; matching needs attention"
                  : "Collection request completed"}
              </p>

              <p className="mt-2 text-slate-300">
                Detected: {result.detected ?? 0}
              </p>
              <p className="text-slate-300">
                Inserted: {result.inserted ?? 0}
              </p>
              <p className="text-slate-300">
                Duplicates: {result.duplicates ?? 0}
              </p>
              <p className="text-slate-300">
                Evidence inserted: {result.collection?.evidenceInserted ?? 0}
              </p>

              <div className="mt-4 border-t border-slate-700 pt-3">
                <p className="font-semibold text-blue-400">
                  IPO Matching Dry Run
                </p>

                {result.matching?.success ? (
                  <>
                    <p className="mt-2 text-emerald-400">
                      Read-only analysis completed
                    </p>
                    <p className="text-slate-300">
                      Records processed: {result.matching.result?.processed ?? 0}
                    </p>
                    <p className="text-slate-300">
                      Comparisons: {result.matching.result?.comparisons ?? 0}
                    </p>
                    <p className="text-slate-300">
                      Potential matches: {result.matching.result?.candidatePairs ?? 0}
                    </p>
                    <p className="text-slate-300">
                      Verified: {result.matching.result?.verified ?? 0}
                    </p>
                    <p className="text-slate-300">
                      Published: {result.matching.result?.published ?? 0}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-amber-400">
                    Matching failed: {result.matching?.error ?? "No matching result returned."}
                  </p>
                )}
              </div>

              <p className="mt-3 text-xs text-slate-500">
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
