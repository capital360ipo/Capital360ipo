
"use client";

import { useState } from "react";

type Result = {
  success?: boolean;
  source?: string;
  detected?: number;
  inserted?: number;
  duplicates?: number;
  error?: string;
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Collection failed.");
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
        AUTOMATION CONTROL
      </p>

      <h2 className="mt-2 text-xl font-bold">
        IPO Data Collection
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Official SEBI source se IPO filing data collect karke
        pending review queue mein save karein.
      </p>

      <button
        type="button"
        onClick={runCollection}
        disabled={loading}
        className="mt-5 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Collecting IPO Data..." : "Run IPO Collection"}
      </button>

      {result && (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4">
          {result.error ? (
            <p className="text-sm text-red-400">
              {result.error}
            </p>
          ) : (
            <>
              <p className="font-semibold text-emerald-400">
                Collection Completed
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-slate-500">Detected</p>
                  <p className="mt-1 text-xl font-bold">
                    {result.detected ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-slate-500">Inserted</p>
                  <p className="mt-1 text-xl font-bold">
                    {result.inserted ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-slate-500">Duplicates</p>
                  <p className="mt-1 text-xl font-bold">
                    {result.duplicates ?? 0}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-xs text-slate-400">
                Source: {result.source || "SEBI"} ·
                Status: Pending Review
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
