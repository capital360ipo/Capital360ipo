"use client";

import { useState } from "react";

type PreviewItem = {
  companyName: string;
  symbol: string;
  listingDate: string;
  issuePrice: number | null;
  listingDayClose: number | null;
  matchStatus: string;
  identityVerified: boolean;
};

type Result = {
  success?: boolean;
  error?: string;
  summary?: {
    detected?: number;
    possibleMatches?: number;
    unmatched?: number;
    ambiguous?: number;
    duplicateSymbols?: number;
    queueRecordsChecked?: number;
    databaseWrites?: number;
    lifecycleUpdates?: number;
    automaticPublication?: number;
  };
  preview?: PreviewItem[];
};

export default function NseIpoTrackerPreview() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runPreview() {
    if (!file) {
      setResult({ error: "Please select an NSE CSV file." });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        "/api/automation/ipo-preview-nse-tracker",
        {
          method: "POST",
          body: formData,
        }
      );

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          `Non-JSON response from API. HTTP ${response.status}`
        );
      }

      const data = (await response.json()) as Result;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "CSV preview failed.");
      }

      setResult(data);
    } catch (error) {
      setResult({
        error:
          error instanceof Error
            ? error.message
            : "Unknown preview error.",
      });
    } finally {
      setLoading(false);
    }
  }

  const summary = result?.summary;

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-slate-900 p-5">
      <p className="text-xs font-bold tracking-wider text-cyan-400">
        NSE IPO TRACKER
      </p>

      <h3 className="mt-2 text-lg font-bold text-white">
        NSE IPO Listing CSV Preview
      </h3>

      <p className="mt-2 text-sm text-slate-400">
        Upload the official NSE IPO Tracker CSV to preview listing
        records and possible matches with existing IPO records.
      </p>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          setFile(event.target.files?.[0] || null);
          setResult(null);
        }}
        className="mt-4 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-white"
      />

      {file && (
        <p className="mt-2 text-xs text-slate-400">
          Selected: {file.name}
        </p>
      )}

      <button
        type="button"
        onClick={runPreview}
        disabled={loading || !file}
        className="mt-4 rounded-lg bg-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Analyzing CSV..." : "Run Read-only CSV Preview"}
      </button>

      {result?.error && (
        <p className="mt-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">
          {result.error}
        </p>
      )}

      {summary && (
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
          <p className="font-semibold text-emerald-400">
            CSV Preview Completed
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-300">
            <p>Detected: <strong>{summary.detected ?? 0}</strong></p>
            <p>Possible matches: <strong>{summary.possibleMatches ?? 0}</strong></p>
            <p>Unmatched: <strong>{summary.unmatched ?? 0}</strong></p>
            <p>Ambiguous: <strong>{summary.ambiguous ?? 0}</strong></p>
            <p>Duplicate symbols: <strong>{summary.duplicateSymbols ?? 0}</strong></p>
            <p>Queue checked: <strong>{summary.queueRecordsChecked ?? 0}</strong></p>
          </div>

          <div className="mt-3 rounded-lg border border-emerald-900 p-3 text-xs text-emerald-300">
            Database writes: {summary.databaseWrites ?? 0}
            <br />
            Lifecycle updates: {summary.lifecycleUpdates ?? 0}
            <br />
            Automatic publication: {summary.automaticPublication ?? 0}
          </div>

          {result.preview?.map((item, index) => (
            <div
              key={`${item.symbol}-${index}`}
              className="mt-3 rounded-lg border border-slate-700 p-3 text-xs"
            >
              <p className="font-semibold text-white">
                {item.companyName}
              </p>
              <p className="mt-1 text-slate-300">
                Symbol: {item.symbol}
              </p>
              <p className="text-slate-300">
                Listed: {item.listingDate}
              </p>
              <p className="text-slate-300">
                Issue Price: {item.issuePrice ?? "N/A"} |
                Listing Close: {item.listingDayClose ?? "N/A"}
              </p>
              <p className="mt-1 text-cyan-300">
                Match: {item.matchStatus}
              </p>
              <p className="text-amber-400">
                Identity verified: No
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
