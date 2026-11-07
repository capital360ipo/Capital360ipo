"use client";

import { useState } from "react";

type ImportResult = {
  success?: boolean;
  detected?: number;
  inserted?: number;
  duplicates?: number;
  error?: string;
};

export default function NseCsvImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function uploadCsv() {
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
        "/api/automation/ipo-import-nse-csv",
        {
          method: "POST",
          credentials: "same-origin",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "CSV import failed.");
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
    <section className="mt-6 rounded-2xl border border-blue-500/30 bg-slate-900 p-6">
      <p className="text-sm font-semibold text-blue-400">
        NSE OFFICIAL DATA
      </p>

      <h2 className="mt-2 text-xl font-bold">
        NSE IPO CSV Import
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Upload the official NSE IPO advertisement CSV
        for validation and duplicate checking.
      </p>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setResult(null);
        }}
        className="mt-5 block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-white"
      />

      <button
        type="button"
        onClick={uploadCsv}
        disabled={loading || !file}
        className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Importing CSV..." : "Upload & Import CSV"}
      </button>

      {result && (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm">
          {result.error ? (
            <p className="text-red-400">{result.error}</p>
          ) : (
            <>
              <p className="font-semibold text-emerald-400">
                CSV Import Completed
              </p>
              <p className="mt-2 text-slate-300">
                Detected: {result.detected ?? 0}
              </p>
              <p className="text-slate-300">
                Inserted: {result.inserted ?? 0}
              </p>
              <p className="text-slate-300">
                Duplicates: {result.duplicates ?? 0}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
