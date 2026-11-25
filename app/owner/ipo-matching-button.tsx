"use client";

import { useState } from "react";

type Result = {
  success?: boolean;
  mode?: "preview" | "executed";
  processed?: number;
  candidatePairs?: number;
  recordsWithCandidates?: number;
  typeMismatchPairs?: number;
  alreadyLinked?: number;
  masterMatched?: number;
  pendingCandidateLinking?: number;
  unknownType?: number;
  totalCandidates?: number;
  verified?: number;
  published?: number;
  result?: {
    candidate_linking?: {
      candidates_created?: number;
      existing_candidates_reused?: number;
      queue_records_linked?: number;
    };
    evidence_linking?: {
      evidence_linked?: number;
    };
  };
  message?: string;
  error?: string;
};

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

  return (
    <section className="mt-6 rounded-2xl border border-cyan-500/30 bg-slate-900 p-5">
      <p className="text-sm font-semibold text-cyan-400">
        IPO MATCHING ENGINE
      </p>

      <h2 className="mt-2 text-xl font-bold text-white">
        Cross-Source Matching
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Automatically link eligible IPO queue records and
        matching official source evidence to IPO candidates.
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

              {result.mode === "preview" ? (
                <div className="mt-3 space-y-2 text-slate-300">
                  <p>Records processed: {result.processed ?? 0}</p>
                  <p>Matching pairs: {result.candidatePairs ?? 0}</p>
                  <p>Records with name matches: {result.recordsWithCandidates ?? 0}</p>
                  <p>Type mismatches: {result.typeMismatchPairs ?? 0}</p>
                  <p>Already linked: {result.alreadyLinked ?? 0}</p>
                  <p>Pending candidate linking: {result.pendingCandidateLinking ?? 0}</p>
                  <p>Unknown type: {result.unknownType ?? 0}</p>
                  <p>Total candidates: {result.totalCandidates ?? 0}</p>
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-slate-300">
                  <p>
                    Queue records linked:{" "}
                    {result.result?.candidate_linking?.queue_records_linked ?? 0}
                  </p>
                  <p>
                    New candidates created:{" "}
                    {result.result?.candidate_linking?.candidates_created ?? 0}
                  </p>
                  <p>
                    Existing candidates reused:{" "}
                    {result.result?.candidate_linking?.existing_candidates_reused ?? 0}
                  </p>
                  <p>
                    Evidence records linked:{" "}
                    {result.result?.evidence_linking?.evidence_linked ?? 0}
                  </p>
                </div>
              )}

              <p className="mt-3 text-slate-400">
                {result.message}
              </p>

              {result.mode !== "executed" && (
                <div className="mt-5 rounded-lg border border-amber-500/40 bg-amber-950/30 p-4">
                  <p className="font-semibold text-amber-300">
                    Confirm Automatic Linking
                  </p>

                  <p className="mt-2 text-slate-300">
                    Eligible queue and evidence records will be linked.
                    Evidence verification and IPO publication will not change.
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
