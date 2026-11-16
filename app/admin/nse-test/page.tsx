
"use client";

import { useState } from "react";

export default function NseTestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function runTest() {
    setLoading(true);
    setResult("Collector चल रहा है...");

    try {
      const response = await fetch(
        "/api/automation/ipo-collect-nse-history",
        {
          method: "POST",
          credentials: "same-origin",
        }
      );

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch {
      setResult("Request failed. Please check Vercel Logs.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">
        NSE Historical IPO Test
      </h1>

      <button
        onClick={runTest}
        disabled={loading}
        className="mt-5 rounded-lg bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
      >
        {loading ? "Running..." : "Run NSE Collector"}
      </button>

      <pre className="mt-5 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-100 p-4 text-sm text-black">
        {result}
      </pre>
    </main>
  );
}
