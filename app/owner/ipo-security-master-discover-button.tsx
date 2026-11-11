"use client";

import { useState } from "react";

type DiscoverResult = {
  success?: boolean;
  mode?: string;
  pageLength?: number;
  scriptLength?: number;
  scriptUrl?: string;
  htmlButtonMatches?: number;
  scriptReferenceMatches?: number;
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

      setResult(data);
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

  function renderContexts(title: string, contexts?: string[]) {
    if (!contexts || contexts.length === 0) {
      return (
        <p className="mt-2 text-sm text-amber-300">
          No matching references found.
        </p>
      );
    }

    return (
      <div className="mt-3 space-y-3">
        <p className="text-sm font-semibold text-white">{title}</p>

        {contexts.map((context, index) => (
          <pre
            key={`${title}-${index}`}
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
            Inspect official NSE report page and download script.
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
                <div>
                  <p className="text-xs text-slate-400">Mode</p>
                  <p className="text-sm text-white">
                    {result.mode || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    HTML Button Matches
                  </p>
                  <p className="text-sm text-white">
                    {result.htmlButtonMatches ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    JavaScript Reference Matches
                  </p>
                  <p className="text-sm text-white">
                    {result.scriptReferenceMatches ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">HTML Page Length</p>
                  <p className="text-sm text-white">
                    {result.pageLength ?? 0} characters
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">Script Length</p>
                  <p className="text-sm text-white">
                    {result.scriptLength ?? 0} characters
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">Database Writes</p>
                  <p className="text-sm text-white">
                    {result.databaseWrites ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">Files Downloaded</p>
                  <p className="text-sm text-white">
                    {result.filesDownloaded ?? 0}
                  </p>
                </div>
              </div>

              {result.scriptUrl && (
                <p className="mt-4 break-all text-xs text-slate-400">
                  Script: {result.scriptUrl}
                </p>
              )}

              {renderContexts(
                "HTML Button References",
                result.htmlContexts
              )}

              {renderContexts(
                "JavaScript Download References",
                result.scriptContexts
              )}

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
