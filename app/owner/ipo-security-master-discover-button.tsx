"use client";

import { useState } from "react";

type ScriptInfo = {
  url: string;
  success: boolean;
  length: number;
  contextMatches: number;
  error?: string | null;
};

type DiscoverResult = {
  success?: boolean;
  mode?: string;
  pageLength?: number;
  htmlMatchCount?: number;
  scriptsDiscovered?: number;
  scriptsFetched?: number;
  scriptsFailed?: number;
  scriptInventory?: ScriptInfo[];
  htmlContexts?: string[];
  scriptContexts?: string[];
  databaseWrites?: number;
  filesDownloaded?: number;
  note?: string;
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

  function renderContexts(contexts?: string[]) {
    if (!contexts || contexts.length === 0) {
      return (
        <p className="mt-2 text-sm text-amber-300">
          No matching references found.
        </p>
      );
    }

    return (
      <div className="mt-3 space-y-3">
        {contexts.map((context, index) => (
          <pre
            key={index}
            className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-300"
          >
            {context}
          </pre>
        ))}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-cyan-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">
            NSE Security Master Discovery
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Inspect official NSE report HTML and JavaScript.
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

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  ["Mode", result.mode],
                  ["HTML Page Length", result.pageLength],
                  ["HTML Match Count", result.htmlMatchCount],
                  ["Scripts Discovered", result.scriptsDiscovered],
                  ["Scripts Fetched", result.scriptsFetched],
                  ["Scripts Failed", result.scriptsFailed],
                  ["Database Writes", result.databaseWrites],
                  ["Files Downloaded", result.filesDownloaded],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <p className="text-xs text-slate-400">
                      {label}
                    </p>
                    <p className="break-all text-sm text-white">
                      {value ?? "—"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <h4 className="font-semibold text-white">
                  Script Inventory
                </h4>

                {result.scriptInventory?.length ? (
                  <div className="mt-3 space-y-2">
                    {result.scriptInventory.map((script, index) => (
                      <div
                        key={`${script.url}-${index}`}
                        className="rounded-lg border border-slate-700 p-3"
                      >
                        <p className="break-all text-xs text-cyan-300">
                          {script.url}
                        </p>

                        <p className="mt-2 text-xs text-slate-300">
                          Status: {script.success ? "Fetched" : "Failed"}
                          {" | "}Length: {script.length}
                          {" | "}Matches: {script.contextMatches}
                        </p>

                        {script.error && (
                          <p className="mt-1 text-xs text-red-400">
                            {script.error}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-amber-300">
                    No JavaScript files discovered.
                  </p>
                )}
              </div>

              <div className="mt-5">
                <h4 className="font-semibold text-white">
                  HTML Contexts
                </h4>
                {renderContexts(result.htmlContexts)}
              </div>

              <div className="mt-5">
                <h4 className="font-semibold text-white">
                  JavaScript Contexts
                </h4>
                {renderContexts(result.scriptContexts)}
              </div>

              <p className="mt-4 text-xs text-slate-400">
                {result.note}
              </p>
            </>
          ) : (
            <p className="text-sm text-red-400">
              {result.error || "Discovery failed."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
