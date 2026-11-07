
"use client";

import { useState } from "react";

type Result = {
  success?: boolean;
  processed?: number;
  candidatesFound?: number;
  verified?: number;
  message?: string;
  error?: string;
};

export default function IpoMatchingButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runMatching() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/automation/ipo-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = (await response.json()) as Result;
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
        Compare IPO company names collected from different sources.
        Matching candidates remain unverified until independently checked.
      </p>

      <button
        type="button"
        onClick={runMatching}
        disabled={loading}
        className="mt-4 rounded-lg bg-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Matching..." : "Run IPO Matching"}
      </button>

      {result && (
        <div className="mt-4 rounded-lg border border-slate-700 p-4 text-sm">
          {result.success ? (
            <>
              <p className="font-semibold text-emerald-400">
                Matching completed
              </p>
              <p className="mt-2 text-slate-300">
                Records processed: {result.processed ?? 0}
              </p>
              <p className="text-slate-300">
                Matching candidates: {result.candidatesFound ?? 0}
              </p>
              <p className="text-slate-300">
                Automatically verified: {result.verified ?? 0}
              </p>
              <p className="mt-2 text-slate-400">
                {result.message}
              </p>
            </>
          ) : (
            <p className="text-red-400">
              {result.error || "Matching failed."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
