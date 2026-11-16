
"use client";

import { useState } from "react";

type SourceResult = {
  source: string;
  success: boolean;
  httpStatus: number | null;
  contentType?: string | null;
  htmlLength?: number;
  detectedRows: number;
  sampleRows: string[][];
  pageContainsUpcoming?: boolean;
  error?: string;
};

type PreviewResult = {
  success?: boolean;
  sourcesChecked?: number;
  successfulSources?: number;
  totalDetectedRows?: number;
  databaseWrites?: number;
  results?: SourceResult[];
  error?: string;
};

export default function IpoCalendarPreviewButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);

  async function runPreview() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/automation/ipo-calendar-preview",
        {
          method: "POST",
          credentials: "same-origin",
        }
      );

      const data: PreviewResult = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Source preview failed.");
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
    <section className="mt-6 rounded-2xl border border-cyan-500/30 bg-slate-900 p-6">
      <p className="text-sm font-semibold text-cyan-400">
        MULTI-SOURCE IPO DISCOVERY
      </p>

      <h2 className="mt-2 text-xl font-bold">
        IPO Calendar Discovery Preview
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Inspect BSE Mainboard, BSE SME and IPO calendar
        sources. Read-only test; no database changes.
      </p>

      <button
        type="button"
        onClick={runPreview}
        disabled={loading}
        className="mt-5 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
      >
        {loading ? "Checking Sources..." : "Preview IPO Sources"}
      </button>

      {result && (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm">
          {result.error ? (
            <p className="text-red-400">{result.error}</p>
          ) : (
            <>
              <p className="font-semibold text-cyan-400">
                Source inspection completed
              </p>

              <p className="mt-2 text-slate-300">
                Sources checked: {result.sourcesChecked ?? 0}
              </p>

              <p className="text-slate-300">
                Successful sources: {result.successfulSources ?? 0}
              </p>

              <p className="text-slate-300">
                Total detected rows: {result.totalDetectedRows ?? 0}
              </p>

              <p className="text-slate-300">
                Database writes: {result.databaseWrites ?? 0}
              </p>

              {result.results?.map((item) => (
                <div
                  key={item.source}
                  className="mt-4 rounded-lg border border-slate-700 p-3"
                >
                  <p className="font-semibold text-white">
                    {item.source}
                  </p>

                  <p className="mt-1 text-slate-300">
                    Status: {item.success ? "Success" : "Failed"}
                  </p>

                  <p className="text-slate-300">
                    HTTP: {item.httpStatus ?? "N/A"}
                  </p>

                  <p className="text-slate-300">
                    Rows: {item.detectedRows}
                  </p>

                  {item.error && (
                    <p className="mt-2 text-red-400">
                      {item.error}
                    </p>
                  )}

                  {item.sampleRows.length > 0 && (
                    <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-words bg-slate-900 p-3 text-xs text-slate-300">
                      {JSON.stringify(item.sampleRows, null, 2)}
                    </pre>
                  )}
                </div>
              ))}

              <p className="mt-4 text-xs text-slate-500">
                Read-only preview. No database records changed
                and nothing was published.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
