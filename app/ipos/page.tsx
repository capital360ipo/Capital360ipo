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
};

type Filter = "All" | "Upcoming" | "Open" | "Past" | "Mainboard" | "SME";

const TEST_IPO_ID = "1ea4a898-8628-4d30-b117-e5f8d198bea9";

function formatDate(date: string | null) {
  if (!date) return "Not announced";

  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getCategory(ipo: IPO): "Upcoming" | "Open" | "Past" | "Other" {
  const status = (ipo.status || "").toLowerCase();

  if (["postponed", "withdrawn", "cancelled", "canceled"].includes(status)) {
    return "Other";
  }

  const today = new Date().toLocaleDateString("en-CA");

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

export default function IPOListPage() {
  const [ipos, setIpos] = useState<IPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");

  useEffect(() => {
    async function fetchIPOs() {
      try {
        const { data, error } = await supabase
          .from("ipo_master")
          .select(
            "id, company_name, price_band, open_date, close_date, listing_date, status, ipo_type"
          )
          .order("open_date", { ascending: true, nullsFirst: false });

        if (error) throw error;

        setIpos((data || []) as IPO[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load IPOs.");
      } finally {
        setLoading(false);
      }
    }

    fetchIPOs();
  }, []);

  const visibleIPOs = useMemo(() => {
    return ipos
      .filter((ipo) => ipo.id !== TEST_IPO_ID)
      .filter((ipo) =>
        (ipo.company_name || "")
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      )
      .filter((ipo) => {
        const category = getCategory(ipo);
        const type = (ipo.ipo_type || "").toLowerCase();

        if (filter === "All") return true;
        if (filter === "Upcoming") return category === "Upcoming";
        if (filter === "Open") return category === "Open";
        if (filter === "Past") return category === "Past";
        if (filter === "Mainboard") return type === "mainboard";
        if (filter === "SME") return type === "sme";

        return true;
      });
  }, [ipos, search, filter]);

  const filters: Filter[] = [
    "All",
    "Upcoming",
    "Open",
    "Past",
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
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-teal-700"
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
            Explore upcoming, open and listed IPOs, important dates,
            price bands and market information — all in one place.
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
          <h2 className="text-2xl font-black text-slate-900">Explore IPOs</h2>
          <p className="mt-1 text-sm text-slate-500">
            Find IPOs by status and market category
          </p>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-3">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition ${
                  filter === item
                    ? "bg-slate-900 text-white shadow-md"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-extrabold text-slate-900">
              {filter === "All" ? "All IPOs" : `${filter} IPOs`}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              IPO information from our database
            </p>
          </div>

          <span className="rounded-full border border-teal-100 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-700">
            {visibleIPOs.length} IPOs
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

        {!loading && !error && visibleIPOs.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <h3 className="text-lg font-bold text-slate-800">
              No IPO found
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Try another filter or company name.
            </p>
          </div>
        )}

        {!loading && !error && visibleIPOs.length > 0 && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {visibleIPOs.map((ipo) => {
              const category = getCategory(ipo);
              const type = ipo.ipo_type?.toUpperCase() || "IPO";

              return (
                <article
                  key={ipo.id}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-teal-300 hover:shadow-xl"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900">
                        {ipo.company_name?.trim() || "IPO"}
                      </h3>
                      <p className="mt-1 text-xs font-semibold tracking-wide text-slate-400">
                        {type}
                      </p>
                    </div>

                    <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 ring-1 ring-teal-100">
                      {category === "Other"
                        ? ipo.status || "IPO"
                        : category}
                    </span>
                  </div>

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

                  <Link
                    href={`/ipos/${encodeURIComponent(ipo.id)}`}
                    className="flex w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3.5 font-bold text-white transition hover:bg-teal-700"
                  >
                    View Full IPO Details <span className="ml-2">→</span>
                  </Link>
                </article>
              );
            })}
          </div>
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
