
import Link from "next/link";
import { requireOwner } from "@/lib/require-owner";

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

        <section className="mt-6 grid gap-4 sm:grid-cols-2">

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">Staff Management</h2>
            <p className="mt-2 text-sm text-slate-400">
              Admin, Editor aur Viewer accounts manage karein.
            </p>
            <p className="mt-4 text-sm text-amber-400">
              Coming Next
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">Security Control</h2>
            <p className="mt-2 text-sm text-slate-400">
              Roles, permissions aur security settings.
            </p>
            <p className="mt-4 text-sm text-amber-400">
              Coming Next
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">IPO Management</h2>
            <p className="mt-2 text-sm text-slate-400">
              IPO records aur GMP management.
            </p>
            <Link
              href="/ipos"
              className="mt-4 inline-block text-sm text-emerald-400"
            >
              View IPOs →
            </Link>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">Audit & Logs</h2>
            <p className="mt-2 text-sm text-slate-400">
              Important system activities ka record.
            </p>
            <p className="mt-4 text-sm text-amber-400">
              Coming Next
            </p>
          </div>

        </section>
      </div>
    </main>
  );
}
