
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type IPO = {
  uuid: string;
  company_name: string;
  price_band: string | null;
  open_date: string | null;
  closing_date: string | null;
  listing_date: string | null;
  status: string | null;
  created_at: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function formatDate(date: string | null) {
  if (!date) return "Not announced";

  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function IPOListPage() {
  const [ipos, setIpos] = useState<IPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchIPOs() {
      try {
        const { data, error } = await supabase
          .from("ipo_master")
          .select("*")
          .order("created_at", { ascending: false });

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

  const filteredIPOs = ipos.filter((ipo) =>
    ipo.company_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <header className="border-b border-white/10 bg-[#0b1929]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-2xl font-black text-teal-400">
            Capital360IPO
          </Link>
          <Link href="/" className="text-sm text-gray-300 hover:text-teal-400">
            Home
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#142d42] to-[#0b1929] p-7 sm:p-10">
          <p className="font-semibold tracking-widest text-teal-400">
            CAPITAL360IPO
          </p>

          <h1 className="mt-4 text-3xl font-black sm:text-5xl">
            IPO Information Center
          </h1>

          <p className="mt-4 max-w-2xl leading-7 text-gray-300">
            Explore IPO details, important dates, price bands and verified
            market information in one place.
          </p>

          <div className="mt-7">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search IPO by company name..."
              className="w-full max-w-xl rounded-xl border border-white/15 bg-[#07111f] px-5 py-4 text-white outline-none placeholder:text-gray-500 focus:border-teal-400"
            />
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">All IPOs</h2>
            <p className="mt-1 text-sm text-gray-400">
              IPO information from our database
            </p>
          </div>

          <span className="rounded-full border border-teal-400/20 bg-teal-400/10 px-4 py-2 text-sm font-semibold text-teal-300">
            {filteredIPOs.length} IPOs
          </span>
        </div>

        {loading && (
          <div className="py-20 text-center text-lg text-gray-300">
            Loading IPO information...
          </div>
        )}

        {!loading && error && (
          <div className="mt-8 rounded-2xl border border-red-400/20 bg-red-400/10 p-6 text-red-300">
            Unable to load IPOs: {error}
          </div>
        )}

        {!loading && !error && filteredIPOs.length === 0 && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-[#101e2e] p-10 text-center">
            <h3 className="text-xl font-bold">No IPO Found</h3>
            <p className="mt-2 text-gray-400">
              No IPO matches your search.
            </p>
          </div>
        )}

        {!loading && !error && filteredIPOs.length > 0 && (
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {filteredIPOs.map((ipo) => (
              <article
                key={ipo.uuid}
                className="rounded-2xl border border-white/10 bg-[#101e2e] p-6 transition hover:border-teal-400/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-xl font-bold">
                    {ipo.company_name}
                  </h3>

                  <span className="rounded-full bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-300">
                    {ipo.status || "IPO"}
                  </span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Price Band</p>
                    <p className="mt-1 font-bold">
                      {ipo.price_band || "Not announced"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400">Opening Date</p>
                    <p className="mt-1 font-bold">
                      {formatDate(ipo.open_date)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400">Closing Date</p>
                    <p className="mt-1 font-bold">
                      {formatDate(ipo.closing_date)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400">Listing Date</p>
                    <p className="mt-1 font-bold">
                      {formatDate(ipo.listing_date)}
                    </p>
                  </div>
                </div>

                <Link
                  href={`/ipos/${encodeURIComponent(ipo.uuid)}`}
                  className="mt-7 flex w-full items-center justify-center rounded-xl bg-teal-400 px-5 py-3 font-bold text-[#06221d] transition hover:bg-teal-300"
                >
                  View Full IPO Details →
                </Link>
              </article>
            ))}
          </div>
        )}

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs leading-6 text-gray-500">
          © Capital360IPO. Informational purposes only.
          Verify IPO information with official exchange and issuer documents.
          GMP is unofficial and speculative.
        </div>
      </section>
    </main>
  );
}
