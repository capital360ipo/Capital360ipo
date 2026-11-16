
"use client";

import { useState } from "react";

type Result = {
  success?: boolean;
  mode?: string;
  source?: string;
  responseType?: string;
  responseKeys?: string[];
  detected?: number | null;
  sampleRecords?: unknown;
  databaseWrites?: number;
  error?: string;
  message?: string;
};

export default function NseUpcomingIpoPreviewButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runPreview() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/automation/ipo-collect-upcoming",
        {
          method: "POST",
          credentials: "same-origin",
        }
      );

      const data: Result = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upcoming IPO preview failed.");
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
        NSE UPCOMING IPO TRACKER
      </p>

      <h2 className="mt-2 text-xl font-bold">
        NSE Upcoming IPO Preview
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Fetch official NSE upcoming IPO response for read-only
        inspection. No database records will be changed.
      </p>

      <button
        type="button"
        onClick={runPreview}
        disabled={loading}
        className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Fetching NSE Data..." : "Preview Upcoming IPOs"}
      </button>

      {result && (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm">
          {result.error ? (
            <p className="text-red-400">{result.error}</p>
          ) : (
            <>
              <p className="font-semibold text-emerald-400">
                NSE response received
              </p>

              <p className="mt-2 text-slate-300">
                Response type: {result.responseType ?? "Unknown"}
              </p>

              <p className="text-slate-300">
                Records detected: {result.detected ?? "Unknown"}
              </p>

              <p className="text-slate-300">
                Database writes: {result.databaseWrites ?? 0}
              </p>

              <p className="mt-3 text-xs text-slate-400">
                Response fields:{" "}
                {result.responseKeys?.join(", ") || "Not available"}
              </p>

              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-xs text-slate-300">
                {JSON.stringify(result.sampleRecords, null, 2)}
              </pre>

              <p className="mt-3 text-xs text-slate-500">
                Read-only preview. No database changes or automatic publication.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
