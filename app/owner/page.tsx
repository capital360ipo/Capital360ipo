import Link from "next/link";
import { requireOwner } from "@/lib/require-owner";
import StaffForm from "./staff-form";
import IpoCollectorButton from "./ipo-collector-button";
import NseCsvImport from "./nse-csv-import";
import IpoLifecycleButton from "./ipo-lifecycle-button";

export default async function OwnerDashboard() {
  const { user, profile } = await requireOwner();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            CAPITAL<span className="text-emerald-400">360</span>IPO
          </Link>

          <Link
            href="/account"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm"
          >
            My Account
          </Link>
        </header>

        <section className="rounded-2xl border border-emerald-500/30 bg-slate-900 p-6">
          <p className="text-sm font-semibold text-emerald-400">
            OWNER CONTROL PANEL
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Welcome, {profile.full_name || "Owner"}!
          </h1>

          <p className="mt-3 break-all text-sm text-slate-400">
            {user.email}
          </p>

          <p className="mt-4 inline-block rounded-full bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400">
            Verified Owner Access
          </p>
        </section>

        <div className="mt-6 space-y-6">
          <IpoCollectorButton />

          <NseCsvImport />

          <IpoLifecycleButton />

          <StaffForm />

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-bold">Security Control</h2>
            <p className="mt-2 text-sm text-slate-400">
              Owner access and security management.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-bold">IPO Management</h2>
            <p className="mt-2 text-sm text-slate-400">
              IPO records and lifecycle management.
            </p>
            <Link
              href="/ipos"
              className="mt-4 inline-block text-sm font-semibold text-emerald-400"
            >
              View IPO Section →
            </Link>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-bold">Audit & Logs</h2>
            <p className="mt-2 text-sm text-slate-400">
              Monitor automation activity and system events.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
