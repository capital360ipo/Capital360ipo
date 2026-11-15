
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import SiteHeader from "@/components/SiteHeader";

type IPO = {
  id: string;
  company_name: string;
  ipo_type?: string | null;
};

type Role = "owner" | "admin" | "editor" | "viewer";

type Tab =
  | "company"
  | "financials"
  | "documents"
  | "promoters"
  | "risks"
  | "subscription";

type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

const tabs: { id: Tab; label: string }[] = [
  { id: "company", label: "Company Profile" },
  { id: "financials", label: "Financials" },
  { id: "documents", label: "IPO Documents" },
  { id: "promoters", label: "Promoters" },
  { id: "risks", label: "Risk Factors" },
  { id: "subscription", label: "Subscription" },
];

const fields: Record<Tab, Field[]> = {
  company: [
    { name: "company_description", label: "Company Description", type: "textarea" },
    { name: "industry", label: "Industry" },
    { name: "sector", label: "Sector" },
    { name: "business_model", label: "Business Model", type: "textarea" },
    { name: "products_services", label: "Products & Services", type: "textarea" },
    { name: "headquarters", label: "Headquarters" },
    { name: "website_url", label: "Official Website URL", type: "url" },
    { name: "incorporation_year", label: "Incorporation Year", type: "number" },
    { name: "source_name", label: "Source Name" },
    { name: "source_url", label: "Source URL", type: "url" },
  ],
  financials: [
    { name: "financial_year", label: "Financial Year", required: true, placeholder: "FY 2025-26" },
    { name: "revenue", label: "Revenue (₹ Crore)", type: "number" },
    { name: "ebitda", label: "EBITDA (₹ Crore)", type: "number" },
    { name: "profit_after_tax", label: "Profit After Tax (₹ Crore)", type: "number" },
    { name: "total_assets", label: "Total Assets (₹ Crore)", type: "number" },
    { name: "net_worth", label: "Net Worth (₹ Crore)", type: "number" },
    { name: "total_borrowings", label: "Total Borrowings (₹ Crore)", type: "number" },
    { name: "source_name", label: "Source Name" },
    { name: "source_url", label: "Source URL", type: "url" },
  ],
  documents: [
    {
      name: "document_type",
      label: "Document Type",
      type: "select",
      required: true,
      options: ["DRHP", "RHP", "Prospectus", "Addendum", "Other"],
    },
    { name: "title", label: "Document Title", required: true },
    { name: "document_url", label: "Document URL", type: "url", required: true },
    { name: "source_name", label: "Source Name" },
    { name: "source_url", label: "Source URL", type: "url" },
    { name: "filed_date", label: "Filing Date", type: "date" },
  ],
  promoters: [
    { name: "promoter_name", label: "Promoter Name", required: true },
    { name: "designation", label: "Designation" },
    { name: "shareholding_pre_ipo", label: "Pre-IPO Shareholding (%)", type: "number" },
    { name: "shareholding_post_ipo", label: "Post-IPO Shareholding (%)", type: "number" },
    { name: "profile_description", label: "Promoter Profile", type: "textarea" },
    { name: "source_name", label: "Source Name" },
    { name: "source_url", label: "Source URL", type: "url" },
  ],
  risks: [
    { name: "risk_category", label: "Risk Category", required: true },
    { name: "risk_title", label: "Risk Title", required: true },
    { name: "risk_description", label: "Risk Description", type: "textarea", required: true },
    {
      name: "severity",
      label: "Severity",
      type: "select",
      options: ["High", "Medium", "Low"],
    },
    { name: "source_name", label: "Source Name" },
    { name: "source_url", label: "Source URL", type: "url" },
  ],
  subscription: [
    { name: "subscription_date", label: "Subscription Date", type: "date", required: true },
    { name: "qib_subscription", label: "QIB Subscription (x)", type: "number" },
    { name: "nii_subscription", label: "NII Subscription (x)", type: "number" },
    { name: "retail_subscription", label: "Retail Subscription (x)", type: "number" },
    { name: "total_subscription", label: "Total Subscription (x)", type: "number" },
    { name: "source_name", label: "Source Name" },
    { name: "source_url", label: "Source URL", type: "url" },
  ],
};

