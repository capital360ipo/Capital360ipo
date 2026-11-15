"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import SiteHeader from "@/components/SiteHeader";
import IPOResearchSections from "@/components/IPOResearchSections";

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

type Subscription = {
  id: string;
  ipo_id: string;
  subscription_date: string;
  qib_subscription: number | string | null;
  nii_subscription: number | string | null;
  retail_subscription: number | string | null;
  total_subscription: number | string | null;
  source_name: string | null;
  source_url: string | null;
  updated_at: string;
};

type CompanyProfile = {
  id: string;
  ipo_id: string;
  company_description: string | null;
  industry: string | null;
  sector: string | null;
  business_model: string | null;
  products_services: string | null;
  headquarters: string | null;
  website_url: string | null;
  incorporation_year: number | null;
  source_name: string | null;
  source_url: string | null;
  updated_at: string;
};

type FinancialRecord = {
  id: string;
  ipo_id: string;
  financial_year: string;
  revenue: number | string | null;
  ebitda: number | string | null;
  profit_after_tax: number | string | null;
  total_assets: number | string | null;
  net_worth: number | string | null;
  total_borrowings: number | string | null;
  source_name: string | null;
  source_url: string | null;
  is_verified: boolean;
  verified_at: string | null;
  updated_at: string;
};

