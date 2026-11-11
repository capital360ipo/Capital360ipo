"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type ListingRecord = {
  id: string;
  company_name: string;
  symbol: string;
  listing_date: string | null;
  issue_price: number | null;
  listing_day_close: number | null;
  listing_day_gain_percent: number | null;
  ltp: number | null;
  current_gain_percent: number | null;
  review_status: string;
  source: string;
  source_observed_at: string | null;
  created_at: string;
};

type ApiResult = {
  success?: boolean;
  records?: ListingRecord[];
  total?: number;
  error?: string;
};

type EvidenceType =
  | "nse_listing_circular"
  | "nse_security_master"
  | "sebi_filing"
  | "issuer_website"
  | "other";

type EvidenceDraft = {
  source_name: string;
  source_url: string;
  evidence_type: EvidenceType;
  field_name: string;
  field_value: string;
  issuer_name: string;
};

type EvidenceResult = {
  success: boolean;
  message: string;
};

const PAGE_SIZE = 25;

const DEFAULT_EVIDENCE: EvidenceDraft = {
  source_name: "NSE",
  source_url: "",
  evidence_type: "nse_listing_circular",
  field_name: "",
  field_value: "",
  issuer_name: "",
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(
    `${value.slice(0, 10)}T00:00:00`
  ).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined) return "—";

  return `₹${Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined) return "—";

  return `${Number(value).toFixed(2)}%`;
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-900 p-3">
      <p className="text-xs text-slate-300">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

export default function IpoListingHistoryReview() {
  const [records, setRecords] = useState<ListingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [evidenceDrafts, setEvidenceDrafts] = useState<
    Record<string, EvidenceDraft>
  >({});

  const [evidenceResults, setEvidenceResults] = useState<
    Record<string, EvidenceResult>
  >({});

  const [evidenceLoadingId, setEvidenceLoadingId] = useState<
    string | null
  >(null);

  useEffect(() => {
    let active = true;

    async function loadRecords() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          "/api/automation/ipo-listing-history-review",
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          }
        );

        const contentType =
          response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
          throw new Error("Unexpected server response.");
        }

        const data = (await response.json()) as ApiResult;

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || "Unable to load listing history."
          );
        }

        if (active) {
          setRecords(data.records || []);
          setTotal(data.total || 0);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unknown loading error."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRecords();

    return () => {
      active = false;
    };
  }, []);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return records;

    return records.filter(
      (record) =>
        record.company_name.toLowerCase().includes(term) ||
        record.symbol.toLowerCase().includes(term)
    );
  }, [records, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRecords.length / PAGE_SIZE)
  );

  const currentPage = Math.min(page, totalPages);

  const visibleRecords = filteredRecords.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function toggleDetails(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  function getDraft(id: string): EvidenceDraft {
    return evidenceDrafts[id] || DEFAULT_EVIDENCE;
  }

  function updateDraft(
    id: string,
    field: keyof EvidenceDraft,
    value: string
  ) {
    setEvidenceDrafts((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] || DEFAULT_EVIDENCE),
        [field]: value,
      },
    }));

    setEvidenceResults((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }

  async function submitEvidence(
    event: FormEvent<HTMLFormElement>,
    record: ListingRecord
  ) {
    event.preventDefault();

    if (evidenceLoadingId) return;

    const draft = getDraft(record.id);

    if (!draft.source_name.trim()) {
      setEvidenceResults((previous) => ({
        ...previous,
        [record.id]: {
          success: false,
          message: "Source name is required.",
        },
      }));
      return;
    }

    if (
      (draft.evidence_type === "nse_listing_circular" ||
        draft.evidence_type === "nse_security_master" ||
        draft.evidence_type === "sebi_filing") &&
      !draft.source_url.trim()
    ) {
      setEvidenceResults((previous) => ({
        ...previous,
        [record.id]: {
          success: false,
          message:
            "Official source URL is required for this evidence type.",
        },
      }));
      return;
    }

    setEvidenceLoadingId(record.id);

    setEvidenceResults((previous) => {
      const next = { ...previous };
      delete next[record.id];
      return next;
    });

    try {
      const response = await fetch(
        "/api/automation/ipo-listing-evidence",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            listing_history_id: record.id,
            source_name: draft.source_name.trim(),
            source_url: draft.source_url.trim() || null,
            evidence_type: draft.evidence_type,
            field_name: draft.field_name.trim() || null,
            field_value: draft.field_value.trim() || null,
            issuer_name: draft.issuer_name.trim() || null,
          }),
        }
      );

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error("Unexpected server response.");
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Evidence submission failed."
        );
      }

      setEvidenceResults((previous) => ({
        ...previous,
        [record.id]: {
          success: true,
          message:
            "Evidence submitted successfully. Verification status: Unverified.",
        },
      }));

      setEvidenceDrafts((previous) => ({
        ...previous,
        [record.id]: { ...DEFAULT_EVIDENCE },
      }));
    } catch (err) {
      setEvidenceResults((previous) => ({
        ...previous,
        [record.id]: {
          success: false,
          message:
            err instanceof Error
              ? err.message
              : "Unknown evidence submission error.",
        },
      }));
    } finally {
      setEvidenceLoadingId(null);
    }
  }

  // High contrast input styling for mobile and desktop
  const inputClass =
    "w-full rounded-lg border border-slate-500 bg-slate-800 px-3 py-3 text-sm !text-white placeholder:!text-slate-400 outline-none [color-scheme:dark] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">
            IPO Listing History Review
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Review imported NSE listing records and submit official evidence.
          </p>
        </div>

        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-300">
          Pending Review
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-950 p-4">
          <p className="text-xs text-slate-300">Database Records</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {total}
          </p>
        </div>

        <div className="rounded-xl bg-slate-950 p-4">
          <p className="text-xs text-slate-300">Loaded Records</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {records.length}
          </p>
        </div>

        <div className="rounded-xl bg-slate-950 p-4">
          <p className="text-xs text-slate-300">Filtered Results</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {filteredRecords.length}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
            setExpandedId(null);
          }}
          placeholder="Search company name or symbol..."
          className={inputClass}
        />
      </div>

      {loading && (
        <p className="py-8 text-center text-sm text-slate-300">
          Loading listing records...
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="border-b border-slate-700 text-xs text-slate-300">
                <tr>
                  <th className="px-3 py-3">Company / Symbol</th>
                  <th className="px-3 py-3">Listing Date</th>
                  <th className="px-3 py-3">Issue Price</th>
                  <th className="px-3 py-3">Listing Close</th>
                  <th className="px-3 py-3">Listing Gain %</th>
                  <th className="px-3 py-3">LTP</th>
                  <th className="px-3 py-3">Current Gain %</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Details</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {visibleRecords.map((record) => {
                  const isExpanded = expandedId === record.id;
                  const draft = getDraft(record.id);
                  const evidenceResult = evidenceResults[record.id];
                  const isSubmitting =
                    evidenceLoadingId === record.id;

                  return (
                    <Fragment key={record.id}>
                      <tr className="hover:bg-slate-800/50">
                        <td className="px-3 py-4">
                          <p className="font-semibold text-white">
                            {record.company_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">
                            {record.symbol}
                          </p>
                        </td>

                        <td className="px-3 py-4 text-slate-200">
                          {formatDate(record.listing_date)}
                        </td>

                        <td className="px-3 py-4 text-slate-200">
                          {formatPrice(record.issue_price)}
                        </td>

                        <td className="px-3 py-4 text-slate-200">
                          {formatPrice(record.listing_day_close)}
                        </td>

                        <td className="px-3 py-4 text-slate-200">
                          {formatPercent(record.listing_day_gain_percent)}
                        </td>

                        <td className="px-3 py-4 text-slate-200">
                          {formatPrice(record.ltp)}
                        </td>

                        <td className="px-3 py-4 text-slate-200">
                          {formatPercent(record.current_gain_percent)}
                        </td>

                        <td className="px-3 py-4">
                          <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300">
                            {record.review_status}
                          </span>
                        </td>

                        <td className="px-3 py-4">
                          <button
                            type="button"
                            onClick={() => toggleDetails(record.id)}
                            aria-expanded={isExpanded}
                            className="whitespace-nowrap rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
                          >
                            {isExpanded ? "Hide Details" : "View Details"}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="bg-slate-950/70 p-4">
                            <div className="space-y-5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-base font-bold text-white">
                                  {record.company_name}
                                </h3>

                                <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                                  {record.review_status}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <DetailItem
                                  label="Company Name"
                                  value={record.company_name}
                                />
                                <DetailItem
                                  label="Trading Symbol"
                                  value={record.symbol}
                                />
                                <DetailItem
                                  label="Listing Date"
                                  value={formatDate(record.listing_date)}
                                />
                                <DetailItem
                                  label="Issue Price"
                                  value={formatPrice(record.issue_price)}
                                />
                                <DetailItem
                                  label="Listing Day Close"
                                  value={formatPrice(record.listing_day_close)}
                                />
                                <DetailItem
                                  label="Listing Day Gain"
                                  value={formatPercent(record.listing_day_gain_percent)}
                                />
                                <DetailItem
                                  label="Latest Traded Price (LTP)"
                                  value={formatPrice(record.ltp)}
                                />
                                <DetailItem
                                  label="Current Gain"
                                  value={formatPercent(record.current_gain_percent)}
                                />
                                <DetailItem
                                  label="Review Status"
                                  value={record.review_status}
                                />
                                <DetailItem
                                  label="Data Source"
                                  value={record.source}
                                />
                                <DetailItem
                                  label="Source Observed At"
                                  value={formatDateTime(record.source_observed_at)}
                                />
                                <DetailItem
                                  label="Record Imported At"
                                  value={formatDateTime(record.created_at)}
                                />
                              </div>

                              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                                <p className="text-sm font-semibold text-amber-300">
                                  Verification Required
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-200">
                                  This listing record has not yet been
                                  independently verified against official
                                  identity evidence. Adding evidence does not
                                  approve or publish this listing.
                                </p>
                              </div>

                              <div className="rounded-xl border border-slate-600 bg-slate-900 p-4">
                                <h3 className="text-base font-bold text-white">
                                  Add Official Evidence
                                </h3>

                                <p className="mt-1 text-xs leading-5 text-slate-300">
                                  Submit an official source reference or
                                  supporting information for this listing.
                                  Every submission starts as Unverified.
                                </p>

                                <form
                                  onSubmit={(event) =>
                                    submitEvidence(event, record)
                                  }
                                  className="mt-4 space-y-3"
                                >
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-200">
                                      Evidence Type
                                    </label>

                                    <select
                                      value={draft.evidence_type}
                                      onChange={(event) =>
                                        updateDraft(
                                          record.id,
                                          "evidence_type",
                                          event.target.value
                                        )
                                      }
                                      className={inputClass}
                                      disabled={isSubmitting}
                                    >
                                      <option value="nse_listing_circular">
                                        NSE Listing Circular
                                      </option>
                                      <option value="nse_security_master">
                                        NSE Security Master
                                      </option>
                                      <option value="sebi_filing">
                                        SEBI Filing
                                      </option>
                                      <option value="issuer_website">
                                        Issuer Website
                                      </option>
                                      <option value="other">
                                        Other Evidence
                                      </option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-200">
                                      Source Name
                                    </label>
                                    <input
                                      value={draft.source_name}
                                      onChange={(event) =>
                                        updateDraft(
                                          record.id,
                                          "source_name",
                                          event.target.value
                                        )
                                      }
                                      placeholder="Example: NSE"
                                      maxLength={100}
                                      required
                                      className={inputClass}
                                      disabled={isSubmitting}
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-200">
                                      Official Source URL
                                    </label>
                                    <input
                                      type="url"
                                      value={draft.source_url}
                                      onChange={(event) =>
                                        updateDraft(
                                          record.id,
                                          "source_url",
                                          event.target.value
                                        )
                                      }
                                      placeholder="https://..."
                                      maxLength={2000}
                                      className={inputClass}
                                      disabled={isSubmitting}
                                    />
                                  </div>

                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-slate-200">
                                        Field Name
                                      </label>
                                      <input
                                        value={draft.field_name}
                                        onChange={(event) =>
                                          updateDraft(
                                            record.id,
                                            "field_name",
                                            event.target.value
                                          )
                                        }
                                        placeholder="Example: ISIN"
                                        maxLength={200}
                                        className={inputClass}
                                        disabled={isSubmitting}
                                      />
                                    </div>

                                    <div>
                                      <label className="mb-1 block text-xs font-medium text-slate-200">
                                        Field Value
                                      </label>
                                      <input
                                        value={draft.field_value}
                                        onChange={(event) =>
                                          updateDraft(
                                            record.id,
                                            "field_value",
                                            event.target.value
                                          )
                                        }
                                        placeholder="Example: INE..."
                                        maxLength={1000}
                                        className={inputClass}
                                        disabled={isSubmitting}
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-200">
                                      Issuer Name
                                    </label>
                                    <input
                                      value={draft.issuer_name}
                                      onChange={(event) =>
                                        updateDraft(
                                          record.id,
                                          "issuer_name",
                                          event.target.value
                                        )
                                      }
                                      placeholder="Company / Issuer name"
                                      maxLength={250}
                                      className={inputClass}
                                      disabled={isSubmitting}
                                    />
                                  </div>

                                  <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                                  >
                                    {isSubmitting
                                      ? "Submitting Evidence..."
                                      : "Submit Evidence"}
                                  </button>
                                </form>

                                {evidenceResult && (
                                  <div
                                    className={`mt-4 rounded-lg border p-3 text-sm ${
                                      evidenceResult.success
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                        : "border-red-500/30 bg-red-500/10 text-red-300"
                                    }`}
                                  >
                                    {evidenceResult.message}
                                  </div>
                                )}
                              </div>

                              <p className="text-xs text-slate-400">
                                Record ID: {record.id}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

                {visibleRecords.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-10 text-center text-slate-300"
                    >
                      No listing records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-300">
              Page {currentPage} of {totalPages}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => {
                  setPage((value) => value - 1);
                  setExpandedId(null);
                }}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-40"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setPage((value) => value + 1);
                  setExpandedId(null);
                }}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <p className="mt-5 text-xs leading-5 text-slate-400">
        Evidence submissions remain unverified. This screen does not
        approve, reject, verify identity, link IPO Master records,
        or publish listings.
      </p>
    </section>
  );
}
