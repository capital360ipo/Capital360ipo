
"use client";

import { useState } from "react";

type ImportResult = {
  success?: boolean;
  message?: string;
  error?: string;
  duplicate?: boolean;
  batch_id?: string;
  file_name?: string;
  total_rows?: number;
  inserted_rows?: number;
  columns?: number;
};

export default function NseImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleImport() {
    if (!file) {
      setResult({ error: "Please select an NSE CSV.GZ file." });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/nse/import", {
        method: "POST",
        body: formData,
      });

      const data: ImportResult = await response.json();

      if (!response.ok) {
        setResult(data);
        return;
      }

      setResult(data);
      setFile(null);

      const input = document.getElementById(
        "nse-security-file"
      ) as HTMLInputElement | null;

      if (input) input.value = "";
    } catch {
      setResult({
        error: "Upload failed. Please check your internet connection.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="nse-security-file"
          className="mb-2 block text-sm font-medium text-slate-200"
        >
          Select NSE Security Master File
        </label>

        <input
          id="nse-security-file"
          type="file"
          accept=".gz,.csv.gz,application/gzip"
          disabled={loading}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setResult(null);
          }}
          className="block w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:font-semibold file:text-slate-950"
        />

        <p className="mt-2 text-xs text-slate-500">
          Accepted format: .csv.gz · Maximum compressed size: 4 MB
        </p>
      </div>

      {file && (
        <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
          <p className="text-sm font-medium text-white">
            {file.name}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {(file.size / (1024 * 1024)).toFixed(2)} MB
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleImport}
        disabled={!file || loading}
        className="w-full rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Importing NSE Data..." : "Upload & Import NSE Data"}
      </button>

      {loading && (
        <p className="text-sm text-amber-300">
          Please keep this page open while the import is running.
        </p>
      )}

      {result && (
        <div
          className={`rounded-xl border p-4 ${
            result.success
              ? "border-emerald-700 bg-emerald-950/40"
              : "border-red-800 bg-red-950/40"
          }`}
        >
          <h3 className="font-semibold text-white">
            {result.success
              ? "Import Successful"
              : "Import Not Completed"}
          </h3>

          <p className="mt-2 text-sm text-slate-300">
            {result.message || result.error}
          </p>

          {result.duplicate && (
            <p className="mt-2 text-sm text-amber-300">
              This file was already processed. No new import was started.
            </p>
          )}

          {result.success && (
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <p>File: {result.file_name}</p>
              <p>Columns: {result.columns}</p>
              <p>Total records: {result.total_rows}</p>
              <p>Inserted records: {result.inserted_rows}</p>
              <p className="break-all">
                Batch ID: {result.batch_id}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
