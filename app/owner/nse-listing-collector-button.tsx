
"use client";

import { useState } from "react";

type Result = {
  success?: boolean;
  source?: string;
  collection?: {
    detected?: number;
    matched?: number;
    unmatched?: number;
    ambiguous?: number;
    evidenceInserted?: number;
    evidenceDuplicates?: number;
    automaticListingUpdates?: number;
    automaticPublication?: number;
  };
  message?: string;
  error?: string;
};

export default function NseListingCollectorButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runCollection() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/automation/nse-listing-circular-collect",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = (await response.json()) as Result;

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "NSE listing collection failed."
        );
      }

      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-slate-900 p-5">
      <p className="text-xs font-bold tracking-wider text-cyan-400">
        NSE LISTING VERIFICATION
      </p>

      <h3 className="mt-2 text-lg font-bold">
        NSE Recent Equity Listing Collector
      </h3>

      <p className="mt-2 text-sm text-slate-400">
        Collect official NSE equity listing evidence.
        Bonds and non-equity securities are excluded.
        All evidence remains unverified until review.
      </p>

      <button
        type="button"
        onClick={runCollection}
        disabled={loading}
        className="mt-4 rounded-lg bg-cyan-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Collecting..." : "Run NSE Listing Collection"}
      </button>

      {result && (
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
          {result.success ? (
            <>
              <p className="font-semibold text-emerald-400">
                Collection completed
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <p>
                  Detected:{" "}
                  <strong>{result.collection?.detected ?? 0}</strong>
                </p>
                <p>
                  Matched:{" "}
                  <strong>{result.collection?.matched ?? 0}</strong>
                </p>
                <p>
                  Unmatched:{" "}
                  <strong>{result.collection?.unmatched ?? 0}</strong>
                </p>
                <p>
                  Ambiguous:{" "}
                  <strong>{result.collection?.ambiguous ?? 0}</strong>
                </p>
                <p>
                  Evidence inserted:{" "}
                  <strong>
                    {result.collection?.evidenceInserted ?? 0}
                  </strong>
                </p>
                <p>
                  Duplicates:{" "}
                  <strong>
                    {result.collection?.evidenceDuplicates ?? 0}
                  </strong>
                </p>
              </div>

              <p className="mt-3 text-xs text-slate-400">
                Automatic listing updates: 0 | Automatic publication: 0
              </p>
            </>
          ) : (
            <p className="text-sm text-red-400">
              {result.error || "Collection failed."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
