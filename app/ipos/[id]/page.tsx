
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
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">
        Loading IPO Details...
      </main>
    );
  }

  if (error || !ipo) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-5 text-center text-slate-900">
        <h1 className="text-3xl font-bold">IPO Details Not Available</h1>
        <p className="mt-3 text-slate-500">{error}</p>
        <Link
          href="/ipos"
          className="mt-6 rounded-xl bg-slate-900 px-6 py-3 font-bold text-white hover:bg-teal-700"
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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-2xl font-black text-slate-900">
            Capital<span className="text-teal-600">360</span>IPO
          </Link>
          <Link
            href="/ipos"
            className="text-sm font-semibold text-slate-600 hover:text-teal-700"
          >
            ← All IPOs
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link
          href="/ipos"
          className="text-sm font-semibold text-teal-700 hover:text-teal-900"
        >
          ← Back to All IPOs
        </Link>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <span className="inline-block rounded-full bg-teal-50 px-4 py-2 text-sm font-bold text-teal-700">
            {ipo.status?.replaceAll("'", "").trim() || "IPO"}
          </span>

          <h1 className="mt-6 text-3xl font-black text-slate-900 sm:text-5xl">
            {ipo.company_name.trim()}
          </h1>

          <p className="mt-3 text-slate-500">
            Complete IPO information by Capital360IPO
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Price Band", ipo.price_band || "Not announced"],
              ["Opening Date", formatDate(ipo.open_date)],
              ["Closing Date", formatDate(ipo.close_date)],
              ["Listing Date", formatDate(ipo.listing_date)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
              >
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 break-words text-lg font-extrabold text-teal-700">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-teal-700">
            IPO Overview
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">
            About This IPO
          </h2>
          <p className="mt-4 leading-7 text-slate-600">
            {ipo.company_name} IPO की उपलब्ध जानकारी और महत्वपूर्ण तारीखें
            यहाँ दिखाई गई हैं। अतिरिक्त सत्यापित जानकारी डेटाबेस में जोड़ी जाएगी।
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-bold uppercase tracking-widest text-teal-700">
            Explore More
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">
            More IPO Information
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => (
              <div
                key={section}
                className="rounded-xl border border-slate-200 bg-slate-50 p-5 transition hover:border-teal-300 hover:bg-teal-50/50"
              >
                <h3 className="font-bold text-slate-800">{section}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Verified information will be displayed here after database integration.
                </p>
              </div>
            ))}
          </div>

          <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            GMP is unofficial and speculative. Verify IPO information with official documents.
          </p>
        </section>

        <footer className="mt-10 border-t border-slate-200 py-6 text-center text-sm text-slate-500">
          © Capital360IPO — Informational purposes only.
        </footer>
      </div>
    </main>
  );
}
