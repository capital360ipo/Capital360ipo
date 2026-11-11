"use client";

import { useState } from "react";

type Result = {
  success?: boolean;
  source?: string;
  collection?: {
    mode?: string;
    detected?: number;
    matched?: number;
    unmatched?: number;
    ambiguous?: number;
    preview?: Array<{
      listingDate: string;
      companyName: string;
      symbol: string;
      isin: string;
      ipoType: string;
      matchStatus: string;
      identityVerified: boolean;
    }>;
    queueRecordsChecked?: number;
    databaseWrites?: number;
    lifecycleUpdates?: number;
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
        "/api/automation/ipo-collect-nse",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          `API returned HTML/non-JSON response (HTTP ${response.status}). Check deployment and API route.`
        );
      }

      const data = (await response.json()) as Result;

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "NSE listing dry run failed."
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
        NSE Recent Equity Listing Dry Run
      </h3>

      <p className="mt-2 text-sm text-slate-400">
        Read-only NSE listing preview. No evidence insertion,
        IPO status update, or publication will occur.
      </p>

      <button
        type="button"
        onClick={runCollection}
        disabled={loading}
        className="mt-4 rounded-lg bg-cyan-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Checking NSE..." : "Run Read-only Dry Run"}
      </button>

      {result && (
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
          {result.success ? (
            <>
              <p className="font-semibold text-emerald-400">
                Dry Run completed
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <p>Detected: <strong>{result.collection?.detected ?? 0}</strong></p>
                <p>Possible matches: <strong>{result.collection?.matched ?? 0}</strong></p>
                <p>Unmatched: <strong>{result.collection?.unmatched ?? 0}</strong></p>
                <p>Ambiguous: <strong>{result.collection?.ambiguous ?? 0}</strong></p>
                <p>Queue checked: <strong>{result.collection?.queueRecordsChecked ?? 0}</strong></p>
                <p>Database writes: <strong>{result.collection?.databaseWrites ?? 0}</strong></p>
              </div>

              <p className="mt-3 text-xs text-cyan-300">
                Mode: {result.collection?.mode || "READ ONLY"}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Lifecycle updates: 0 | Publication: 0
              </p>

              {result.collection?.preview?.map((item, index) => (
                <div
                  key={`${item.isin}-${index}`}
                  className="mt-3 rounded-lg border border-slate-700 p-3 text-xs"
                >
                  <p className="font-semibold text-white">
                    {item.companyName}
                  </p>
                  <p className="mt-1 text-slate-300">
                    Date: {item.listingDate} | Symbol: {item.symbol}
                  </p>
                  <p className="text-slate-300">
                    ISIN: {item.isin} | Type: {item.ipoType}
                  </p>
                  <p className="mt-1 text-cyan-300">
                    Match: {item.matchStatus}
                  </p>
                  <p className="text-amber-400">
                    Identity verified: No
                  </p>
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-red-400">
              {result.error || "Dry run failed."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
