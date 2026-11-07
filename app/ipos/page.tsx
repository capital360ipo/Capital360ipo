"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type IPO = {
  id: string;
  company_name: string;
  price_band: string | null;
  open_date: string | null;
  close_date: string | null;
  listing_date: string | null;
  status: string | null;
  ipo_type: string | null;
  drhp_filed_date: string | null;
};

type StatusFilter = "All" | "Upcoming" | "Open" | "Past";
type TypeFilter = "All Types" | "Mainboard" | "SME";

const TEST_IPO_ID = "1ea4a898-8628-4d30-b117-e5f8d198bea9";

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(date: string | null) {
  if (!date) return "Not announced";

  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getCategory(ipo: IPO): "Upcoming" | "Open" | "Past" | "Other" {
  const status = (ipo.status || "").toLowerCase().trim();

  if (
    ["postponed", "withdrawn", "cancelled", "canceled"].includes(status)
  ) {
    return "Other";
  }

  const today = todayDate();

  if (ipo.open_date && ipo.open_date > today) return "Upcoming";

  if (
    ipo.open_date &&
    ipo.close_date &&
    ipo.open_date <= today &&
    ipo.close_date >= today
  ) {
    return "Open";
  }

  if (ipo.close_date && ipo.close_date < today) return "Past";

  return "Other";
}

function isDrhpPipeline(ipo: IPO) {
  const category = getCategory(ipo);
  const status = (ipo.status || "").toLowerCase().trim();

  return (
    Boolean(ipo.drhp_filed_date) &&
    category !== "Open" &&
    category !== "Past" &&
    category !== "Other" &&
    !["withdrawn", "cancelled", "canceled"].includes(status)
  );
}

function filterByType(ipo: IPO, type: TypeFilter) {
  if (type === "All Types") return true;

  return (ipo.ipo_type || "").toLowerCase() === type.toLowerCase();
}

function IPOCard({
  ipo,
  pipeline = false,
}: {
  ipo: IPO;
  pipeline?: boolean;
}) {
  const category = getCategory(ipo);
  const type = ipo.ipo_type?.toUpperCase() || "IPO";

  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-teal-300 hover:shadow-xl sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900 sm:text-xl">
            {ipo.company_name?.trim() || "IPO"}
          </h3>
          <p className="mt-1 text-xs font-semibold tracking-wide text-slate-400">
            {type}
          </p>
        </div>

        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 ring-1 ring-teal-100">
          {pipeline ? "DRHP Filed" : category === "Other" ? ipo.status || "IPO" : category}
        </span>
      </div>

      {pipeline ? (
        <div className="my-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-900">
            IPO in preparation
          </p>
          <p className="mt-1 text-xs leading-5 text-blue-700">
            DRHP filing recorded. IPO opening is not yet confirmed.
          </p>
        </div>
      ) : (
        <div className="my-6 grid grid-cols-2 gap-x-4 gap-y-6 border-y border-slate-100 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Price Band
            </p>
            <p className="mt-2 font-bold text-slate-800">
              {ipo.price_band || "Not announced"}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Opening Date
            </p>
            <p className="mt-2 font-bold text-slate-800">
              {formatDate(ipo.open_date)}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Closing Date
            </p>
            <p className="mt-2 font-bold text-slate-800">
              {formatDate(ipo.close_date)}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Listing Date
            </p>
            <p className="mt-2 font-bold text-slate-800">
              {formatDate(ipo.listing_date)}
            </p>
          </div>
        </div>
      )}

      <Link
        href={`/ipos/${encodeURIComponent(ipo.id)}`}
        className="flex w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3.5 font-bold text-white transition hover:bg-teal-700"
      >
        View Full IPO Details <span className="ml-2">→</span>
      </Link>
    </article>
  );
}

