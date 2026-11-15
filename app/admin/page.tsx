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

const tabs: { id: Tab; label: string; shortLabel: string }[] = [
  { id: "company", label: "Company Profile", shortLabel: "Company" },
  { id: "financials", label: "Financials", shortLabel: "Financials" },
  { id: "documents", label: "IPO Documents", shortLabel: "Documents" },
  { id: "promoters", label: "Promoters", shortLabel: "Promoters" },
  { id: "risks", label: "Risk Factors", shortLabel: "Risks" },
  { id: "subscription", label: "Subscription", shortLabel: "Subscription" },
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

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

const labelClass = "mb-2 block text-sm font-semibold text-slate-700";

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
      } else {
        setSelectedIPO("");
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
    void loadDashboard();
    // Dashboard access is checked once on page load.
    // Login and logout explicitly refresh the local dashboard state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setError(err instanceof Error ? err.message : "Login failed.");
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
      const payload: Record<string, unknown> = {
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
        if (field === "is_verified") continue;

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
        payload.verified_at = payload.is_verified
          ? new Date().toISOString()
          : null;

        result = await supabase
          .from("ipo_financials")
          .upsert(payload, { onConflict: "ipo_id,financial_year" });
      } else if (activeTab === "documents") {
        payload.is_verified = formData.get("is_verified") === "on";
        payload.verified_at = payload.is_verified
          ? new Date().toISOString()
          : null;

        result = await supabase.from("ipo_documents").insert(payload);
      } else if (activeTab === "promoters") {
        payload.is_verified = formData.get("is_verified") === "on";
        payload.verified_at = payload.is_verified
          ? new Date().toISOString()
          : null;

        result = await supabase
          .from("ipo_promoters")
          .upsert(payload, { onConflict: "ipo_id,promoter_name" });
      } else if (activeTab === "risks") {
        payload.is_verified = formData.get("is_verified") === "on";
        payload.verified_at = payload.is_verified
          ? new Date().toISOString()
          : null;

        result = await supabase.from("ipo_risk_factors").insert(payload);
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
        err instanceof Error ? err.message : "Unable to save research data."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <SiteHeader />
        <div className="flex min-h-[60vh] items-center justify-center px-5">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
            <p className="mt-4 text-sm font-medium text-slate-600">
              Checking secure admin access...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!userEmail || !role) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <SiteHeader />
        <div className="mx-auto flex min-h-[75vh] max-w-md items-center px-5 py-10">
          <form
            onSubmit={handleLogin}
            className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-xl"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
              Capital360IPO
            </p>

            <h1 className="mt-3 text-3xl font-black text-slate-900">
              Admin Login
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Sign in using your existing Capital360IPO team account.
            </p>

            {error && (
              <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <label className="mt-6 block text-sm font-semibold text-slate-700">
              Email Address
            </label>

            <input
              type="email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className={inputClass + " mt-2"}
              placeholder="Enter your registered email"
            />

            <label className="mt-5 block text-sm font-semibold text-slate-700">
              Password
            </label>

            <input
              type="password"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className={inputClass + " mt-2"}
              placeholder="Enter your password"
            />

            <button
              type="submit"
              disabled={loginLoading}
              className="mt-7 w-full rounded-xl bg-emerald-700 px-5 py-3.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
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
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-5 py-24 text-center">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-black text-slate-900">
              Access Restricted
            </h1>
            <p className="mt-3 text-slate-600">
              Your account does not have permission to access the research dashboard.
            </p>
            <button
              onClick={handleLogout}
              className="mt-6 rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-100"
            >
              Sign Out
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              Capital360IPO Control Centre
            </p>
            <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-4xl">
              IPO Research Dashboard
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Monitor research information, review exceptions and manage official IPO data.
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-red-300 hover:text-red-700"
          >
            Sign Out
          </button>
        </div>

        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-xl">
              ⚙️
            </div>
            <div>
              <h2 className="font-bold text-emerald-950">
                Automation-first IPO platform
              </h2>
              <p className="mt-1 text-sm leading-6 text-emerald-900">
                Automatic collection and updates are the primary platform goal.
                This dashboard provides access for monitoring, corrections and
                exceptional manual review. Do not treat manual entry as the
                regular data collection process.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Signed In As
            </p>
            <p className="mt-2 break-all text-sm font-bold text-slate-900">
              {userEmail}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Account Role
            </p>
            <p className="mt-2 text-lg font-black capitalize text-emerald-700">
              {role}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              IPO Records
            </p>
            <p className="mt-2 text-lg font-black text-slate-900">
              {ipos.length}
            </p>
          </div>
        </div>

        <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Research Management
            </p>
            <h2 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">
              Select IPO
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Choose the IPO whose research information needs review or correction.
            </p>
          </div>

          <select
            value={selectedIPO}
            onChange={(e) => setSelectedIPO(e.target.value)}
            className={inputClass + " mt-5"}
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
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No IPO records found. Add an IPO to ipo_master first.
            </p>
          )}
        </section>

        <section className="mt-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Review & Exception Handling
            </p>
            <h2 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">
              IPO Information
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Use these sections only when information needs to be added,
              corrected or reviewed.
            </p>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-3">
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
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="border-b border-slate-200 pb-5">
              <h3 className="text-lg font-black text-slate-900 sm:text-xl">
                {tabs.find((tab) => tab.id === activeTab)?.label}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use official company filings and reliable sources when making
                a correction or adding missing information.
              </p>
            </div>

            {message && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                ✓ {message}
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
                    <label className={labelClass}>
                      {field.label}
                      {field.required && (
                        <span className="ml-1 text-red-600">*</span>
                      )}
                    </label>

                    {field.type === "textarea" ? (
                      <textarea
                        name={field.name}
                        required={field.required}
                        rows={4}
                        placeholder={
                          field.placeholder ||
                          `Enter ${field.label.toLowerCase()}`
                        }
                        className={inputClass + " resize-y"}
                      />
                    ) : field.type === "select" ? (
                      <select
                        name={field.name}
                        required={field.required}
                        defaultValue=""
                        className={inputClass}
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
                        placeholder={
                          field.placeholder ||
                          `Enter ${field.label.toLowerCase()}`
                        }
                        className={inputClass}
                      />
                    )}
                  </div>
                ))}
              </div>

              {activeTab !== "company" && activeTab !== "subscription" && (
                <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <input
                    type="checkbox"
                    name="is_verified"
                    className="mt-1 h-4 w-4 accent-emerald-700"
                  />
                  <span>
                    <span className="block text-sm font-bold text-slate-900">
                      Mark this record as verified
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">
                      Check this only after verifying the information against
                      an official source. Unverified records will not appear
                      in public verified-data sections.
                    </span>
                  </span>
                </label>
              )}

              {activeTab === "company" && (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-900">
                    Company Profile Notice
                  </p>
                  <p className="mt-2 text-xs leading-6 text-amber-800">
                    The current company profile table does not have a
                    verification column. Only enter information after
                    checking its source.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !selectedIPO}
                className="mt-7 w-full rounded-xl bg-emerald-700 px-6 py-4 font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {submitting ? "Saving Information..." : "Save IPO Information"}
              </button>
            </form>
          </div>
        </section>

        <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-slate-900">
            Data Accuracy & Security
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Use official NSE, BSE, SEBI and issuer documents as sources.
            Do not mark information verified until it has been checked.
            Database Row Level Security remains responsible for enforcing
            actual read and write permissions.
          </p>
        </section>
      </div>
    </main>
  );
}
