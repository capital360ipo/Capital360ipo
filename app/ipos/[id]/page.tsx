
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

type GMP = {
  id: string;
  ipo_id: string;
  gmp: number | string | null;
  source: string | null;
  updated_at: string;
};

function formatDate(date: string | null) {
  if (!date) return "Not Available";

  const parsed = new Date(date + "T00:00:00");

  if (Number.isNaN(parsed.getTime())) return "Not Available";

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(date: string) {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "Not Available";

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
        {description}
      </p>
    </div>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-emerald-400/30">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-3 break-words text-lg font-extrabold text-emerald-300">
        {value}
      </p>
    </div>
  );
}

function ComingSoonCard({
  number,
  title,
  subtitle,
  description,
}: {
  number: string;
  title: string;
  subtitle: string;
  description: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#101a2b] p-5 transition hover:-translate-y-1 hover:border-emerald-400/30">
      <div className="flex items-center justify-between">
        <span className="text-2xl font-black text-emerald-400/60">
          {number}
        </span>
        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Data Pending
        </span>
      </div>

      <h3 className="mt-5 text-base font-bold text-white">{title}</h3>
      <p className="mt-2 text-xs font-semibold text-emerald-400">
        {subtitle}
      </p>
      <p className="mt-4 text-sm leading-6 text-slate-400">
        {description}
      </p>
      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-xs font-semibold text-slate-500">
          Information will appear when verified data is available.
        </p>
      </div>
    </article>
  );
}

