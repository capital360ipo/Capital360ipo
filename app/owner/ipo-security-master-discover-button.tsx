"use client";

import { useState } from "react";

type ContextInfo = {
  term: string;
  position: number;
  context: string;
};

type ScriptResult = {
  url: string;
  status: number | null;
  length: number;
  fetched: boolean;
  matchCount: number;
  error?: string | null;
};

type ReportCardScript = {
  url: string;
  status: number | null;
  length: number;
  fetched: boolean;
  matches: ContextInfo[];
  error?: string;
};

type DiscoverResult = {
  success?: boolean;
  mode?: string;

  page?: {
    url?: string;
    status?: number;
    length?: number;
  };

  scriptDiscovery?: {
    discoveredScriptCount?: number;
    inspectedScriptCount?: number;
    totalScriptBytesInspected?: number;
    scriptUrls?: string[];
  };

  inlineScriptContexts?: ContextInfo[];
  reportCardScripts?: ReportCardScript[];
  allScriptResults?: ScriptResult[];

  safety?: {
    databaseWrites?: number;
    databaseModified?: boolean;
    securityMasterFilesDownloaded?: number;
    externalDownloadEndpointsCalled?: number;
    onlyOfficialNseScriptsInspected?: boolean;
  };

  nextStep?: string;
  error?: string;
};

export default function IpoSecurityMasterDiscoverButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiscoverResult | null>(null);

  async function discover() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/automation/ipo-security-master-discover",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "NSE Security Master discovery failed."
        );
      }

      setResult(data as DiscoverResult);
    } catch (error) {
      setResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown discovery error.",
      });
    } finally {
      setLoading(false);
    }
  }

  function renderContexts(contexts?: ContextInfo[]) {
    if (!contexts?.length) {
      return (
        <p className="mt-2 text-sm text-amber-300">
          No matching references found.
        </p>
      );
    }

    return (
      <div className="mt-3 space-y-3">
        {contexts.map((item, index) => (
          <div
            key={`${item.term}-${item.position}-${index}`}
            className="rounded-lg border border-slate-700 p-3"
          >
            <p className="mb-2 text-xs font-semibold text-cyan-300">
              {item.term} — Position: {item.position}
            </p>

            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-300">
              {item.context}
            </pre>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-cyan-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">
            NSE Security Master Discovery V14
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Trace official NSE JavaScript and ReportCard metadata provider.
          </p>
        </div>

        <button
          type="button"
          onClick={discover}
          disabled={loading}
          className="rounded-lg bg-cyan-600 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Checking NSE..." : "Discover NSE File"}
        </button>
      </div>

      {result && (
        <div className="mt-5 rounded-lg border border-slate-700 bg-slate-950 p-4">
          {result.success ? (
            <>
              <p className="font-semibold text-emerald-400">
                NSE Inspection Completed
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["Mode", result.mode],
                  ["Page HTTP Status", result.page?.status],
                  ["HTML Length", result.page?.length],
                  ["Scripts Discovered", result.scriptDiscovery?.discoveredScriptCount],
                  ["Scripts Inspected", result.scriptDiscovery?.inspectedScriptCount],
                  ["Total Script Bytes", result.scriptDiscovery?.totalScriptBytesInspected],
                  ["Database Writes", result.safety?.databaseWrites],
                  ["Database Modified", String(result.safety?.databaseModified)],
                  ["Security Master Downloads", result.safety?.securityMasterFilesDownloaded],
                  ["External Download Calls", result.safety?.externalDownloadEndpointsCalled],
                  ["Official NSE Scripts Only", String(result.safety?.onlyOfficialNseScriptsInspected)],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className="break-all text-sm text-white">
                      {value ?? "—"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <h4 className="font-semibold text-white">
                  Discovered Script URLs
                </h4>
                <div className="mt-2 space-y-2">
                  {result.scriptDiscovery?.scriptUrls?.length ? (
                    result.scriptDiscovery.scriptUrls.map((url, index) => (
                      <pre
                        key={`${url}-${index}`}
                        className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-xs text-cyan-300"
                      >
                        {url}
                      </pre>
                    ))
                  ) : (
                    <p className="text-sm text-amber-300">
                      No script URLs found.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <h4 className="font-semibold text-white">
                  ReportCard Scripts — Important
                </h4>

                {result.reportCardScripts?.length ? (
                  result.reportCardScripts.map((script, index) => (
                    <div
                      key={`${script.url}-${index}`}
                      className="mt-3 rounded-lg border border-cyan-900 p-3"
                    >
                      <p className="break-all text-xs text-cyan-300">
                        {script.url}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        HTTP: {script.status ?? "—"} | Length: {script.length} | Matches: {script.matches.length}
                      </p>
                      {renderContexts(script.matches)}
                    </div>
                  ))
                ) : (
                  <p className="mt-2 text-sm text-amber-300">
                    No ReportCard references found in inspected scripts.
                  </p>
                )}
              </div>

              <div className="mt-5">
                <h4 className="font-semibold text-white">
                  Inline HTML Script Contexts
                </h4>
                {renderContexts(result.inlineScriptContexts)}
              </div>

              <div className="mt-5">
                <h4 className="font-semibold text-white">
                  All Script Inspection Results
                </h4>

                <div className="mt-3 space-y-2">
                  {result.allScriptResults?.map((script, index) => (
                    <div
                      key={`${script.url}-${index}`}
                      className="rounded-lg border border-slate-700 p-3"
                    >
                      <p className="break-all text-xs text-cyan-300">
                        {script.url}
                      </p>
                      <p className="mt-2 text-xs text-slate-300">
                        HTTP: {script.status ?? "—"} | Length: {script.length} | Fetched: {String(script.fetched)} | Matches: {script.matchCount}
                      </p>
                      {script.error && (
                        <p className="mt-1 text-xs text-amber-300">
                          {script.error}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <p className="mt-4 text-xs text-slate-400">
                {result.nextStep}
              </p>
            </>
          ) : (
            <p className="break-words text-sm text-red-400">
              {result.error || "Discovery failed."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
