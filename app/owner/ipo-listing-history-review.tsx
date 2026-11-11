
"use client";

import { useEffect, useMemo, useState } from "react";

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

const PAGE_SIZE = 25;

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined) return "—";

  return `₹${Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

export default function IpoListingHistoryReview() {
  const [records, setRecords] = useState<ListingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">
            IPO Listing History Review
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Review imported NSE listing records.
          </p>
        </div>

        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-300">
          Pending Review
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-950 p-4">
          <p className="text-xs text-slate-400">Database Records</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {total}
          </p>
        </div>

        <div className="rounded-xl bg-slate-950 p-4">
          <p className="text-xs text-slate-400">Loaded Records</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {records.length}
          </p>
        </div>

        <div className="rounded-xl bg-slate-950 p-4">
          <p className="text-xs text-slate-400">Filtered Results</p>
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
          }}
          placeholder="Search company name or symbol..."
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
        />
      </div>

      {loading && (
        <p className="py-8 text-center text-sm text-slate-400">
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
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b border-slate-700 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-3">Company / Symbol</th>
                  <th className="px-3 py-3">Listing Date</th>
                  <th className="px-3 py-3">Issue Price</th>
                  <th className="px-3 py-3">Listing Close</th>
                  <th className="px-3 py-3">Listing Gain %</th>
                  <th className="px-3 py-3">LTP</th>
                  <th className="px-3 py-3">Current Gain %</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {visibleRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-800/50">
                    <td className="px-3 py-4">
                      <p className="font-semibold text-white">
                        {record.company_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {record.symbol}
                      </p>
                    </td>

                    <td className="px-3 py-4 text-slate-300">
                      {formatDate(record.listing_date)}
                    </td>

                    <td className="px-3 py-4 text-slate-300">
                      {formatPrice(record.issue_price)}
                    </td>

                    <td className="px-3 py-4 text-slate-300">
                      {formatPrice(record.listing_day_close)}
                    </td>

                    <td className="px-3 py-4 text-slate-300">
                      {record.listing_day_gain_percent ?? "—"}%
                    </td>

                    <td className="px-3 py-4 text-slate-300">
                      {formatPrice(record.ltp)}
                    </td>

                    <td className="px-3 py-4 text-slate-300">
                      {record.current_gain_percent ?? "—"}%
                    </td>

                    <td className="px-3 py-4">
                      <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300">
                        {record.review_status}
                      </span>
                    </td>
                  </tr>
                ))}

                {visibleRecords.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-10 text-center text-slate-400"
                    >
                      No listing records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              Page {currentPage} of {totalPages}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <p className="mt-5 text-xs leading-5 text-slate-500">
        Read-only review view. No approval, rejection, identity verification,
        IPO master linking, or database modification is performed here.
      </p>
    </section>
  );
}
