
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Promoter = {
  id: string;
  promoter_name: string;
  designation: string | null;
  shareholding_pre_ipo: number | string | null;
  shareholding_post_ipo: number | string | null;
  profile_description: string | null;
  source_name: string | null;
  source_url: string | null;
  verified_at: string | null;
};

type RiskFactor = {
  id: string;
  risk_category: string;
  risk_title: string;
  risk_description: string;
  severity: "High" | "Medium" | "Low" | null;
  source_name: string | null;
  source_url: string | null;
  verified_at: string | null;
};

function safeUrl(value: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function formatHolding(value: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "Not Available";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) return "Not Available";

  return `${number.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}%`;
}

function formatDateTime(value: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SectionHeading({
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

function EmptyState({ title, description }: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-2xl text-emerald-300">
        —
      </div>
      <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-400">
        {description}
      </p>
      <span className="mt-5 inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs font-bold text-amber-300">
        Pending Verification
      </span>
    </div>
  );
}

function SourceLink({
  name,
  url,
}: {
  name: string | null;
  url: string | null;
}) {
  if (!safeUrl(url)) return null;

  return (
    <a
      href={url!}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex text-xs font-bold text-emerald-300 transition hover:text-emerald-200 hover:underline"
    >
      {name || "View Source"} ↗
    </a>
  );
}

export default function IPOResearchSections({ ipoId }: { ipoId: string }) {
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [risks, setRisks] = useState<RiskFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoterError, setPromoterError] = useState("");
  const [riskError, setRiskError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadResearch() {
      setLoading(true);
      setPromoterError("");
      setRiskError("");

      const [promoterResult, riskResult] = await Promise.all([
        supabase
          .from("ipo_promoters")
          .select(
            "id, promoter_name, designation, shareholding_pre_ipo, shareholding_post_ipo, profile_description, source_name, source_url, verified_at"
          )
          .eq("ipo_id", ipoId)
          .eq("is_verified", true)
          .order("promoter_name", { ascending: true }),

        supabase
          .from("ipo_risk_factors")
          .select(
            "id, risk_category, risk_title, risk_description, severity, source_name, source_url, verified_at"
          )
          .eq("ipo_id", ipoId)
          .eq("is_verified", true)
          .order("created_at", { ascending: false }),
      ]);

      if (!active) return;

      if (promoterResult.error) {
        setPromoterError(promoterResult.error.message);
      } else {
        setPromoters((promoterResult.data || []) as Promoter[]);
      }

      if (riskResult.error) {
        setRiskError(riskResult.error.message);
      } else {
        setRisks((riskResult.data || []) as RiskFactor[]);
      }

      setLoading(false);
    }

    if (ipoId) {
      loadResearch();
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [ipoId]);

  const highRiskCount = risks.filter((risk) => risk.severity === "High").length;
  const mediumRiskCount = risks.filter((risk) => risk.severity === "Medium").length;
  const lowRiskCount = risks.filter((risk) => risk.severity === "Low").length;

  return (
    <>
      {/* PROMOTERS */}
      <section className="mt-12" id="ipo-promoters">
        <SectionHeading
          eyebrow="Ownership & Management"
          title="Promoters & Shareholding"
          description="Promoter information, management details and shareholding before and after the IPO, based on verified available records."
        />

        <div className="mt-7 overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-[#101f30] to-[#0c1727] p-5 shadow-xl sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
            <div>
              <h3 className="text-xl font-black text-white">
                Promoter Information
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                Verified ownership and management records
              </p>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-300">
              Verified Records Only
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Loading promoter information...
            </div>
          ) : promoterError ? (
            <div className="py-10 text-center">
              <p className="font-bold text-amber-300">
                Promoter Information Could Not Be Loaded
              </p>
              <p className="mt-2 break-words text-sm text-slate-400">
                {promoterError}
              </p>
            </div>
          ) : promoters.length === 0 ? (
            <div className="pt-6">
              <EmptyState
                title="Promoter Information Not Available"
                description="Verified promoter and shareholding records have not been added for this IPO yet. Information will appear here after verification from official filings."
              />
            </div>
          ) : (
            <>
              <div className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
                {promoters.map((promoter) => (
                  <article
                    key={promoter.id}
                    className="rounded-2xl border border-white/10 bg-[#0a1422]/70 p-5 transition hover:border-emerald-400/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="break-words text-lg font-black text-white">
                          {promoter.promoter_name}
                        </h4>
                        <p className="mt-1 text-sm text-emerald-300">
                          {promoter.designation || "Promoter"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                        Verified
                      </span>
                    </div>

                    {promoter.profile_description && (
                      <p className="mt-4 text-sm leading-6 text-slate-400">
                        {promoter.profile_description}
                      </p>
                    )}

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Pre-IPO Holding
                        </p>
                        <p className="mt-2 break-words text-base font-black text-white">
                          {formatHolding(promoter.shareholding_pre_ipo)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Post-IPO Holding
                        </p>
                        <p className="mt-2 break-words text-base font-black text-emerald-300">
                          {formatHolding(promoter.shareholding_post_ipo)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-white/10 pt-4">
                      <SourceLink
                        name={promoter.source_name}
                        url={promoter.source_url}
                      />
                      {promoter.verified_at && (
                        <p className="mt-2 text-[11px] text-slate-500">
                          Verified: {formatDateTime(promoter.verified_at)}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <p className="mt-6 border-t border-white/10 pt-4 text-xs text-slate-500">
                {promoters.length} verified promoter record(s) available.
              </p>
            </>
          )}
        </div>
      </section>

      {/* RISK FACTORS */}
      <section className="mt-12" id="ipo-risk-factors">
        <SectionHeading
          eyebrow="Investor Risk Review"
          title="IPO Risk Factors"
          description="Important business, financial, operational and other risks disclosed in available verified IPO documents."
        />

        <div className="mt-7 overflow-hidden rounded-3xl border border-white/10 bg-[#101a2b] p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
            <div>
              <h3 className="text-xl font-black text-white">
                Disclosed Risk Factors
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                Risk information based on verified records
              </p>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-300">
              Verified Records Only
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Loading risk factors...
            </div>
          ) : riskError ? (
            <div className="py-10 text-center">
              <p className="font-bold text-amber-300">
                Risk Factors Could Not Be Loaded
              </p>
              <p className="mt-2 break-words text-sm text-slate-400">
                {riskError}
              </p>
            </div>
          ) : risks.length === 0 ? (
            <div className="pt-6">
              <EmptyState
                title="Risk Information Not Available"
                description="Verified risk factors have not been added for this IPO yet. Risk disclosures will appear here after checking official offer documents."
              />
            </div>
          ) : (
            <>
              <div className="grid gap-3 pt-6 sm:grid-cols-3">
                <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-red-300">
                    High Risk
                  </p>
                  <p className="mt-2 text-2xl font-black text-red-300">
                    {highRiskCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Medium Risk
                  </p>
                  <p className="mt-2 text-2xl font-black text-amber-300">
                    {mediumRiskCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    Low Risk
                  </p>
                  <p className="mt-2 text-2xl font-black text-emerald-300">
                    {lowRiskCount}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {risks.map((risk) => {
                  const severityClass =
                    risk.severity === "High"
                      ? "border-red-400/20 bg-red-400/10 text-red-300"
                      : risk.severity === "Medium"
                        ? "border-amber-400/20 bg-amber-400/10 text-amber-300"
                        : risk.severity === "Low"
                          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                          : "border-white/10 bg-white/[0.04] text-slate-300";

                  return (
                    <article
                      key={risk.id}
                      className="rounded-2xl border border-white/10 bg-[#0a1422]/70 p-5 transition hover:border-white/20"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                          {risk.risk_category}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${severityClass}`}>
                          {risk.severity || "Severity Not Classified"}
                        </span>
                      </div>

                      <h4 className="mt-4 text-base font-black text-white">
                        {risk.risk_title}
                      </h4>

                      <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-400">
                        {risk.risk_description}
                      </p>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                        <SourceLink
                          name={risk.source_name}
                          url={risk.source_url}
                        />
                        {risk.verified_at && (
                          <p className="text-[11px] text-slate-500">
                            Verified: {formatDateTime(risk.verified_at)}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              <p className="mt-6 border-t border-white/10 pt-4 text-xs text-slate-500">
                {risks.length} verified risk factor(s) available.
              </p>
            </>
          )}
        </div>

        <p className="mt-3 text-xs leading-6 text-slate-500">
          Risk severity is an informational classification and not an investment
          recommendation. Investors should read the complete official DRHP/RHP
          and assess their own risk tolerance.
        </p>
      </section>
    </>
  );
}
