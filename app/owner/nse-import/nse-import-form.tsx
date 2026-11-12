
"use client";

import { useState } from "react";

type ApiResult = {
  success?: boolean;
  batch_id?: string;
  error?: string;
  status?: string;
  completed?: boolean;
  inserted_rows?: number;
  total_rows?: number;
  progress_percent?: number;
  remaining_rows?: number;
};

export default function NseImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [batchId, setBatchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function runImport(id: string) {
    setLoading(true);
    setError("");
    setMessage("NSE records import ho rahe hain...");

    try {
      for (let attempt = 0; attempt < 250; attempt++) {
        const response = await fetch("/api/nse/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch_id: id }),
        });

        const data: ApiResult = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Import failed.");
        }

        const percent =
          typeof data.progress_percent === "number"
            ? data.progress_percent
            : data.total_rows
              ? Math.round(
                  ((data.inserted_rows || 0) / data.total_rows) * 100
                )
              : 0;

        setProgress(percent);
        setMessage(
          `Imported ${data.inserted_rows || 0} / ${data.total_rows || 0} records`
        );

        if (
          data.completed === true ||
          data.status === "completed" ||
          data.remaining_rows === 0
        ) {
          setProgress(100);
          setMessage("NSE Security Master import completed successfully!");
          setLoading(false);
          return;
        }
      }

      throw new Error(
        "Import abhi complete nahi hua. Resume Import button se continue karein."
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unknown import error."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!file) {
      setError("Please select NSE .csv.gz file.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("File securely upload ho rahi hai...");
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/nse/upload", {
        method: "POST",
        body: formData,
      });

      const data: ApiResult = await response.json();

      if (!response.ok || !data.success || !data.batch_id) {
        throw new Error(data.error || "File upload failed.");
      }

      setBatchId(data.batch_id);
      setMessage("Upload successful. Import starting...");

      await runImport(data.batch_id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unknown upload error."
      );
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-2xl space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white">
      <div>
        <h2 className="text-xl font-semibold">
          NSE Security Master Import
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Upload the official NSE CM Security File (.csv.gz).
        </p>
      </div>

      <input
        type="file"
        accept=".gz,.csv.gz"
        disabled={loading}
        onChange={(event) => {
          setFile(event.target.files?.[0] || null);
          setError("");
        }}
        className="block w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-sm"
      />

      <button
        type="button"
        onClick={handleUpload}
        disabled={loading || !file}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Please wait..." : "Upload & Import NSE File"}
      </button>

      {batchId && (
        <div className="space-y-3 rounded-lg bg-slate-800 p-3">
          <p className="break-all text-xs text-slate-400">
            Batch ID: {batchId}
          </p>

          <div className="h-3 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-sm">
            Progress: {progress}%
          </p>

          {!loading && progress < 100 && (
            <button
              type="button"
              onClick={() => runImport(batchId)}
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white"
            >
              Resume Import
            </button>
          )}
        </div>
      )}

      {message && (
        <p className="text-sm text-emerald-400">{message}</p>
      )}

      {error && (
        <p className="break-words text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
