"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  created_at: string | null;
};

function formatDate(date: string | null) {
  if (!date) return "अभी उपलब्ध नहीं";

  const parsedDate = new Date(date + "T00:00:00");

  if (Number.isNaN(parsedDate.getTime())) {
    return "अभी उपलब्ध नहीं";
  }

  return parsedDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const informationSections = [
  {
    number: "01",
    title: "GMP History",
    subtitle: "Grey Market Premium",
    description:
      "IPO का उपलब्ध GMP डेटा और उसके ऐतिहासिक बदलाव यहाँ दिखाए जाएँगे।",
  },
  {
    number: "02",
    title: "Subscription Details",
    subtitle: "Investor Demand",
    description:
      "Retail, NII और QIB श्रेणियों का सत्यापित subscription डेटा।",
  },
  {
    number: "03",
    title: "Company Profile",
    subtitle: "Business Overview",
    description:
      "कंपनी का व्यवसाय, उद्योग, उत्पाद और संचालन से जुड़ी जानकारी।",
  },
  {
    number: "04",
    title: "Financial Performance",
    subtitle: "Financial Analysis",
    description:
      "Revenue, Profit, Assets और अन्य वित्तीय आँकड़े।",
  },
  {
    number: "05",
    title: "Promoters & Risks",
    subtitle: "Management & Risk Factors",
    description:
      "Promoters, management और offer document में बताए गए जोखिम।",
  },
  {
    number: "06",
    title: "Allotment & Listing",
    subtitle: "IPO Timeline",
    description:
      "Allotment, refund, demat credit और listing से जुड़ी तारीखें।",
  },
  {
    number: "07",
    title: "Official Documents",
    subtitle: "SEBI & Exchange Filings",
    description:
      "DRHP, RHP और अन्य उपलब्ध आधिकारिक दस्तावेज़।",
  },
  {
    number: "08",
    title: "Frequently Asked Questions",
    subtitle: "IPO FAQs",
    description:
      "इस IPO से जुड़े सामान्य सवालों के सत्यापित जवाब।",
  },
];

export default function IPOPage() {
  const params = useParams();
  const id = params.id as string;

  const [ipo, setIpo] = useState<IPO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchIPO() {
      try {
        if (!id) {
          throw new Error("IPO ID URL में नहीं मिली।");
        }

        const { data, error } = await supabase
          .from("ipo_master")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          throw new Error("इस ID से IPO रिकॉर्ड नहीं मिला।");
        }

        setIpo(data as IPO);
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

    fetchIPO();
  }, [id]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080e1b] text-white">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
          <p className="mt-5 text-sm font-semibold text-slate-300">
            Loading IPO Details...
          </p>
        </div>
      </main>
    );
  }

  if (error || !ipo) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#080e1b] px-5 text-center text-white">
        <div className="max-w-lg rounded-3xl border border-white/10 bg-[#111c2e] p-8">
          <h1 className="text-2xl font-black">
            IPO Details Not Available
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            {error || "IPO जानकारी उपलब्ध नहीं है।"}
          </p>

          <Link
            href="/ipos"
            className="mt-6 inline-block rounded-xl bg-emerald-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-emerald-300"
          >
            ← सभी IPO देखें
          </Link>
        </div>
      </main>
    );
  }

  const status = ipo.status?.replaceAll("'", "").trim() || "IPO";

  const keyDetails = [
    {
      label: "Price Band",
      value: ipo.price_band || "Not announced",
    },
    {
      label: "Opening Date",
      value: formatDate(ipo.open_date),
    },
    {
      label: "Closing Date",
      value: formatDate(ipo.close_date),
    },
    {
      label: "Listing Date",
      value: formatDate(ipo.listing_date),
    },
  ];

  return (
    <main className="min-h-screen bg-[#080e1b] text-white">
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <Link
          href="/ipos"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-emerald-400"
        >
          <span>←</span>
          Back to All IPOs
        </Link>

        {/* IPO HERO */}
        <section className="relative mt-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#14243a] via-[#101c2e] to-[#0b1423] p-6 shadow-2xl sm:p-10">

          <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                {status}
              </span>

              <span className="text-xs font-semibold tracking-wider text-slate-500">
                IPO RESEARCH
              </span>
            </div>

            <h1 className="mt-7 break-words text-3xl font-black tracking-tight text-white sm:text-5xl">
              {ipo.company_name.trim()}
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              Complete IPO information, important dates and company research
              by Capital360IPO.
            </p>

            <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {keyDetails.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm transition hover:border-emerald-400/30"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {item.label}
                  </p>

                  <p className="mt-3 break-words text-lg font-extrabold text-emerald-300">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* IPO OVERVIEW */}
        <section className="mt-8 rounded-3xl border border-white/10 bg-[#101a2b] p-6 sm:p-8">

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
                IPO Overview
              </p>

              <h2 className="mt-3 text-2xl font-black text-white">
                About This IPO
              </h2>
            </div>

            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-400">
              Company Research
            </span>
          </div>

          <p className="mt-5 max-w-4xl text-sm leading-8 text-slate-400 sm:text-base">
            {ipo.company_name} IPO की उपलब्ध जानकारी और महत्वपूर्ण तारीखें
            यहाँ दिखाई गई हैं। अतिरिक्त कंपनी जानकारी, वित्तीय आँकड़े और
            आधिकारिक दस्तावेज़ सत्यापित स्रोतों से उपलब्ध होने पर जोड़े जाएँगे।
          </p>
        </section>

        {/* INFORMATION SECTIONS */}
        <section className="mt-10">

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
              Research & Intelligence
            </p>

            <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">
              Complete IPO Analysis
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              IPO से संबंधित सभी महत्वपूर्ण जानकारियाँ अलग-अलग sections में
              व्यवस्थित रूप से उपलब्ध कराई जाएँगी।
            </p>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {informationSections.map((section) => (
              <div
                key={section.number}
                className="group rounded-2xl border border-white/10 bg-[#101a2b] p-5 transition duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:bg-[#142238]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-emerald-400/60">
                    {section.number}
                  </span>

                  <span className="text-xl text-slate-600 transition group-hover:text-emerald-400">
                    ↗
                  </span>
                </div>

                <h3 className="mt-5 text-base font-bold text-white">
                  {section.title}
                </h3>

                <p className="mt-2 text-xs font-semibold text-emerald-400">
                  {section.subtitle}
                </p>

                <p className="mt-4 text-sm leading-6 text-slate-400">
                  {section.description}
                </p>

                <div className="mt-5 border-t border-white/10 pt-4">
                  <span className="text-xs font-semibold text-slate-500">
                    Information integration planned
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* DISCLAIMER */}
        <section className="mt-10 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 sm:p-6">
          <h3 className="font-bold text-amber-300">
            Important Information & Disclaimer
          </h3>

          <p className="mt-3 text-sm leading-7 text-slate-400">
            GMP अनौपचारिक और अनुमान आधारित होता है। यह आधिकारिक listing price
            या निवेश रिटर्न की गारंटी नहीं है। निवेश से पहले SEBI, NSE, BSE
            और कंपनी के आधिकारिक दस्तावेज़ों से जानकारी सत्यापित करें।
            Capital360IPO केवल सूचनात्मक और शैक्षिक उद्देश्य के लिए जानकारी
            प्रदान करता है।
          </p>
        </section>

        {/* FOOTER */}
        <footer className="mt-12 border-t border-white/10 py-8 text-center">
          <Link href="/" className="text-xl font-black text-white">
            CAPITAL<span className="text-emerald-400">360</span>IPO
          </Link>

          <p className="mt-3 text-xs leading-6 text-slate-500">
            Independent IPO Research & Market Intelligence
          </p>

          <p className="mt-2 text-xs text-slate-600">
            © {new Date().getFullYear()} Capital360IPO. All rights reserved.
          </p>
        </footer>

      </div>
    </main>
  );
}
