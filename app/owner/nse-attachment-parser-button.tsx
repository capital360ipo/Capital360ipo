"use client";

import { useState } from "react";

type ParserResult = {
  success?: boolean;
  processed?: number;
  failed?: number;
  batch_size?: number;
  message?: string;
  error?: string;
  results?: {
    id: string;
    field_name: string | null;
    status: string;
    error?: string;
  }[];
};

export default function NseAttachmentParserButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParserResult | null>(null);

  async function runParser() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/automation/nse-attachment-parse",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = (await response.json()) as ParserResult;

      if (!response.ok) {
        throw new Error(
          data.error || "Attachment parser request failed."
        );
      }

      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-slate-900 p-6">
      <p className="text-sm font-semibold text-emerald-400">
        NSE DOCUMENT INTELLIGENCE
      </p>

      <h2 className="mt-2 text-xl font-bold">
        NSE Attachment Parser
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Extract document type, date candidates and issuer
        information from official NSE PDF and ZIP attachments.
      </p>

      <button
        type="button"
        onClick={runParser}
        disabled={loading}
        className="mt-5 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Parsing Attachments..." : "Run NSE Attachment Parser"}
      </button>

      {result && (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4">
          {result.error ? (
            <p className="text-sm text-red-400">
              Error: {result.error}
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-emerald-400">
                Parser Response
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400">Processed</p>
                  <p className="text-xl font-bold">
                    {result.processed ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400">Failed</p>
                  <p className="text-xl font-bold">
                    {result.failed ?? 0}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs text-slate-400">
                {result.message}
              </p>

              {result.results?.map((item) => (
                <div
                  key={item.id}
                  className="mt-3 border-t border-slate-800 pt-3 text-xs"
                >
                  <p className="break-all text-slate-300">
                    {item.field_name || "Unknown attachment"}
                  </p>
                  <p
                    className={
                      item.status === "completed"
                        ? "mt-1 text-emerald-400"
                        : "mt-1 text-red-400"
                    }
                  >
                    {item.status}
                  </p>
                  {item.error && (
                    <p className="mt-1 text-red-400">
                      {item.error}
                    </p>
                  )}
                </div>
              ))}
            </>
          )}

          <p className="mt-4 text-xs text-amber-400">
            Extracted information is machine-generated and
            remains unverified until manual review.
          </p>
        </div>
      )}
    </section>
  );
}
