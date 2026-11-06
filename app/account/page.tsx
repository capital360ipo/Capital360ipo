"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type AccountRole = "owner" | "admin" | "editor" | "viewer" | "customer";

export default function AccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AccountRole | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (!active) return;

      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }

      setEmail(userData.user.email || "");

      const [staffResult, customerResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", userData.user.id)
          .maybeSingle(),

        supabase
          .from("customer_profiles")
          .select("full_name")
          .eq("id", userData.user.id)
          .maybeSingle(),
      ]);

      if (!active) return;

      if (staffResult.error || customerResult.error) {
        setMessage("Account details load nahi ho paye. Dobara try karein.");
        setLoading(false);
        return;
      }

      if (staffResult.data) {
        const staffRole = staffResult.data.role as AccountRole;

        setRole(staffRole);
        setFullName(staffResult.data.full_name || "");
      } else if (customerResult.data) {
        setRole("customer");
        setFullName(customerResult.data.full_name || "");
      } else {
        setMessage("Account profile abhi available nahi hai.");
      }

      setLoading(false);
    }

    loadAccount();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout() {
    setSigningOut(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage("Logout nahi ho paya. Dobara try karein.");
      setSigningOut(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        Loading your account...
      </main>
    );
  }

  const roleNames: Record<AccountRole, string> = {
    owner: "Owner",
    admin: "Administrator",
    editor: "Editor",
    viewer: "Viewer",
    customer: "Customer",
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">

        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="text-xl font-bold">
            CAPITAL<span className="text-emerald-400">360</span>IPO
          </Link>

          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-300 disabled:opacity-50"
          >
            {signingOut ? "Logging out..." : "Logout"}
          </button>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm font-semibold text-emerald-400">
            {role ? roleNames[role].toUpperCase() + " ACCOUNT" : "ACCOUNT"}
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Welcome, {fullName || (role ? roleNames[role] : "User")}!
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Your Capital360IPO account
          </p>

          <div className="mt-8 space-y-5">
            <div>
              <p className="text-xs text-slate-500">ACCOUNT ROLE</p>
              <p className="mt-1 text-lg font-semibold capitalize">
                {role || "Not available"}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">FULL NAME</p>
              <p className="mt-1 text-lg">
                {fullName || "Not added"}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">EMAIL ADDRESS</p>
              <p className="mt-1 break-all text-lg">{email}</p>
            </div>

            {message && (
              <p className="rounded-lg bg-slate-800 p-3 text-sm text-amber-300">
                {message}
              </p>
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            href="/ipos"
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 hover:border-emerald-400"
          >
            <h2 className="font-semibold">IPO Updates</h2>
            <p className="mt-2 text-sm text-slate-400">
              Explore upcoming and current IPOs.
            </p>
          </Link>

          <Link
            href="/"
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 hover:border-emerald-400"
          >
            <h2 className="font-semibold">Capital360IPO Home</h2>
            <p className="mt-2 text-sm text-slate-400">
              Return to the homepage.
            </p>
          </Link>
        </section>

      </div>
    </main>
  );
}
