"use client";

import { useState } from "react";

type SourceResult = {
  source: string;
  success: boolean;
  reachable?: boolean;
  usableData?: boolean;
  requestedUrl?: string;
  finalUrl?: string | null;
  pageTitle?: string | null;
  httpStatus: number | null;
  contentType?: string | null;
  htmlLength?: number;
  detectedRows: number;
  candidateCount?: number;
  assessment?: string;
  sampleRows: string[][];
  pageContainsUpcoming?: boolean;
  diagnostic?: string | null;
  error?: string;
  errorName?: string;
  causeName?: string | null;
  causeMessage?: string | null;

  // New BSE page diagnostics
  pageDiagnostics?: unknown;
};

type IpoCandidate = {
  companyName: string;
  normalizedName: string;
  ipoType: "MAINBOARD" | "SME" | "UNKNOWN";
  openDate: string | null;
  closeDate: string | null;
  priceBand: string | null;
  issueSize: string | null;
  sourceNames: string[];
  sourceUrls: string[];
  verificationStatus: "UNVERIFIED";
  lifecycleStatus?: "UPCOMING" | "OPEN" | "HISTORICAL" | "UNKNOWN";
};

type PreviewResult = {
  success?: boolean;
  mode?: string;
  indiaToday?: string;
  sourcesChecked?: number;
  successfulSources?: number;
  reachableSources?: number;
  usableSources?: number;
  totalDetectedRows?: number;
  rawCandidateCount?: number;
  uniqueCandidateCount?: number;
  duplicateCount?: number;
  normalizedCandidates?: IpoCandidate[];
  databaseWrites?: number;
  automaticPublication?: boolean;
  results?: SourceResult[];
  error?: string;
};

function lifecycleColor(status?: string) {
  switch (status) {
    case "UPCOMING":
      return "text-blue-400";
    case "OPEN":
      return "text-green-400";
    case "HISTORICAL":
      return "text-slate-400";
    default:
      return "text-amber-400";
  }
}

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
          cache: "no-store",
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

      <h2 className="mt-2 text-xl font-bold text-white">
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

              <p className="mt-2 text-slate-400">
                India Date: {result.indiaToday ?? "N/A"}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  ["Raw Candidates", result.rawCandidateCount],
                  ["Unique Candidates", result.uniqueCandidateCount],
                  ["Duplicates", result.duplicateCount],
                  ["Detected Rows", result.totalDetectedRows],
                  ["Sources Checked", result.sourcesChecked],
                  ["Reachable Sources", result.reachableSources ?? result.successfulSources],
                  ["Usable Sources", result.usableSources],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-lg bg-slate-900 p-3"
                  >
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className="mt-1 text-xl font-bold text-white">
                      {value ?? "N/A"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-1 text-slate-300">
                <p>Database writes: {result.databaseWrites ?? 0}</p>
                <p>
                  Automatic publication:{" "}
                  {result.automaticPublication ? "Yes" : "No"}
                </p>
              </div>

              <h3 className="mt-6 font-semibold text-cyan-400">
                Normalized IPO Candidates
              </h3>

              {result.normalizedCandidates?.length ? (
                <div className="mt-3 space-y-3">
                  {result.normalizedCandidates.map((item, index) => {
                    const lifecycle = item.lifecycleStatus ?? "UNKNOWN";

                    return (
                      <div
                        key={`${item.normalizedName}-${index}`}
                        className="rounded-lg border border-slate-700 bg-slate-900 p-3"
                      >
                        <p className="font-semibold text-white">
                          {index + 1}. {item.companyName}
                        </p>

                        <div className="mt-2 space-y-1 text-slate-300">
                          <p>IPO Type: {item.ipoType}</p>
                          <p>
                            Lifecycle Status:{" "}
                            <span className={lifecycleColor(lifecycle)}>
                              {lifecycle}
                            </span>
                          </p>
                          <p>Open Date: {item.openDate ?? "Not available"}</p>
                          <p>Close Date: {item.closeDate ?? "Not available"}</p>
                          <p>Price Band: {item.priceBand ?? "Not available"}</p>
                          <p>Issue Size: {item.issueSize ?? "Not available"}</p>
                          <p>
                            Sources: {item.sourceNames?.join(", ") || "Unknown"}
                          </p>
                          <p className="text-amber-400">
                            Verification: {item.verificationStatus}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-amber-400">
                  No normalized candidates returned by the API.
                </p>
              )}

              <h3 className="mt-6 font-semibold text-cyan-400">
                Source Details & Diagnostics
              </h3>

              {result.results?.map((item) => (
                <div
                  key={item.source}
                  className="mt-3 rounded-lg border border-slate-700 p-3"
                >
                  <p className="font-semibold text-white">{item.source}</p>

                  <div className="mt-2 space-y-1 text-slate-300">
                    <p>Status: {item.success ? "Success" : "Failed"}</p>
                    <p>Reachable: {item.reachable ? "Yes" : "No"}</p>
                    <p>Usable IPO Data: {item.usableData ? "Yes" : "No"}</p>
                    <p>HTTP: {item.httpStatus ?? "N/A"}</p>
                    <p>Rows: {item.detectedRows}</p>
                    <p>Candidates: {item.candidateCount ?? "N/A"}</p>
                    <p>HTML Length: {item.htmlLength ?? "N/A"}</p>
                    <p>Content Type: {item.contentType ?? "N/A"}</p>
                    <p>Assessment: {item.assessment ?? "N/A"}</p>
                    <p>Page Title: {item.pageTitle ?? "N/A"}</p>
                    <p className="break-all">
                      Requested URL: {item.requestedUrl ?? "N/A"}
                    </p>
                    <p className="break-all">
                      Final URL: {item.finalUrl ?? "N/A"}
                    </p>
                  </div>

                  {item.diagnostic && (
                    <p className="mt-2 text-amber-400">
                      Diagnostic: {item.diagnostic}
                    </p>
                  )}

                  {item.error && (
                    <p className="mt-2 text-red-400">
                      Error: {item.error}
                    </p>
                  )}

                  {item.errorName && (
                    <p className="text-red-400">
                      Error Type: {item.errorName}
                    </p>
                  )}

                  {item.causeMessage && (
                    <p className="break-words text-red-400">
                      Cause: {item.causeName ?? "Unknown"} — {item.causeMessage}
                    </p>
                  )}

                  {item.pageDiagnostics != null && (
                    <div className="mt-4 rounded-lg border border-cyan-500/30 bg-slate-950 p-3">
                      <p className="font-semibold text-cyan-400">
                        BSE JavaScript & API Reference Diagnostics
                      </p>
                      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-300">
                        {JSON.stringify(item.pageDiagnostics, null, 2)}
                      </pre>
                    </div>
                  )}

                  {item.sampleRows?.length > 0 && (
                    <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-3 text-xs text-slate-300">
                      {JSON.stringify(item.sampleRows, null, 2)}
                    </pre>
                  )}
                </div>
              ))}

              <p className="mt-4 text-xs text-slate-500">
                Read-only preview. No database records changed and
                nothing was published.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
