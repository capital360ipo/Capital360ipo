
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  if (!date) return "अभी उपलब्ध नहीं";

  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function IPOPage() {
  const params = useParams();
  const id = params.id as string;

  const [ipo, setIpo] = useState<IPO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchIPO() {
      if (!id) return;

      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("ipo_master")
        .select("*")
        .eq("uuid", id)
        .single();

      if (error) {
        setError("IPO की जानकारी नहीं मिल पाई। कृपया दोबारा कोशिश करें।");
        setIpo(null);
      } else {
        setIpo(data as IPO);
      }

      setLoading(false);
    }

    fetchIPO();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07111f] text-white flex items-center justify-center">
        <p className="text-lg">IPO Details Loading...</p>
      </main>
    );
  }

  if (error || !ipo) {
    return (
      <main className="min-h-screen bg-[#07111f] text-white flex flex-col items-center justify-center px-5 text-center">
        <h1 className="text-3xl font-bold mb-3">IPO Not Found</h1>
        <p className="text-gray-400">{error || "यह IPO उपलब्ध नहीं है।"}</p>
        <a href="/ipos" className="mt-6 rounded-xl bg-teal-500 px-6 py-3 font-semibold text-black">
          सभी IPO देखें
        </a>
      </main>
    );
  }

  const sections = [
    "IPO Overview",
    "IPO Details & Dates",
    "GMP History",
    "Subscription",
    "Company Profile",
    "Financials",
    "Promoters & Risks",
    "Allotment & Listing",
    "Documents",
    "Frequently Asked Questions",
  ];

  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">

        <a href="/ipos" className="text-sm text-teal-400 hover:text-teal-300">
          ← Back to IPO List
        </a>

        <section className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-br from-[#14283b] to-[#0b1726] p-6 sm:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-teal-400/15 px-4 py-1 text-sm font-semibold text-teal-300">
              {ipo.status || "Status unavailable"}
            </span>
            <span className="text-sm text-gray-400">IPO Details</span>
          </div>

          <h1 className="mt-5 text-3xl font-bold sm:text-5xl">
            {ipo.company_name}
          </h1>

          <p className="mt-3 text-gray-400">
            IPO information, important dates and company details
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-gray-400">Price Band</p>
              <p className="mt-2 text-xl font-bold">
                {ipo.price_band || "Not available"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-gray-400">Opening Date</p>
              <p className="mt-2 text-xl font-bold">
                {formatDate(ipo.open_date)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-gray-400">Listing Date</p>
              <p className="mt-2 text-xl font-bold">
                {formatDate(ipo.listing_date)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#101e2e] p-6">
            <h2 className="text-xl font-bold">IPO Details & Dates</h2>
            <div className="mt-5 space-y-4">
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                <span className="text-gray-400">Company</span>
                <span className="text-right font-medium">{ipo.company_name}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                <span className="text-gray-400">Price Band</span>
                <span className="text-right font-medium">{ipo.price_band || "Not available"}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                <span className="text-gray-400">Opening Date</span>
                <span className="text-right font-medium">{formatDate(ipo.open_date)}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-white/10 pb-3">
                <span className="text-gray-400">Closing Date</span>
                <span className="text-right font-medium">{formatDate(ipo.closing_date)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Listing Date</span>
                <span className="text-right font-medium">{formatDate(ipo.listing_date)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#101e2e] p-6">
            <h2 className="text-xl font-bold">More IPO Information</h2>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              GMP, subscription, company financials, promoter details and
              official documents will appear here when verified data is added
              to the database.
            </p>
            <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <p className="text-sm font-semibold text-amber-300">
                Data verification
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Unverified information will not be presented as confirmed data.
                GMP is an unofficial market estimate.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#101e2e] p-6">
          <h2 className="text-xl font-bold">IPO Information Sections</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => (
              <div
                key={section}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <p className="font-medium">{section}</p>
                <p className="mt-2 text-xs text-gray-500">
                  Detailed data will be added after database integration.
                </p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-10 border-t border-white/10 py-6 text-center text-sm text-gray-500">
          © Capital360IPO — Informational purposes only. Verify IPO details
          with official exchange and issuer documents.
        </footer>
      </div>
    </main>
  );
}
