
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import SiteHeader from "@/components/SiteHeader";

type IPO = {
  id: string;
  company_name: string;
  price_band: string | null;
  open_date: string | null;
  close_date: string | null;
  listing_date: string | null;
  status: string | null;
  ipo_type?: string | null;
};

type GMP = {
  ipo_id: string;
  gmp: number | string | null;
  source: string | null;
  updated_at: string | null;
};

type Category = "current" | "upcoming" | "listed";

type IPOGroups = {
  current: IPO[];
  upcoming: IPO[];
  listed: IPO[];
};

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: string | null) {
  if (!date) return "—";

  const parsed = new Date(date + "T00:00:00");

  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getCategory(ipo: IPO, today: string): Category {
  const status = (ipo.status || "").toLowerCase().trim();

  // IPO listed status or listing date reached
  if (status.includes("listed")) return "listed";

  if (ipo.listing_date && ipo.listing_date <= today) {
    return "listed";
  }

  // Opening date is in the future
  if (ipo.open_date && ipo.open_date > today) {
    return "upcoming";
  }

  // IPO has opened or its closing date has passed,
  // but listing has not happened yet.
  if (
    (ipo.open_date && ipo.open_date <= today) ||
    (ipo.close_date && ipo.close_date <= today) ||
    status.includes("open") ||
    status.includes("closed") ||
    status.includes("cancel")
  ) {
    return "current";
  }

  if (status.includes("upcoming")) return "upcoming";

  return "upcoming";
}

function formatGMP(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";

  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return `${number > 0 ? "+" : ""}₹${number.toLocaleString("en-IN")}`;
}

function isSME(ipo: IPO) {
  return (ipo.ipo_type || "").toLowerCase().includes("sme");
}

function IPOCard({
  ipo,
  gmp,
  category,
  today,
}: {
  ipo: IPO;
  gmp: GMP | undefined;
  category: Category;
  today: string;
}) {
  const status = (ipo.status || "").toLowerCase();

  let statusLabel = "UPCOMING";
  let statusClass =
    "border-blue-400/20 bg-blue-400/10 text-blue-300";

  if (category === "listed") {
    statusLabel = "LISTED";
    statusClass =
      "border-slate-400/20 bg-slate-400/10 text-slate-300";
  } else if (category === "current") {
    if (status.includes("cancel")) {
      statusLabel = "CANCELLED";
      statusClass =
        "border-red-400/20 bg-red-400/10 text-red-300";
    } else if (ipo.close_date && ipo.close_date < today) {
      statusLabel = "AWAITING LISTING";
      statusClass =
        "border-amber-400/20 bg-amber-400/10 text-amber-300";
    } else if (
      ipo.open_date &&
      ipo.close_date &&
      ipo.open_date <= today &&
      ipo.close_date >= today
    ) {
      statusLabel = "OPEN";
      statusClass =
        "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
    } else {
      statusLabel = "CURRENT";
      statusClass =
        "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
    }
  }

  return (
    <article className="group rounded-2xl border border-white/10 bg-[#111a2b] p-5 transition duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:bg-[#142238] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {isSME(ipo) ? "SME IPO" : "MAINBOARD IPO"}
          </p>

          <Link
            href={`/ipos/${ipo.id}`}
            className="mt-2 block break-words text-lg font-bold text-white transition hover:text-emerald-300 sm:text-xl"
          >
            {ipo.company_name}
          </Link>
        </div>

        <span
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-wider ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-[#0b1423] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Open Date
          </p>
          <p className="mt-2 text-sm font-bold text-slate-200">
            {formatDate(ipo.open_date)}
          </p>
        </div>

        <div className="rounded-xl bg-[#0b1423] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Close Date
          </p>
          <p className="mt-2 text-sm font-bold text-slate-200">
            {formatDate(ipo.close_date)}
          </p>
        </div>

        <div className="rounded-xl bg-[#0b1423] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Price Band
          </p>
          <p className="mt-2 break-words text-sm font-bold text-slate-200">
            {ipo.price_band || "—"}
          </p>
        </div>

        <div className="rounded-xl bg-[#0b1423] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            GMP
          </p>
          <p className="mt-2 text-sm font-bold text-emerald-300">
            {formatGMP(gmp?.gmp)}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-xs text-slate-500">
          {gmp?.updated_at
            ? `GMP updated: ${formatDate(gmp.updated_at.slice(0, 10))}`
            : "GMP update unavailable"}
        </span>

        <Link
          href={`/ipos/${ipo.id}`}
          className="text-sm font-bold text-emerald-400 transition group-hover:text-emerald-300"
        >
          View Details →
        </Link>
      </div>
    </article>
  );
}

export default function Home() {
  const [ipos, setIpos] = useState<IPO[]>([]);
  const [gmpData, setGmpData] = useState<GMP[]>([]);

  const [mainboardExpanded, setMainboardExpanded] = useState(true);
  const [smeExpanded, setSmeExpanded] = useState(false);

  const [mainboardTab, setMainboardTab] =
    useState<Category>("current");
  const [smeTab, setSmeTab] = useState<Category>("current");

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchIPOData() {
      try {
        const { data, error: ipoError } = await supabase
          .from("ipo_master")
          .select("*")
          .order("open_date", {
            ascending: true,
            nullsFirst: false,
          });

        if (ipoError) throw ipoError;

        setIpos((data || []) as IPO[]);

        const { data: gmpRows, error: gmpError } = await supabase
          .from("ipo_gmp")
          .select("ipo_id, gmp, source, updated_at")
          .order("updated_at", { ascending: false });

        if (!gmpError) {
          setGmpData((gmpRows || []) as GMP[]);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "IPO जानकारी लोड नहीं हो पाई।"
        );
      } finally {
        setLoading(false);
      }
    }

    fetchIPOData();
  }, []);

  const today = todayDate();

  const latestGmp = useMemo(() => {
    const map = new Map<string, GMP>();

    for (const item of gmpData) {
      if (!map.has(item.ipo_id)) {
        map.set(item.ipo_id, item);
      }
    }

    return map;
  }, [gmpData]);

  const groupedIPOs = useMemo(() => {
    const mainboard: IPOGroups = {
      current: [],
      upcoming: [],
      listed: [],
    };

    const sme: IPOGroups = {
      current: [],
      upcoming: [],
      listed: [],
    };

    const searchText = search.trim().toLowerCase();

    for (const ipo of ipos) {
      if (
        searchText &&
        !ipo.company_name.toLowerCase().includes(searchText)
      ) {
        continue;
      }

      const category = getCategory(ipo, today);
      const target = isSME(ipo) ? sme : mainboard;

      target[category].push(ipo);
    }

    // Current IPOs: nearest closing date first
    const sortCurrent = (a: IPO, b: IPO) =>
      (a.close_date || "9999-12-31").localeCompare(
        b.close_date || "9999-12-31"
      );

    // Upcoming IPOs: nearest opening date first
    const sortUpcoming = (a: IPO, b: IPO) =>
      (a.open_date || "9999-12-31").localeCompare(
        b.open_date || "9999-12-31"
      );

    // Listed IPOs: latest listing first
    const sortListed = (a: IPO, b: IPO) =>
      (b.listing_date || "").localeCompare(
        a.listing_date || ""
      );

    for (const group of [mainboard, sme]) {
      group.current.sort(sortCurrent);
      group.upcoming.sort(sortUpcoming);
      group.listed.sort(sortListed);
    }

    return { mainboard, sme };
  }, [ipos, search, today]);

  const tabOptions: {
    key: Category;
    label: string;
  }[] = [
    { key: "current", label: "Current" },
    { key: "upcoming", label: "Upcoming" },
    { key: "listed", label: "Listed" },
  ];

  function renderBoardPanel({
    title,
    expanded,
    onToggle,
    activeTab,
    onTabChange,
    groups,
  }: {
    title: string;
    expanded: boolean;
    onToggle: () => void;
    activeTab: Category;
    onTabChange: (tab: Category) => void;
    groups: IPOGroups;
  }) {
    const activeItems = groups[activeTab];

    return (
      <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#101a2b]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-3 px-4 py-5 text-left transition hover:bg-white/[0.03] sm:px-6"
        >
          <div>
            <h2 className="text-base font-black tracking-wider text-white sm:text-lg">
              {title}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {expanded
                ? "IPO categories are open"
                : "Tap to view IPO categories"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">
              {groups.current.length +
                groups.upcoming.length +
                groups.listed.length} IPOs
            </span>

            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-lg text-emerald-400">
              {expanded ? "⌃" : "⌄"}
            </span>
          </div>
        </button>

        {expanded && (
          <div className="border-t border-white/10 px-3 pb-5 pt-4 sm:px-5">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#080e1b] p-1.5">
              {tabOptions.map((tab) => {
                const selected = activeTab === tab.key;
                const count = groups[tab.key].length;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => onTabChange(tab.key)}
                    className={`rounded-lg px-2 py-3 text-xs font-bold transition sm:text-sm ${
                      selected
                        ? "bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/20"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {tab.label}
                    <span className="ml-1.5 opacity-80">
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              {activeItems.length > 0 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {activeItems.map((ipo) => (
                    <IPOCard
                      key={ipo.id}
                      ipo={ipo}
                      gmp={latestGmp.get(ipo.id)}
                      category={activeTab}
                      today={today}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-[#0b1423] px-5 py-9 text-center">
                  <p className="font-semibold text-slate-300">
                    फिलहाल इस श्रेणी में कोई IPO उपलब्ध नहीं है।
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    नई जानकारी उपलब्ध होने पर यहाँ दिखाई जाएगी।
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-[#080e1b] text-white">
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">

        {/* PAGE INTRO */}
        <section className="flex flex-col justify-between gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-emerald-400">
              CAPITAL360IPO · IPO RESEARCH
            </p>

            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              IPO Market
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              Explore Mainboard and SME IPOs, dates, GMP and company details.
            </p>
          </div>

          <Link
            href="/ipos"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
          >
            All IPOs →
          </Link>
        </section>

        {/* SEARCH */}
        <section className="mt-6">
          <label htmlFor="ipo-search" className="sr-only">
            Search IPO company
          </label>

          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
              ⌕
            </span>

            <input
              id="ipo-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search IPO company name..."
              className="w-full rounded-xl border border-white/10 bg-[#101a2b] py-4 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/60"
            />
          </div>
        </section>

        {/* LOADING / ERROR / BOARD PANELS */}
        {loading ? (
          <div className="flex min-h-64 flex-col items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
            <p className="mt-4 text-sm text-slate-400">
              Loading IPO market...
            </p>
          </div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-red-400/20 bg-red-400/5 p-6 text-center">
            <p className="font-bold text-red-300">
              IPO जानकारी लोड नहीं हो पाई।
            </p>
            <p className="mt-2 break-words text-sm text-slate-400">
              {error}
            </p>
          </div>
        ) : (
          <>
            {renderBoardPanel({
              title: "MAINBOARD",
              expanded: mainboardExpanded,
              onToggle: () =>
                setMainboardExpanded((previous) => !previous),
              activeTab: mainboardTab,
              onTabChange: setMainboardTab,
              groups: groupedIPOs.mainboard,
            })}

            {renderBoardPanel({
              title: "SME",
              expanded: smeExpanded,
              onToggle: () =>
                setSmeExpanded((previous) => !previous),
              activeTab: smeTab,
              onTabChange: setSmeTab,
              groups: groupedIPOs.sme,
            })}
          </>
        )}

        {/* DISCLAIMER */}
        <section className="mt-10 rounded-2xl border border-amber-400/15 bg-amber-400/5 p-5">
          <p className="text-sm font-bold text-amber-300">
            Important Information
          </p>
          <p className="mt-2 text-xs leading-6 text-slate-400">
            GMP unofficial and speculative है। यह listing price या return
            की गारंटी नहीं है। निवेश से पहले आधिकारिक IPO documents और
            exchange information की जाँच करें।
          </p>
        </section>

        {/* FOOTER */}
        <footer className="mt-10 border-t border-white/10 py-7 text-center">
          <Link href="/" className="text-lg font-black">
            CAPITAL<span className="text-emerald-400">360</span>IPO
          </Link>
          <p className="mt-2 text-xs text-slate-500">
            IPO Research & Market Intelligence
          </p>
          <p className="mt-2 text-xs text-slate-600">
            © {new Date().getFullYear()} Capital360IPO. Informational purposes only.
          </p>
        </footer>
      </div>
    </main>
  );
}
