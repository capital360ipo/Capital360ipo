"use client";

import { useState } from "react";

type ParserResult = {
  success?: boolean;
  processed?: number;
  failed?: number;
  skipped?: number;
  message?: string;
  error?: string;
  results?: {
    id: string;
    company_name: string;
    attachment_name: string;
    field_name: string;
    status: string;
    message?: string;
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

      let data: ParserResult;

      try {
        data = (await response.json()) as ParserResult;
      } catch {
        throw new Error(
          `Server returned an invalid response (HTTP ${response.status}).`
        );
      }

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

      <h2 className="mt-2 text-xl font-bold text-white">
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
        {loading
          ? "Parsing Attachments..."
          : "Run NSE Attachment Parser"}
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

              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-slate-400">Processed</p>
                  <p className="text-xl font-bold text-emerald-400">
                    {result.processed ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400">Failed</p>
                  <p className="text-xl font-bold text-red-400">
                    {result.failed ?? 0}
                  </p>
                </div>

                <div>
                  <p className="text-slate-400">Skipped</p>
                  <p className="text-xl font-bold text-amber-400">
                    {result.skipped ?? 0}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs text-slate-400">
                {result.message}
              </p>

              {result.results?.map((item) => (
                <div
                  key={item.id}
                  className="mt-4 rounded-lg border border-slate-800 p-3 text-xs"
                >
                  <p className="font-semibold text-white">
                    {item.company_name || "Issuer not available"}
                  </p>

                  <p className="mt-2 break-all text-slate-300">
                    Attachment:{" "}
                    {item.attachment_name || "Unknown attachment"}
                  </p>

                  <p className="mt-1 break-all text-slate-400">
                    Field: {item.field_name || "Not available"}
                  </p>

                  <p
                    className={
                      item.status === "completed"
                        ? "mt-2 font-semibold text-emerald-400"
                        : "mt-2 font-semibold text-red-400"
                    }
                  >
                    Status: {item.status}
                  </p>

                  {(item.error || item.message) && (
                    <p className="mt-2 break-words text-amber-400">
                      {item.error || item.message}
                    </p>
                  )}
                </div>
              ))}

              {(!result.results || result.results.length === 0) && (
                <p className="mt-4 text-sm text-slate-400">
                  No attachments were processed in this batch.
                </p>
              )}
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