function safeUrl(value: string) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function numberOrNull(value: FormDataEntryValue | null) {
  if (!value || String(value).trim() === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function AdminDashboard() {
  const [userEmail, setUserEmail] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [ipos, setIpos] = useState<IPO[]>([]);
  const [selectedIPO, setSelectedIPO] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("company");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const user = sessionData.session?.user;

      if (!user) {
        setUserEmail("");
        setRole(null);
        setIpos([]);
        return;
      }

      setUserEmail(user.email || "");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      const currentRole = profile?.role as Role | undefined;

      if (
        !currentRole ||
        !["owner", "admin", "editor"].includes(currentRole)
      ) {
        setRole("viewer");
        setIpos([]);
        return;
      }

      setRole(currentRole);

      const { data: ipoData, error: ipoError } = await supabase
        .from("ipo_master")
        .select("id, company_name, ipo_type")
        .order("created_at", { ascending: false });

      if (ipoError) throw ipoError;

      setIpos((ipoData || []) as IPO[]);

      if (ipoData?.length) {
        setSelectedIPO((previous) => previous || ipoData[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load dashboard."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadDashboard();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginLoading(true);
    setError("");

    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (loginError) throw loginError;

      await loadDashboard();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    const { error: logoutError } = await supabase.auth.signOut();

    if (logoutError) {
      setError(logoutError.message);
      return;
    }

    setRole(null);
    setUserEmail("");
    setIpos([]);
    setSelectedIPO("");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!selectedIPO) {
      setError("Please select an IPO first.");
      return;
    }

    if (!role || !["owner", "admin", "editor"].includes(role)) {
      setError("You do not have permission to add research data.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    const values: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      values[key] = String(value).trim();
    }

    const urlFields = ["website_url", "source_url", "document_url"];

    for (const field of urlFields) {
      if (values[field] && !safeUrl(values[field])) {
        setError(`Please enter a valid HTTP or HTTPS URL for ${field}.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      let payload: Record<string, unknown> = {
        ipo_id: selectedIPO,
      };

      const numericFields = [
        "incorporation_year",
        "revenue",
        "ebitda",
        "profit_after_tax",
        "total_assets",
        "net_worth",
        "total_borrowings",
        "shareholding_pre_ipo",
        "shareholding_post_ipo",
        "qib_subscription",
        "nii_subscription",
        "retail_subscription",
        "total_subscription",
      ];

      for (const field of Object.keys(values)) {
        if (numericFields.includes(field)) {
          payload[field] = numberOrNull(values[field]);
        } else {
          payload[field] = values[field] || null;
        }
      }

      let result;

      if (activeTab === "company") {
        result = await supabase
          .from("ipo_company_profile")
          .upsert(payload, { onConflict: "ipo_id" });
      } else if (activeTab === "financials") {
        payload.is_verified = formData.get("is_verified") === "on";
        payload.verified_at = payload.is_verified ? new Date().toISOString() : null;

        result = await supabase
          .from("ipo_financials")
          .upsert(payload, { onConflict: "ipo_id,financial_year" });
      } else if (activeTab === "documents") {
        payload.is_verified = formData.get("is_verified") === "on";
        payload.verified_at = payload.is_verified ? new Date().toISOString() : null;

        result = await supabase
          .from("ipo_documents")
          .insert(payload);
      } else if (activeTab === "promoters") {
        payload.is_verified = formData.get("is_verified") === "on";
        payload.verified_at = payload.is_verified ? new Date().toISOString() : null;

        result = await supabase
          .from("ipo_promoters")
          .upsert(payload, { onConflict: "ipo_id,promoter_name" });
      } else if (activeTab === "risks") {
        payload.is_verified = formData.get("is_verified") === "on";
        payload.verified_at = payload.is_verified ? new Date().toISOString() : null;

        result = await supabase
          .from("ipo_risk_factors")
          .insert(payload);
      } else {
        result = await supabase
          .from("ipo_subscription")
          .upsert(payload, { onConflict: "ipo_id,subscription_date" });
      }

      if (result.error) throw result.error;

      setMessage(
        activeTab === "company"
          ? "Company profile saved successfully."
          : "IPO research data saved successfully."
      );

      form.reset();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save research data."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#080e1b] text-white">
        <SiteHeader />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
            <p className="mt-4 text-sm text-slate-400">
              Checking secure admin access...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!userEmail || !role) {
    return (
      <main className="min-h-screen bg-[#080e1b] text-white">
        <SiteHeader />
        <div className="mx-auto flex min-h-[75vh] max-w-md items-center px-5">
          <form
            onSubmit={handleLogin}
            className="w-full rounded-3xl border border-white/10 bg-[#101a2b] p-7 shadow-2xl"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
              Capital360IPO
            </p>
            <h1 className="mt-3 text-3xl font-black text-white">
              Admin Login
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Sign in using your existing Capital360IPO team account.
            </p>

            {error && (
              <p className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">
                {error}
              </p>
            )}

            <label className="mt-6 block text-sm font-semibold text-slate-300">
              Email Address
            </label>
            <input
              type="email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#080e1b] px-4 py-3 text-white outline-none focus:border-emerald-400"
              placeholder="Enter your registered email"
            />

            <label className="mt-5 block text-sm font-semibold text-slate-300">
              Password
            </label>
            <input
              type="password"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#080e1b] px-4 py-3 text-white outline-none focus:border-emerald-400"
              placeholder="Enter your password"
            />

            <button
              type="submit"
              disabled={loginLoading}
              className="mt-7 w-full rounded-xl bg-emerald-400 px-5 py-3.5 font-black text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
            >
              {loginLoading ? "Signing In..." : "Secure Admin Login"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (role === "viewer") {
    return (
      <main className="min-h-screen bg-[#080e1b] text-white">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-5 py-24 text-center">
          <h1 className="text-2xl font-black">Access Restricted</h1>
          <p className="mt-3 text-slate-400">
            Your account does not have permission to access the research dashboard.
          </p>
          <button
            onClick={handleLogout}
            className="mt-6 rounded-xl border border-white/10 px-5 py-3 font-bold"
          >
            Sign Out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080e1b] text-white">
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
              Capital360IPO Control Centre
            </p>
            <h1 className="mt-3 text-3xl font-black sm:text-4xl">
              IPO Research Dashboard
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              Manage company research, financials and official IPO information.
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-slate-300 transition hover:border-red-400/40 hover:text-red-300"
          >
            Sign Out
          </button>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#101a2b] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Signed In As
            </p>
            <p className="mt-2 break-all text-sm font-bold text-white">
              {userEmail}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#101a2b] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Account Role
            </p>
            <p className="mt-2 text-lg font-black capitalize text-emerald-300">
              {role}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#101a2b] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              IPO Records
            </p>
            <p className="mt-2 text-lg font-black text-white">
              {ipos.length}
            </p>
          </div>
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#101a2b] p-5 sm:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Research Management
            </p>
            <h2 className="mt-2 text-2xl font-black">
              Select IPO
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Choose the IPO for which you want to manage research information.
            </p>
          </div>

          <select
            value={selectedIPO}
            onChange={(e) => setSelectedIPO(e.target.value)}
            className="mt-5 w-full rounded-xl border border-white/10 bg-[#080e1b] px-4 py-4 text-sm font-semibold text-white outline-none focus:border-emerald-400"
          >
            <option value="">Select an IPO</option>
            {ipos.map((ipo) => (
              <option key={ipo.id} value={ipo.id}>
                {ipo.company_name}
                {ipo.ipo_type ? ` (${ipo.ipo_type})` : ""}
              </option>
            ))}
          </select>

          {ipos.length === 0 && (
            <p className="mt-4 text-sm text-amber-300">
              No IPO records found. Add an IPO to ipo_master first.
            </p>
          )}
        </section>

        <section className="mt-8">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Data Entry
          </p>
          <h2 className="mt-2 text-2xl font-black">
            Manage IPO Information
          </h2>

          <div className="mt-6 flex gap-2 overflow-x-auto pb-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setMessage("");
                  setError("");
                }}
                className={`shrink-0 rounded-xl px-4 py-3 text-sm font-bold transition ${
                  activeTab === tab.id
                    ? "bg-emerald-400 text-slate-950"
                    : "border border-white/10 bg-[#101a2b] text-slate-300 hover:border-emerald-400/40"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#101a2b] p-5 sm:p-8">
            <div className="border-b border-white/10 pb-5">
              <h3 className="text-xl font-black">
                {tabs.find((tab) => tab.id === activeTab)?.label}
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Enter information using official company filings and reliable sources.
              </p>
            </div>

            {message && (
              <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-semibold text-emerald-300">
                ✓ {message}
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
                {error}
              </div>
            )}

            <form
              key={activeTab}
              onSubmit={handleSubmit}
              className="mt-6"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                {fields[activeTab].map((field) => (
                  <div
                    key={field.name}
                    className={
                      field.type === "textarea" ? "sm:col-span-2" : ""
                    }
                  >
                    <label className="mb-2 block text-sm font-semibold text-slate-300">
                      {field.label}
                      {field.required && (
                        <span className="ml-1 text-red-400">*</span>
                      )}
                    </label>

                    {field.type === "textarea" ? (
                      <textarea
                        name={field.name}
                        required={field.required}
                        rows={4}
                        placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                        className="w-full rounded-xl border border-white/10 bg-[#080e1b] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                      />
                    ) : field.type === "select" ? (
                      <select
                        name={field.name}
                        required={field.required}
                        defaultValue=""
                        className="w-full rounded-xl border border-white/10 bg-[#080e1b] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                      >
                        <option value="">Select {field.label}</option>
                        {field.options?.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        name={field.name}
                        type={field.type || "text"}
                        required={field.required}
                        step={field.type === "number" ? "any" : undefined}
                        placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                        className="w-full rounded-xl border border-white/10 bg-[#080e1b] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                      />
                    )}
                  </div>
                ))}
              </div>

              {activeTab !== "company" && activeTab !== "subscription" && (
                <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-[#080e1b] p-4">
                  <input
                    type="checkbox"
                    name="is_verified"
                    className="mt-1 h-4 w-4 accent-emerald-400"
                  />
                  <span>
                    <span className="block text-sm font-bold text-white">
                      Mark this record as verified
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">
                      Check this only after verifying the information against an official source.
                      Unverified records will not appear in public verified-data sections.
                    </span>
                  </span>
                </label>
              )}

              {activeTab === "company" && (
                <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                  <p className="text-sm font-bold text-amber-300">
                    Company Profile Notice
                  </p>
                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    The current company profile table does not have a verification
                    column. Only enter information after checking its source.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !selectedIPO}
                className="mt-7 w-full rounded-xl bg-emerald-400 px-6 py-4 font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {submitting ? "Saving Information..." : "Save IPO Information"}
              </button>
            </form>
          </div>
        </section>

        <div className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
          <h3 className="font-bold text-amber-300">
            Data Accuracy & Security
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            Use official NSE, BSE, SEBI and issuer documents as sources.
            Do not mark information verified until it has been checked.
            Database Row Level Security remains responsible for enforcing
            actual read and write permissions.
          </p>
        </div>
      </div>
    </main>
  );
}
