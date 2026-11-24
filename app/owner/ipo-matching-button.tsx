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
        Match IPO records across official sources and link eligible
        records to IPO candidates.
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
                  ? "Candidate Linking completed successfully"
                  : "Preview completed successfully"}
              </p>

              <p className="mt-2 text-cyan-300">
                Mode: {result.mode || "preview"}
              </p>

              <div className="mt-3 space-y-2 text-slate-300">
                <p>Records processed: {result.processed ?? 0}</p>
                <p>Cross-source matching pairs: {result.candidatePairs ?? 0}</p>
                <p>Records with name matches: {result.recordsWithCandidates ?? 0}</p>
                <p>IPO type mismatches: {result.typeMismatchPairs ?? 0}</p>
                <p>Already linked records: {result.alreadyLinked ?? 0}</p>
                <p>Master matched records: {result.masterMatched ?? 0}</p>
                <p>Pending candidate linking: {result.pendingCandidateLinking ?? 0}</p>
                <p>Unknown type records: {result.unknownType ?? 0}</p>
                <p>Total existing candidates: {result.totalCandidates ?? 0}</p>
                <p>Verified: {result.verified ?? 0}</p>
                <p>Published: {result.published ?? 0}</p>
              </div>

              <p className="mt-3 text-slate-400">
                {result.message}
              </p>

              {result.mode !== "executed" &&
                (result.pendingCandidateLinking ?? 0) > 0 && (
                  <div className="mt-5 rounded-lg border border-amber-500/40 bg-amber-950/30 p-4">
                    <p className="font-semibold text-amber-300">
                      Confirm Candidate Linking
                    </p>

                    <p className="mt-2 text-slate-300">
                      Eligible queue records will be linked to IPO
                      candidates. This will not verify or publish IPOs.
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
