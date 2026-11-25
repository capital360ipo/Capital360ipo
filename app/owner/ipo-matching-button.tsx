"use client";

import { useState } from "react";

type PreviewResult = {
  mode?: string;
  readOnly?: boolean;
  databaseWrites?: number;
  processed?: number;
  sourceCounts?: Record<string, number>;
  statusCounts?: Record<string, number>;
  upcomingDrhpRecords?: number;
  eligibleUpcomingRecords?: number;
  missingOrUnknownTypeRecords?: number;
  historicalExcluded?: number;
  listedExcluded?: number;
  otherStatusExcluded?: number;
  candidatePairs?: number;
  recordsWithCandidates?: number;
  typeMismatchPairs?: number;
  alreadyLinked?: number;
  pendingCandidateLinking?: number;
  unknownType?: number;
  totalCandidates?: number;
  verified?: number;
  linked?: number;
  published?: number;
  candidate_linking?: {
    candidates_created?: number;
    existing_candidates_reused?: number;
    queue_records_linked?: number;
  };
  evidence_linking?: {
    evidence_linked?: number;
  };
};

type Result = {
  success?: boolean;
  mode?: "preview" | "executed";
  result?: PreviewResult;
  message?: string;
  error?: string;
};

export default function IpoMatchingButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runMatching(confirmLinking = false) {
    setLoading(true);
    setResult(null);

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

      const data = (await response.json()) as Result;

      if (!response.ok || !data.success) {
        setResult({
          success: false,
          error: data.error || "IPO matching failed.",
        });
        return;
      }

      setResult(data);
    } catch {
      setResult({
        success: false,
        error: "Matching request failed. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  const preview = result?.result;

  return (
    <section className="mt-6 rounded-2xl border border-cyan-500/30 bg-slate-900 p-5">
      <p className="text-sm font-semibold text-cyan-400">
        IPO MATCHING ENGINE
      </p>

      <h2 className="mt-2 text-xl font-bold text-white">
        Cross-Source Matching
      </h2>

      <p className="mt-2 text-sm text-slate-400">
        Matches upcoming IPO records across official sources.
        Historical and already-listed IPOs are excluded from
        upcoming matching.
      </p>

      <button
        type="button"
        onClick={() => runMatching(false)}
        disabled={loading}
        className="mt-4 rounded-lg bg-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Checking..." : "Run Matching Preview"}
      </button>

      {result && (
        <div className="mt-4 rounded-lg border border-slate-700 p-4 text-sm">
          {result.success ? (
            <>
              <p className="font-semibold text-emerald-400">
                {result.mode === "executed"
                  ? "Linking completed"
                  : "Preview completed"}
              </p>

              <p className="mt-2 text-cyan-300">
                Mode: {result.mode || "preview"}
              </p>

              {result.mode === "preview" && preview && (
                <>
                  <div className="mt-3 space-y-2 text-slate-300">
                    <p>
                      Total queue records processed:{" "}
                      {preview.processed ?? 0}
                    </p>
                    <p>
                      Upcoming DRHP records:{" "}
                      {preview.upcomingDrhpRecords ?? 0}
                    </p>
                    <p>
                      Eligible upcoming records:{" "}
                      {preview.eligibleUpcomingRecords ?? 0}
                    </p>
                    <p>
                      Missing or unknown IPO type:{" "}
                      {preview.missingOrUnknownTypeRecords ?? 0}
                    </p>
                    <p>
                      Historical records excluded:{" "}
                      {preview.historicalExcluded ?? 0}
                    </p>
                    <p>
                      Listed records excluded:{" "}
                      {preview.listedExcluded ?? 0}
                    </p>
                    <p>
                      Other status records excluded:{" "}
                      {preview.otherStatusExcluded ?? 0}
                    </p>
                  </div>

                  {preview.sourceCounts && (
                    <div className="mt-4 border-t border-slate-700 pt-3">
                      <p className="font-semibold text-cyan-300">
                        Records by source
                      </p>
                      {Object.entries(preview.sourceCounts).map(
                        ([source, count]) => (
                          <p key={source} className="mt-1 text-slate-300">
                            {source}: {count}
                          </p>
                        )
                      )}
                    </div>
                  )}

                  {preview.statusCounts && (
                    <div className="mt-4 border-t border-slate-700 pt-3">
                      <p className="font-semibold text-cyan-300">
                        Records by status
                      </p>
                      {Object.entries(preview.statusCounts).map(
                        ([status, count]) => (
                          <p key={status} className="mt-1 text-slate-300">
                            {status}: {count}
                          </p>
                        )
                      )}
                    </div>
                  )}

                  <div className="mt-4 border-t border-slate-700 pt-3 text-slate-300">
                    <p>Database writes: {preview.databaseWrites ?? 0}</p>
                    <p>Verified: {preview.verified ?? 0}</p>
                    <p>Linked: {preview.linked ?? 0}</p>
                    <p>Published: {preview.published ?? 0}</p>
                  </div>

                  <p className="mt-3 text-emerald-300">
                    Preview is read-only. No database records were changed.
                  </p>
                </>
              )}

              {result.mode === "executed" && (
                <div className="mt-3 space-y-2 text-slate-300">
                  <p>
                    Queue records linked:{" "}
                    {preview?.candidate_linking?.queue_records_linked ?? 0}
                  </p>
                  <p>
                    New candidates created:{" "}
                    {preview?.candidate_linking?.candidates_created ?? 0}
                  </p>
                  <p>
                    Existing candidates reused:{" "}
                    {preview?.candidate_linking?.existing_candidates_reused ?? 0}
                  </p>
                  <p>
                    Evidence records linked:{" "}
                    {preview?.evidence_linking?.evidence_linked ?? 0}
                  </p>
                </div>
              )}

              <p className="mt-3 text-slate-400">
                {result.message}
              </p>

              {result.mode === "preview" && (
                <div className="mt-5 rounded-lg border border-amber-500/40 bg-amber-950/30 p-4">
                  <p className="font-semibold text-amber-300">
                    Confirm Automatic Linking
                  </p>

                  <p className="mt-2 text-slate-300">
                    This action links eligible queue and evidence records.
                    It does not verify evidence or publish IPOs.
                  </p>

                  <button
                    type="button"
                    onClick={() => runMatching(true)}
                    disabled={loading}
                    className="mt-4 rounded-lg bg-amber-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {loading ? "Linking..." : "Confirm Linking"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-red-400">
              {result.error || "IPO matching failed."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
