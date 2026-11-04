
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type IPO = {
  id: string;
  company_name: string;
  price_band: string | null;
  open_date: string | null;
  close_date: string | null;
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

  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
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
      try {
        if (!id) throw new Error("IPO ID URL में नहीं मिली।");

        const { data, error } = await supabase
          .from("ipo_master")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("इस ID से IPO रिकॉर्ड नहीं मिला।");

        setIpo(data as IPO);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "IPO जानकारी लोड नहीं हो पाई।"
        );
      } finally {
        setLoading(false);
      }
    }

    fetchIPO();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07111f] text-white flex items-center justify-center">
        Loading IPO Details...
      </main>
    );
  }

  if (error || !ipo) {
    return (
      <main className="min-h-screen bg-[#07111f] text-white flex flex-col items-center justify-center px-5 text-center">
        <h1 className="text-3xl font-bold">IPO Details Not Available</h1>
        <p className="mt-3 text-gray-400">{error}</p>
        <Link
          href="/ipos"
          className="mt-6 rounded-xl bg-teal-400 px-6 py-3 font-bold text-black"
        >
          ← सभी IPO देखें
        </Link>
      </main>
    );
  }

  const sections = [
    "GMP History",
    "Subscription Details",
    "Company Profile",
    "Financial Performance",
    "Promoters & Risks",
    "Allotment & Listing",
    "Official Documents",
    "Frequently Asked Questions",
  ];

  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link href="/ipos" className="text-sm text-teal-400">
          ← Back to All IPOs
        </Link>

        <section className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-br from-[#14283b] to-[#0b1726] p-6 sm:p-10">
          <span className="rounded-full bg-teal-400/15 px-4 py-2 text-sm font-semibold text-teal-300">
            {ipo.status?.replaceAll("'", "") || "IPO"}
          </span>

          <h1 className="mt-6 text-3xl font-bold sm:text-5xl">
            {ipo.company_name}
          </h1>

          <p className="mt-3 text-gray-400">
            Complete IPO information by Capital360IPO
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Price Band", ipo.price_band || "Not announced"],
              ["Opening Date", formatDate(ipo.open_date)],
              ["Closing Date", formatDate(ipo.close_date)],
              ["Listing Date", formatDate(ipo.listing_date)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm text-gray-400">{label}</p>
                <p className="mt-2 text-xl font-bold text-teal-300">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#101e2e] p-6">
          <h2 className="text-2xl font-bold">IPO Overview</h2>
          <p className="mt-4 leading-7 text-gray-300">
            {ipo.company_name} IPO की उपलब्ध जानकारी और महत्वपूर्ण तारीखें
            यहाँ दिखाई गई हैं। अतिरिक्त सत्यापित जानकारी डेटाबेस में जोड़ी जाएगी।
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#101e2e] p-6">
          <h2 className="text-2xl font-bold">More IPO Information</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => (
              <div key={section} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="font-semibold">{section}</h3>
                <p className="mt-2 text-sm text-gray-400">
                  Verified information will be displayed here after database integration.
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-amber-300">
            GMP is unofficial and speculative. Verify IPO information with official documents.
          </p>
        </section>

        <footer className="mt-10 border-t border-white/10 py-6 text-center text-sm text-gray-500">
          © Capital360IPO — Informational purposes only.
        </footer>
      </div>
    </main>
  );
}