export default function IPOPage() {
  const params = useParams();
  const id = params.id as string;

  const [ipo, setIpo] = useState<IPO | null>(null);
  const [gmpHistory, setGmpHistory] = useState<GMP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [gmpError, setGmpError] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchIPO() {
      try {
        if (!id) {
          throw new Error("IPO ID was not found in the URL.");
        }

        const { data, error } = await supabase
          .from("ipo_master")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          throw new Error("No IPO record was found for this ID.");
        }

        if (!active) return;
        setIpo(data as IPO);

        const { data: gmpData, error: historyError } = await supabase
          .from("ipo_gmp")
          .select("id, ipo_id, gmp, source, updated_at")
          .eq("ipo_id", id)
          .order("updated_at", { ascending: false });

        if (historyError) {
          if (active) setGmpError(historyError.message);
        } else if (active) {
          setGmpHistory((gmpData || []) as GMP[]);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load IPO information."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchIPO();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#080e1b] text-white">
        <SiteHeader />
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
            <p className="mt-5 text-sm font-semibold text-slate-300">
              Loading IPO Details...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !ipo) {
    return (
      <main className="min-h-screen bg-[#080e1b] text-white">
        <SiteHeader />
        <div className="flex min-h-[70vh] items-center justify-center px-5">
          <div className="max-w-lg rounded-3xl border border-white/10 bg-[#111c2e] p-8 text-center">
            <h1 className="text-2xl font-black">
              IPO Details Not Available
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {error || "IPO information is currently unavailable."}
            </p>
            <Link
              href="/ipos"
              className="mt-6 inline-block rounded-xl bg-emerald-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-emerald-300"
            >
              Back to All IPOs
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const status = ipo.status?.trim() || "IPO";

  const keyDetails = [
    { label: "Price Band", value: ipo.price_band || "Not Available" },
    { label: "Opening Date", value: formatDate(ipo.open_date) },
    { label: "Closing Date", value: formatDate(ipo.close_date) },
    { label: "Listing Date", value: formatDate(ipo.listing_date) },
  ];

  const latestGmp = gmpHistory[0];

  const researchSections = [
    {
      number: "02",
      title: "Subscription Details",
      subtitle: "Investor Demand",
      description:
        "Verified QIB, NII and Retail subscription information.",
    },
    {
      number: "03",
      title: "Company Profile",
      subtitle: "Business Overview",
      description:
        "Business model, industry, products and company operations.",
    },
    {
      number: "04",
      title: "Financial Performance",
      subtitle: "Financial Analysis",
      description:
        "Revenue, profit, assets and other verified financial information.",
    },
    {
      number: "05",
      title: "Promoters & Risks",
      subtitle: "Management & Risk Factors",
      description:
        "Promoter details, management information and disclosed risks.",
    },
    {
      number: "06",
      title: "Allotment & Listing",
      subtitle: "IPO Timeline",
      description:
        "Allotment, refund, demat credit and listing information.",
    },
    {
      number: "07",
      title: "Official Documents",
      subtitle: "SEBI & Exchange Filings",
      description:
        "DRHP, RHP and other available official documents.",
    },
    {
      number: "08",
      title: "Frequently Asked Questions",
      subtitle: "IPO FAQs",
      description:
        "Important questions and verified answers about this IPO.",
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
              {ipo.company_name?.trim() || "IPO"}
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              IPO information, important dates, grey market premium history
              and company research by Capital360IPO.
            </p>

            <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {keyDetails.map((item) => (
                <InfoCard
                  key={item.label}
                  label={item.label}
                  value={item.value}
                />
              ))}
            </div>
          </div>
        </section>

        {/* IPO OVERVIEW */}
        <section className="mt-8 rounded-3xl border border-white/10 bg-[#101a2b] p-6 sm:p-8">
          <SectionTitle
            eyebrow="IPO Overview"
            title="About This IPO"
            description="Key information available in the Capital360IPO database."
          />

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoCard
              label="Company Name"
              value={ipo.company_name || "Not Available"}
            />
            <InfoCard
              label="Current Status"
              value={status}
            />
            <InfoCard
              label="Price Band"
              value={ipo.price_band || "Not Available"}
            />
            <InfoCard
              label="IPO Record Created"
              value={formatDate(ipo.created_at)}
            />
          </div>
        </section>

        {/* GMP HISTORY */}
        <section className="mt-10">
          <SectionTitle
            eyebrow="Grey Market Premium"
            title="GMP History"
            description="Available GMP records for this IPO, ordered by the latest update."
          />

          <div className="mt-7 overflow-hidden rounded-3xl border border-white/10 bg-[#101a2b]">
            <div className="grid grid-cols-2 gap-4 border-b border-white/10 p-5 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Latest GMP
                </p>
                <p className="mt-2 text-2xl font-black text-emerald-300">
                  {latestGmp?.gmp !== null && latestGmp?.gmp !== undefined
                    ? `₹${latestGmp.gmp}`
                    : "Not Available"}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Records Available
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  {gmpHistory.length}
                </p>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Latest Update
                </p>
                <p className="mt-2 text-sm font-bold text-white">
                  {latestGmp
                    ? formatDateTime(latestGmp.updated_at)
                    : "Not Available"}
                </p>
              </div>
            </div>

            {gmpError ? (
              <p className="p-6 text-sm text-amber-300">
                GMP history could not be loaded: {gmpError}
              </p>
            ) : gmpHistory.length === 0 ? (
              <div className="p-8 text-center">
                <p className="font-bold text-white">
                  GMP Data Not Available
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  No GMP records have been added for this IPO yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-4">GMP</th>
                      <th className="px-5 py-4">Source</th>
                      <th className="px-5 py-4">Updated At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gmpHistory.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-white/10"
                      >
                        <td className="px-5 py-4 font-bold text-emerald-300">
                          {item.gmp !== null
                            ? `₹${item.gmp}`
                            : "Not Available"}
                        </td>
                        <td className="px-5 py-4 text-slate-300">
                          {item.source || "Not Available"}
                        </td>
                        <td className="px-5 py-4 text-slate-400">
                          {formatDateTime(item.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="mt-3 text-xs leading-6 text-slate-500">
            GMP is unofficial and speculative. It is not an official exchange
            price or a guarantee of listing performance.
          </p>
        </section>

        {/* IMPORTANT DATES */}
        <section className="mt-10">
          <SectionTitle
            eyebrow="IPO Timeline"
            title="Important IPO Dates"
            description="Important dates currently available in the IPO record."
          />

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoCard
              label="Opening Date"
              value={formatDate(ipo.open_date)}
            />
            <InfoCard
              label="Closing Date"
              value={formatDate(ipo.close_date)}
            />
            <InfoCard
              label="Listing Date"
              value={formatDate(ipo.listing_date)}
            />
          </div>
        </section>

        {/* OTHER RESEARCH SECTIONS */}
        <section className="mt-12">
          <SectionTitle
            eyebrow="Research & Intelligence"
            title="Complete IPO Analysis"
            description="Additional IPO research sections. Verified information will be displayed as the relevant data becomes available."
          />

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {researchSections.map((section) => (
              <ComingSoonCard
                key={section.number}
                {...section}
              />
            ))}
          </div>
        </section>

        {/* DISCLAIMER */}
        <section className="mt-10 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 sm:p-6">
          <h3 className="font-bold text-amber-300">
            Important Information & Disclaimer
          </h3>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            GMP is unofficial and speculative. It does not represent the
            official listing price or guarantee investment returns. Always
            verify IPO information through SEBI, NSE, BSE and the issuer's
            official documents. Capital360IPO provides information for
            educational and informational purposes only.
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