type IPODocument = {
  id: string;
  ipo_id: string;
  document_type: string;
  title: string;
  document_url: string;
  source_name: string | null;
  source_url: string | null;
  filed_date: string | null;
  is_verified: boolean;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

function isSafeExternalUrl(value: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

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

function formatDateTime(date: string | null) {
  if (!date) return "Not Available";

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

function formatSubscription(value: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "Not Available";
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return "Not Available";

  return `${parsed.toFixed(2)}x`;
}

function formatFinancial(value: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "Not Available";
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return "Not Available";

  return `₹${parsed.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })} Cr`;
}

function getFinancialNumber(value: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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

function ProfileItem({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="border-b border-white/[0.07] py-4 last:border-0">
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
        {label}
      </p>
      <p className="mt-2 break-words text-sm leading-7 text-slate-200">
        {value || "Not Available"}
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
  const [subscriptionHistory, setSubscriptionHistory] = useState<Subscription[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [financialHistory, setFinancialHistory] = useState<FinancialRecord[]>([]);
  const [ipoDocuments, setIpoDocuments] = useState<IPODocument[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [gmpError, setGmpError] = useState("");
  const [subscriptionError, setSubscriptionError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [financialError, setFinancialError] = useState("");
  const [documentsError, setDocumentsError] = useState("");

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

        const { data: subscriptionData, error: subscriptionFetchError } =
          await supabase
            .from("ipo_subscription")
            .select(
              "id, ipo_id, subscription_date, qib_subscription, nii_subscription, retail_subscription, total_subscription, source_name, source_url, updated_at"
            )
            .eq("ipo_id", id)
            .order("subscription_date", { ascending: false });

        if (subscriptionFetchError) {
          if (active) setSubscriptionError(subscriptionFetchError.message);
        } else if (active) {
          setSubscriptionHistory((subscriptionData || []) as Subscription[]);
        }

        const { data: profileData, error: profileFetchError } = await supabase
          .from("ipo_company_profile")
          .select(
            "id, ipo_id, company_description, industry, sector, business_model, products_services, headquarters, website_url, incorporation_year, source_name, source_url, updated_at"
          )
          .eq("ipo_id", id)
          .maybeSingle();

        if (profileFetchError) {
          if (active) setProfileError(profileFetchError.message);
        } else if (active) {
          setCompanyProfile(profileData as CompanyProfile | null);
        }

        const { data: financialData, error: financialFetchError } =
          await supabase
            .from("ipo_financials")
            .select(
              "id, ipo_id, financial_year, revenue, ebitda, profit_after_tax, total_assets, net_worth, total_borrowings, source_name, source_url, is_verified, verified_at, updated_at"
            )
            .eq("ipo_id", id)
            .eq("is_verified", true)
            .order("financial_year", { ascending: false });

        if (financialFetchError) {
          if (active) setFinancialError(financialFetchError.message);
        } else if (active) {
          setFinancialHistory((financialData || []) as FinancialRecord[]);
        }

        const { data: documentData, error: documentFetchError } =
          await supabase
            .from("ipo_documents")
            .select(
              "id, ipo_id, document_type, title, document_url, source_name, source_url, filed_date, is_verified, verified_at, created_at, updated_at"
            )
            .eq("ipo_id", id)
            .eq("is_verified", true)
            .order("filed_date", { ascending: false });

        if (documentFetchError) {
          if (active) setDocumentsError(documentFetchError.message);
        } else if (active) {
          setIpoDocuments((documentData || []) as IPODocument[]);
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
  const latestGmp = gmpHistory[0];
  const latestSubscription = subscriptionHistory[0];
  const latestFinancial = financialHistory[0];

  const keyDetails = [
    { label: "Price Band", value: ipo.price_band || "Not Available" },
    { label: "Opening Date", value: formatDate(ipo.open_date) },
    { label: "Closing Date", value: formatDate(ipo.close_date) },
    { label: "Listing Date", value: formatDate(ipo.listing_date) },
  ];

  const financialMetrics = latestFinancial
    ? [
        { label: "Revenue", value: formatFinancial(latestFinancial.revenue) },
        { label: "Profit After Tax (PAT)", value: formatFinancial(latestFinancial.profit_after_tax) },
        { label: "EBITDA", value: formatFinancial(latestFinancial.ebitda) },
        { label: "Total Assets", value: formatFinancial(latestFinancial.total_assets) },
        { label: "Net Worth", value: formatFinancial(latestFinancial.net_worth) },
        { label: "Total Borrowings", value: formatFinancial(latestFinancial.total_borrowings) },
      ]
    : [];

  const chartMax = Math.max(
    1,
    ...financialHistory.flatMap((item) => [
      getFinancialNumber(item.revenue),
      getFinancialNumber(item.profit_after_tax),
      getFinancialNumber(item.total_assets),
    ])
  );

  const researchSections = [
    {
      number: "05",
      title: "Allotment & Listing",
      subtitle: "IPO Timeline",
      description: "Allotment, refund, demat credit and listing information.",
    },
    {
      number: "06",
      title: "Frequently Asked Questions",
      subtitle: "IPO FAQs",
      description: "Important questions and verified answers about this IPO.",
    },
  ];

  const documentTypes = [
    "DRHP",
    "RHP",
    "Prospectus",
    "Addendum",
    "Other",
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
                <InfoCard key={item.label} label={item.label} value={item.value} />
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
            <InfoCard label="Company Name" value={ipo.company_name || "Not Available"} />
            <InfoCard label="Current Status" value={status} />
            <InfoCard label="Price Band" value={ipo.price_band || "Not Available"} />
            <InfoCard label="IPO Record Created" value={formatDate(ipo.created_at)} />
          </div>
        </section>

        {/* COMPANY PROFILE */}
        <section className="mt-10">
          <SectionTitle
            eyebrow="Company Research"
            title="Company Profile"
            description="Learn about the company behind this IPO through available company information and official sources."
          />

          <div className="mt-7 overflow-hidden rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-[#101f30] to-[#0c1727] p-6 shadow-xl sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <h3 className="text-xl font-black text-white">
                  {ipo.company_name}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Business Overview & Company Information
                </p>
              </div>

              {isSafeExternalUrl(companyProfile?.source_url || null) && (
                <a
                  href={companyProfile!.source_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-emerald-400/40 px-4 py-2 text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/10"
                >
                  {companyProfile?.source_name || "View Official Source"} ↗
                </a>
              )}
            </div>

            {profileError ? (
              <div className="py-8">
                <p className="font-bold text-amber-300">
                  Company Profile Could Not Be Loaded
                </p>
                <p className="mt-2 break-words text-sm text-slate-400">
                  {profileError}
                </p>
              </div>
            ) : !companyProfile ? (
              <div className="py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-2xl">
                  —
                </div>
                <h3 className="mt-5 text-lg font-bold text-white">
                  Company Information Not Available
                </h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-slate-400">
                  Verified company information has not been added for this IPO yet.
                  The profile will appear here when information is available.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-8 pt-5 md:grid-cols-2">
                  <div>
                    <ProfileItem label="Company Overview" value={companyProfile.company_description} />
                    <ProfileItem label="Industry" value={companyProfile.industry} />
                    <ProfileItem label="Sector" value={companyProfile.sector} />
                    <ProfileItem label="Business Model" value={companyProfile.business_model} />
                  </div>

                  <div>
                    <ProfileItem label="Products & Services" value={companyProfile.products_services} />
                    <ProfileItem label="Headquarters" value={companyProfile.headquarters} />
                    <ProfileItem
                      label="Incorporation Year"
                      value={
                        companyProfile.incorporation_year
                          ? String(companyProfile.incorporation_year)
                          : null
                      }
                    />
                    <div className="border-b border-white/[0.07] py-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Official Website
                      </p>
                      {isSafeExternalUrl(companyProfile.website_url) ? (
                        <a
                          href={companyProfile.website_url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block break-all text-sm font-semibold text-emerald-300 hover:underline"
                        >
                          {companyProfile.website_url}
                        </a>
                      ) : (
                        <p className="mt-2 text-sm text-slate-400">
                          Not Available
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="text-xs text-slate-500">
                    Last Updated: {formatDateTime(companyProfile.updated_at)}
                  </p>
                </div>
              </>
            )}
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
                  {latestGmp ? formatDateTime(latestGmp.updated_at) : "Not Available"}
                </p>
              </div>
            </div>

            {gmpError ? (
              <p className="p-6 text-sm text-amber-300">
                GMP history could not be loaded: {gmpError}
              </p>
            ) : gmpHistory.length === 0 ? (
              <div className="p-8 text-center">
                <p className="font-bold text-white">GMP Data Not Available</p>
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
                      <tr key={item.id} className="border-t border-white/10">
                        <td className="px-5 py-4 font-bold text-emerald-300">
                          {item.gmp !== null ? `₹${item.gmp}` : "Not Available"}
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

        {/* SUBSCRIPTION HISTORY */}
        <section className="mt-10">
          <SectionTitle
            eyebrow="Investor Demand"
            title="IPO Subscription Details"
            description="Day-wise QIB, NII, Retail and total subscription figures from available records."
          />

          <div className="mt-7 overflow-hidden rounded-3xl border border-white/10 bg-[#101a2b]">
            {subscriptionError ? (
              <div className="p-8 text-center">
                <p className="font-bold text-amber-300">
                  Subscription Data Could Not Be Loaded
                </p>
                <p className="mt-2 break-words text-sm text-slate-400">
                  {subscriptionError}
                </p>
              </div>
            ) : subscriptionHistory.length === 0 ? (
              <div className="p-8 text-center sm:p-10">
                <h3 className="text-lg font-bold text-white">
                  Subscription Data Not Available
                </h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-slate-400">
                  No verified subscription records have been added for this IPO yet.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 border-b border-white/10 p-5 sm:grid-cols-4">
                  <InfoCard label="Latest Subscription" value={formatSubscription(latestSubscription.total_subscription)} />
                  <InfoCard label="QIB" value={formatSubscription(latestSubscription.qib_subscription)} />
                  <InfoCard label="NII" value={formatSubscription(latestSubscription.nii_subscription)} />
                  <InfoCard label="Retail" value={formatSubscription(latestSubscription.retail_subscription)} />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-4">Date</th>
                        <th className="px-5 py-4">QIB</th>
                        <th className="px-5 py-4">NII</th>
                        <th className="px-5 py-4">Retail</th>
                        <th className="px-5 py-4">Total</th>
                        <th className="px-5 py-4">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptionHistory.map((item) => (
                        <tr key={item.id} className="border-t border-white/10">
                          <td className="whitespace-nowrap px-5 py-4 font-semibold text-white">
                            {formatDate(item.subscription_date)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">{formatSubscription(item.qib_subscription)}</td>
                          <td className="px-5 py-4 text-slate-300">{formatSubscription(item.nii_subscription)}</td>
                          <td className="px-5 py-4 text-slate-300">{formatSubscription(item.retail_subscription)}</td>
                          <td className="px-5 py-4 font-bold text-emerald-300">{formatSubscription(item.total_subscription)}</td>
                          <td className="px-5 py-4 text-slate-300">
                            {isSafeExternalUrl(item.source_url) ? (
                              <a
                                href={item.source_url!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-emerald-400 hover:text-emerald-300"
                              >
                                {item.source_name || "View Source"}
                              </a>
                            ) : (
                              item.source_name || "Not Available"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-white/10 px-5 py-4">
                  <p className="text-xs text-slate-500">
                    {subscriptionHistory.length} subscription record(s) available.
                    Latest record update: {formatDateTime(latestSubscription.updated_at)}.
                  </p>
                </div>
              </>
            )}
          </div>

          <p className="mt-3 text-xs leading-6 text-slate-500">
            Subscription figures are shown as reported by their respective sources.
            Figures may change during the IPO bidding period.
          </p>
        </section>

        {/* FINANCIAL PERFORMANCE */}
        <section className="mt-12" id="financial-performance">
          <SectionTitle
            eyebrow="Financial Analysis"
            title="Financial Performance"
            description="Revenue, profit, assets and other financial metrics based on verified financial records."
          />

          <div className="mt-7 overflow-hidden rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-[#101f30] to-[#0c1727] p-5 shadow-xl sm:p-8">
            {financialError ? (
              <div className="py-8 text-center">
                <h3 className="font-bold text-amber-300">
                  Financial Data Could Not Be Loaded
                </h3>
                <p className="mt-2 break-words text-sm text-slate-400">
                  {financialError}
                </p>
              </div>
            ) : financialHistory.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-2xl text-emerald-300">
                  ₹
                </div>
                <h3 className="mt-5 text-lg font-bold text-white">
                  Financial Information Not Available
                </h3>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-400">
                  Verified financial records have not been added for this IPO yet.
                  Financial figures will appear here after verification from official sources.
                </p>
                <span className="mt-5 inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs font-bold text-amber-300">
                  Financial Data Pending Verification
                </span>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
                  <div>
                    <h3 className="text-xl font-black text-white">
                      Key Financial Metrics
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Latest available verified financial year: {latestFinancial.financial_year}
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-300">
                    Verified Records
                  </span>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {financialMetrics.map((metric) => (
                    <InfoCard
                      key={metric.label}
                      label={metric.label}
                      value={metric.value}
                    />
                  ))}
                </div>

                <div className="mt-8 rounded-2xl border border-white/10 bg-[#0a1422]/70 p-5">
                  <h3 className="text-lg font-bold text-white">
                    Financial Performance by Year
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Values in ₹ Crore. Only verified records are displayed.
                  </p>

                  <div className="mt-6 space-y-7">
                    {financialHistory.map((item) => {
                      const bars = [
                        {
                          label: "Revenue",
                          value: getFinancialNumber(item.revenue),
                          color: "bg-emerald-400",
                        },
                        {
                          label: "PAT",
                          value: getFinancialNumber(item.profit_after_tax),
                          color: "bg-sky-400",
                        },
                        {
                          label: "Total Assets",
                          value: getFinancialNumber(item.total_assets),
                          color: "bg-orange-400",
                        },
                      ];

                      return (
                        <div key={item.id}>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h4 className="font-bold text-white">
                              {item.financial_year}
                            </h4>
                            <span className="text-xs text-slate-500">
                              ₹ Crore
                            </span>
                          </div>

                          <div className="space-y-3">
                            {bars.map((bar) => (
                              <div key={bar.label}>
                                <div className="mb-1 flex justify-between gap-3 text-xs">
                                  <span className="text-slate-400">{bar.label}</span>
                                  <span className="font-semibold text-slate-200">
                                    {formatFinancial(bar.value)}
                                  </span>
                                </div>
                                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                                  <div
                                    className={`h-full rounded-full ${bar.color}`}
                                    style={{
                                      width: `${bar.value > 0 ? Math.max(1, (bar.value / chartMax) * 100) : 0}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 flex flex-wrap gap-4 border-t border-white/10 pt-5 text-xs text-slate-400">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      Revenue
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                      PAT
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
                      Total Assets
                    </span>
                  </div>
                </div>

                <div className="mt-7 overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-4">Financial Year</th>
                        <th className="px-4 py-4">Revenue</th>
                        <th className="px-4 py-4">EBITDA</th>
                        <th className="px-4 py-4">PAT</th>
                        <th className="px-4 py-4">Total Assets</th>
                        <th className="px-4 py-4">Net Worth</th>
                        <th className="px-4 py-4">Borrowings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financialHistory.map((item) => (
                        <tr key={item.id} className="border-t border-white/10">
                          <td className="whitespace-nowrap px-4 py-4 font-bold text-white">
                            {item.financial_year}
                          </td>
                          <td className="px-4 py-4 text-slate-300">{formatFinancial(item.revenue)}</td>
                          <td className="px-4 py-4 text-slate-300">{formatFinancial(item.ebitda)}</td>
                          <td className="px-4 py-4 text-slate-300">{formatFinancial(item.profit_after_tax)}</td>
                          <td className="px-4 py-4 text-slate-300">{formatFinancial(item.total_assets)}</td>
                          <td className="px-4 py-4 text-slate-300">{formatFinancial(item.net_worth)}</td>
                          <td className="px-4 py-4 text-slate-300">{formatFinancial(item.total_borrowings)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="text-xs text-slate-500">
                    {financialHistory.length} verified financial year record(s) available.
                  </p>
                  {isSafeExternalUrl(latestFinancial.source_url) && (
                    <a
                      href={latestFinancial.source_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block text-sm font-semibold text-emerald-300 hover:underline"
                    >
                      {latestFinancial.source_name || "View Financial Source"} ↗
                    </a>
                  )}
                  {latestFinancial.verified_at && (
                    <p className="mt-2 text-xs text-slate-500">
                      Latest Verification: {formatDateTime(latestFinancial.verified_at)}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <p className="mt-3 text-xs leading-6 text-slate-500">
            Financial figures are presented in ₹ Crore and are subject to verification
            against official company filings, DRHP, RHP and audited financial statements.
          </p>
        </section>

        {/* IPO DOCUMENTS */}
        <section className="mt-12" id="ipo-documents">
          <SectionTitle
            eyebrow="Official Filings"
            title="IPO Documents"
            description="Access official IPO offer documents and regulatory filings, including DRHP, RHP and Prospectus."
          />

          <div className="mt-7 overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-[#101f30] to-[#0c1727] p-5 shadow-xl sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
              <div>
                <h3 className="text-xl font-black text-white">
                  Official Document Library
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  {ipo.company_name}
                </p>
              </div>

              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-300">
                Verified Documents Only
              </span>
            </div>

            {documentsError ? (
              <div className="py-10 text-center">
                <h3 className="font-bold text-amber-300">
                  Documents Could Not Be Loaded
                </h3>
                <p className="mt-2 break-words text-sm text-slate-400">
                  {documentsError}
                </p>
              </div>
            ) : ipoDocuments.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-3xl">
                  📄
                </div>
                <h3 className="mt-5 text-lg font-bold text-white">
                  IPO Documents Not Available
                </h3>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-400">
                  Official documents have not been added or verified for this IPO yet.
                  Documents will appear here after verification from official sources.
                </p>
                <span className="mt-5 inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs font-bold text-amber-300">
                  Documents Pending Verification
                </span>
              </div>
            ) : (
              <>
                <div className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
                  {documentTypes.map((type) => {
                    const count = ipoDocuments.filter(
                      (doc) => doc.document_type === type
                    ).length;

                    return (
                      <div
                        key={type}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          {type}
                        </p>
                        <p className="mt-2 text-2xl font-black text-emerald-300">
                          {count}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Verified document(s)
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-7 space-y-4">
                  {ipoDocuments.map((doc) => (
                    <article
                      key={doc.id}
                      className="rounded-2xl border border-white/10 bg-[#0a1422]/70 p-5 transition hover:border-emerald-400/30"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-xl">
                            📄
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                                {doc.document_type}
                              </span>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                                ✓ Verified
                              </span>
                            </div>

                            <h4 className="mt-3 break-words text-base font-bold text-white">
                              {doc.title}
                            </h4>

                            <p className="mt-2 text-xs text-slate-400">
                              Filing Date: {formatDate(doc.filed_date)}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              Source: {doc.source_name || "Official filing"}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          {isSafeExternalUrl(doc.document_url) ? (
                            <a
                              href={doc.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
                            >
                              View Document ↗
                            </a>
                          ) : (
                            <span className="rounded-xl border border-amber-400/20 px-4 py-3 text-xs font-semibold text-amber-300">
                              Document Link Unavailable
                            </span>
                          )}

                          {isSafeExternalUrl(doc.source_url) && (
                            <a
                              href={doc.source_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-emerald-400/40 hover:text-emerald-300"
                            >
                              Source ↗
                            </a>
                          )}
                        </div>
                      </div>

                      {doc.verified_at && (
                        <p className="mt-4 border-t border-white/10 pt-3 text-[11px] text-slate-500">
                          Verified on: {formatDateTime(doc.verified_at)}
                        </p>
                      )}
                    </article>
                  ))}
                </div>

                <div className="mt-6 border-t border-white/10 pt-4">
                  <p className="text-xs leading-6 text-slate-500">
                    {ipoDocuments.length} verified document(s) available.
                    Always check the issuer and regulatory source before relying on a filing.
                  </p>
                </div>
              </>
            )}
          </div>

          <p className="mt-3 text-xs leading-6 text-slate-500">
            Documents are provided for informational purposes. Capital360IPO
            does not modify official regulatory filings.
          </p>
        </section>

        {/* PROMOTERS & RISK ANALYSIS */}
        <IPOResearchSections ipoId={ipo.id} />

        {/* IMPORTANT DATES */}
        <section className="mt-10">
          <SectionTitle
            eyebrow="IPO Timeline"
            title="Important IPO Dates"
            description="Important dates currently available in the IPO record."
          />
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoCard label="Opening Date" value={formatDate(ipo.open_date)} />
            <InfoCard label="Closing Date" value={formatDate(ipo.close_date)} />
            <InfoCard label="Listing Date" value={formatDate(ipo.listing_date)} />
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
              <ComingSoonCard key={section.number} {...section} />
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
