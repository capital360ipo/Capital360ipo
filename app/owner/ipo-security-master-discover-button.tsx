
"use client";

import { useState } from "react";

type DiscoverResult = {
  success?: boolean;
  mode?: string;
  source?: string;
  pageLength?: number;
  filenameMatches?: number;
  snippets?: string[];
  databaseWrites?: number;
  error?: string;
  note?: string;
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

  return (
    <section className="rounded-xl border border-cyan-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">
            NSE Security Master Discovery
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Discover official NSE security file references.
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
                Discovery completed
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
                    Filename Matches
                  </p>
                  <p className="text-sm text-white">
                    {result.filenameMatches ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Page Length
                  </p>
                  <p className="text-sm text-white">
                    {result.pageLength ?? 0} characters
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Database Writes
                  </p>
                  <p className="text-sm text-white">
                    {result.databaseWrites ?? 0}
                  </p>
                </div>
              </div>

              {result.snippets && result.snippets.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-semibold text-white">
                    Discovered References
                  </p>

                  {result.snippets.map((snippet, index) => (
                    <pre
                      key={index}
                      className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-xs text-slate-300"
                    >
                      {snippet}
                    </pre>
                  ))}
                </div>
              )}

              {result.snippets?.length === 0 && (
                <p className="mt-3 text-sm text-amber-300">
                  No matching filename found in the returned page.
                </p>
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
