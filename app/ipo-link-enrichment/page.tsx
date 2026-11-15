
"use client";

import { useState } from "react";

type SyncResult = {
  success?: boolean;
  mode?: string;
  detected?: number;
  inserted?: number;
  alreadyPresent?: number;
  error?: string;
  note?: string;
};

export default function IpoLinkEnrichmentPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function syncQueue() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/automation/ipo-link-enrichment",
        {
          method: "POST",
          credentials: "same-origin",
        }
      );

      const data = await response.json();
      setResult(data);

    } catch {
      setResult({
        success: false,
        error: "Request failed. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-5">
      <h1 className="text-2xl font-bold">
        IPO Link Enrichment
      </h1>

      <p className="mt-3 text-sm text-gray-600">
        Owner/Admin: Sync IPO records into the pending
        link verification queue.
      </p>

      <button
        onClick={syncQueue}
        disabled={loading}
        className="mt-6 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Syncing..." : "Sync Pending IPOs"}
      </button>

      {result && (
        <section className="mt-6 rounded-lg border p-4">
          <h2 className="font-bold">
            {result.success ? "Sync Result" : "Error"}
          </h2>

          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