export default function IPOListPage() {
  const [ipos, setIpos] = useState<IPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All Types");

  useEffect(() => {
    async function fetchIPOs() {
      try {
        const { data, error } = await supabase
          .from("ipo_master")
          .select(
            "id, company_name, price_band, open_date, close_date, listing_date, status, ipo_type, drhp_filed_date"
          )
          .order("open_date", { ascending: true, nullsFirst: false });

        if (error) throw error;

        setIpos((data || []) as IPO[]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load IPOs."
        );
      } finally {
        setLoading(false);
      }
    }

    fetchIPOs();
  }, []);

  const filteredData = useMemo(() => {
    const available = ipos
      .filter((ipo) => ipo.id !== TEST_IPO_ID)
      .filter((ipo) =>
        (ipo.company_name || "")
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      )
      .filter((ipo) => filterByType(ipo, typeFilter));

    const pipeline = available.filter(isDrhpPipeline);

    const regular = available.filter((ipo) => !isDrhpPipeline(ipo));

    const main = regular.filter((ipo) => {
      const category = getCategory(ipo);

      if (statusFilter === "All") return true;
      if (statusFilter === "Upcoming") return category === "Upcoming";
      if (statusFilter === "Open") return category === "Open";
      if (statusFilter === "Past") return category === "Past";

      return false;
    });

    return {
      main,
      pipeline:
        statusFilter === "All" || statusFilter === "Open"
          ? pipeline
          : [],
    };
  }, [ipos, search, statusFilter, typeFilter]);

  const statusOptions: StatusFilter[] = [
    "All",
    "Upcoming",
    "Open",
    "Past",
  ];

  const typeOptions: TypeFilter[] = [
    "All Types",
    "Mainboard",
    "SME",
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-2xl font-black tracking-tight">
            Capital<span className="text-teal-600">360</span>IPO
          </Link>

          <Link
            href="/"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-teal-700"
          >
            ← Home
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:py-14">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-800 to-teal-950 px-6 py-10 text-white shadow-xl sm:px-10 sm:py-14">
          <p className="text-sm font-bold tracking-[0.25em] text-teal-300">
            CAPITAL360IPO
          </p>

          <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">
            IPO Information Center
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Discover IPO opportunities, company filings, issue details
            and important market information in one place.
          </p>

          <div className="mt-8 max-w-xl">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search IPO by company name..."
              aria-label="Search IPO by company name"
              className="w-full rounded-xl border border-white/20 bg-white px-5 py-4 text-slate-900 shadow-lg outline-none placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-400/20"
            />
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-black text-slate-900">
            IPO Status
          </h2>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {statusOptions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatusFilter(item)}
                className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition ${
                  statusFilter === item
                    ? "bg-slate-900 text-white shadow-md"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <h2 className="text-xl font-black text-slate-900">
            IPO Type
          </h2>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {typeOptions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTypeFilter(item)}
                className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition ${
                  typeFilter === item
                    ? "bg-teal-700 text-white shadow-md"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-900">
              {statusFilter === "All" ? "All IPOs" : `${statusFilter} IPOs`}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Explore IPO information by status and category
            </p>
          </div>

          <span className="rounded-full border border-teal-100 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-700">
            {filteredData.main.length + filteredData.pipeline.length} Results
          </span>
        </div>

        {loading && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white py-20 text-center shadow-sm">
            <p className="font-medium text-slate-500">
              Loading IPO information...
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            Unable to load IPOs: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {filteredData.main.length > 0 && (
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {filteredData.main.map((ipo) => (
                  <IPOCard key={ipo.id} ipo={ipo} />
                ))}
              </div>
            )}

            {filteredData.pipeline.length > 0 && (
              <section className="mt-12">
                <div className="mb-5 border-b border-slate-200 pb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-black text-slate-900">
                      DRHP Filed – Upcoming Pipeline
                    </h2>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                      {filteredData.pipeline.length} Companies
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Companies with a recorded DRHP filing. IPO opening
                    dates are not yet confirmed.
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  {filteredData.pipeline.map((ipo) => (
                    <IPOCard key={ipo.id} ipo={ipo} pipeline />
                  ))}
                </div>
              </section>
            )}

            {filteredData.main.length === 0 &&
              filteredData.pipeline.length === 0 && (
                <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800">
                    No IPO found
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Try another status, IPO type or company name.
                  </p>
                </div>
              )}
          </>
        )}

        <footer className="mt-14 border-t border-slate-200 py-7 text-center text-xs leading-6 text-slate-500">
          © Capital360IPO. Informational purposes only. Verify IPO
          information with official exchange and issuer documents.
          GMP is unofficial and speculative.
        </footer>
      </section>
    </main>
  );
}
