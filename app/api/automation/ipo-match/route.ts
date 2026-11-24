"use client";

import { useState } from "react";

type Result = {
  success?: boolean;
  mode?: "preview" | "executed";
  processed?: number;
  candidatePairs?: number;
  recordsWithCandidates?: number;
  typeMismatchPairs?: number;
  alreadyLinked?: number;
  masterMatched?: number;
  pendingCandidateLinking?: number;
  unknownType?: number;
  totalCandidates?: number;
  verified?: number;
  published?: number;
  result?: unknown;
  audit_log_saved?: boolean;
  message?: string;
  error?: string;
};

export default function IpoMatchingButton() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function runMatching(confirmLinking = false) {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/automation/ipo-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          confirmLinking ? { confirmLinking: true } : {}
        ),
      });

      const responseData = (await response.json()) as Result;

      if (!response.ok || !responseData.success) {
        throw new Error(
          responseData.error ||
            responseData.message ||
            "IPO matching request failed."
        );
      }

      setData(responseData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          IPO Candidate Matching
        </h2>

        <p className="mt-1 text-sm text-gray-600">
          Match IPO records collected from different sources.
          Preview is read-only. Candidate linking requires
          explicit confirmation.
        </p>
      </div>

      <button
        type="button"
        onClick={() => runMatching(false)}
        disabled={loading}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Please wait..." : "Run Matching Preview"}
      </button>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <h3 className="font-semibold text-gray-900">
              {data.mode === "executed"
                ? "Candidate Linking Result"
                : "Preview Result"}
            </h3>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Records Processed</p>
                <p className="font-semibold text-gray-900">
                  {data.processed ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Matching Pairs</p>
                <p className="font-semibold text-gray-900">
                  {data.candidatePairs ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Records with Matches</p>
                <p className="font-semibold text-gray-900">
                  {data.recordsWithCandidates ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Type Mismatches</p>
                <p className="font-semibold text-gray-900">
                  {data.typeMismatchPairs ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Already Linked</p>
                <p className="font-semibold text-gray-900">
                  {data.alreadyLinked ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Master Matched</p>
                <p className="font-semibold text-gray-900">
                  {data.masterMatched ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Pending Linking</p>
                <p className="font-semibold text-gray-900">
                  {data.pendingCandidateLinking ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Unknown Type</p>
                <p className="font-semibold text-gray-900">
                  {data.unknownType ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Existing Candidates</p>
                <p className="font-semibold text-gray-900">
                  {data.totalCandidates ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Verified</p>
                <p className="font-semibold text-gray-900">
                  {data.verified ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-gray-500">Published</p>
                <p className="font-semibold text-gray-900">
                  {data.published ?? "—"}
                </p>
              </div>
            </div>

            {data.message && (
              <p className="mt-3 border-t border-gray-200 pt-3 text-sm text-gray-700">
                {data.message}
              </p>
            )}
          </div>

          {data.mode === "preview" &&
            (data.pendingCandidateLinking ?? 0) > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">
                  Preview only. No database records have been
                  changed.
                </p>

                <p className="mt-1 text-sm text-amber-800">
                  Confirming will link eligible queue records
                  to IPO candidates. It will not verify or
                  publish IPOs.
                </p>

                <button
                  type="button"
                  onClick={() => runMatching(true)}
                  disabled={loading}
                  className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? "Linking..."
                    : "Confirm Linking"}
                </button>
              </div>
            )}

          {data.mode === "executed" && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <h3 className="font-semibold text-green-900">
                Linking API Response
              </h3>

              <p className="mt-2 text-sm text-green-800">
                Audit log saved:{" "}
                {data.audit_log_saved === true
                  ? "Yes"
                  : data.audit_log_saved === false
                    ? "No"
                    : "Not reported"}
              </p>

              <pre className="mt-3 overflow-x-auto rounded-lg bg-white p-3 text-xs text-gray-800">
                {JSON.stringify(data.result ?? null, null, 2)}
              </pre>

              <p className="mt-3 text-sm text-green-800">
                Verification and publication are not performed
                by this linking operation.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
