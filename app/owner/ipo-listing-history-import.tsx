
"use client";

import { useState } from "react";

type ImportResult = {
  success?: boolean;
  error?: string;
  summary?: {
    detected: number;
    inserted: number;
    duplicateInFile: number;
    duplicateInDatabase: number;
    totalDuplicates: number;
    failed: number;
    reviewStatus: string;
    identityVerified: number;
    ipoMasterLinked: number;
    lifecycleUpdates: number;
    automaticApproval: number;
    automaticPublication: number;
  };
  errors?: string[];
  note?: string;
};

export default function IpoListingHistoryImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function runImport() {
    if (!file || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        "/api/automation/ipo-import-listing-history",
        {
          method: "POST",
          body: formData,
          credentials: "same-origin",
        }
      );

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error("Unexpected server response. Please check deployment.");
      }

      const data = (await response.json()) as ImportResult;

      if (!response.ok) {
        throw new Error(data.error || "Import request failed.");
      }

      setResult(data);

      if (data.success) {
        setFile(null);

        const input = document.getElementById(
          "ipo-listing-history-csv"
        ) as HTMLInputElement | null;

        if (input) input.value = "";
      }
    } catch (error) {
      setResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown import error.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">
          IPO Listing History Import
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Import NSE IPO Tracker CSV into the pending review queue.
        </p>
      </div>

      <div className="space-y-3">
        <input
          id="ipo-listing-history-csv"
          type="file"
          accept=".csv,text/csv"
          disabled={loading}
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setResult(null);
          }}
          className="block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-white"
        />

        {file && (
          <p className="text-sm text-slate-300">
            Selected: {file.name}
          </p>
        )}

        <button
          type="button"
          onClick={runImport}
          disabled={!file || loading}
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Importing..." : "Import Pending Records"}
        </button>

        <p className="text-xs leading-5 text-amber-300">
          Import creates pending review records only. It does not verify IPO
          identity, update IPO master, approve records, or publish them.
        </p>
      </div>

      {result && (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4">
          <h3 className="font-semibold text-white">
            {result.success ? "Import Result" : "Import Error"}
          </h3>

          {result.error && (
            <p className="mt-2 text-sm text-red-400">
              {result.error}
            </p>
          )}

          {result.summary && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Detected", result.summary.detected],
                ["Inserted", result.summary.inserted],
                ["Duplicates", result.summary.totalDuplicates],
                ["Failed", result.summary.failed],
                ["Identity Verified", result.summary.identityVerified],
                ["IPO Master Linked", result.summary.ipoMasterLinked],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg bg-slate-900 p-3"
                >
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {result.summary && (
            <p className="mt-3 text-sm text-emerald-400">
              Review status: {result.summary.reviewStatus}
            </p>
          )}

          {result.errors && result.errors.length > 0 && (
            <div className="mt-3 text-sm text-red-400">
              {result.errors.map((error, index) => (
                <p key={index}>{error}</p>
              ))}
            </div>
          )}

          {result.note && (
            <p className="mt-3 text-xs leading-5 text-slate-400">
              {result.note}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
