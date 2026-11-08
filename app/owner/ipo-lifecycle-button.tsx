
"use client";

import { useState } from "react";

type Result = {
  success?: boolean;
  detected?: number;
  inserted?: number;
  skipped?: number;
  message?: string;
  error?: string;
};

export default function IpoLifecycleButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runAssessment() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/owner/ipo-lifecycle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Assessment failed.");
      }

      setResult(data);
    } catch (error) {
      setResult({
        success: false,
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
    <section className="mt-6 rounded-2xl border border-cyan-500/30 bg-slate-900 p-6">
      <p className="text-sm font-semibold text-cyan-400">
        IPO LIFECYCLE ENGINE
      </p>

      <h2 className="mt-2 text-xl font-bold text-white">
        Lifecycle Assessment
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        NSE attachment evidence se potential IPO stages
        identify karein. Results pending rahenge.
      </p>

      <button
        type="button"
        onClick={runAssessment}
        disabled={loading}
        className="mt-5 rounded-lg bg-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Processing..." : "Run Lifecycle Assessment"}
      </button>

      {result && (
        <div className="mt-5 rounded-lg border border-slate-700 p-4">
          {result.success ? (
            <>
              <p className="font-semibold text-emerald-400">
                Assessment completed
              </p>
              <p className="mt-2 text-sm text-slate-300">
                Detected: {result.detected ?? 0}
              </p>
              <p className="text-sm text-slate-300">
                Inserted: {result.inserted ?? 0}
              </p>
              <p className="text-sm text-slate-300">
                Skipped: {result.skipped ?? 0}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {result.message}
              </p>
            </>
          ) : (
            <p className="text-sm text-red-400">
              {result.error || "Assessment failed."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
