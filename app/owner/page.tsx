
import Link from "next/link";
import { requireOwner } from "@/lib/require-owner";
import StaffForm from "./staff-form";
import IpoCollectorButton from "./ipo-collector-button";
import NseIpoCollectorButton from "./nse-ipo-collector-button";
import NseCsvImport from "./nse-csv-import";
import IpoLifecycleButton from "./ipo-lifecycle-button";
import NseAttachmentParserButton from "./nse-attachment-parser-button";

export default async function OwnerDashboard() {
  const { user, profile } = await requireOwner();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">

        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-xl font-bold tracking-wide">
            CAPITAL<span className="text-emerald-400">360</span>IPO
          </Link>

          <Link
            href="/account"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            My Account
          </Link>
        </header>

        <section className="mb-8 rounded-2xl border border-emerald-500/30 bg-slate-900 p-6">
          <p className="text-sm font-semibold tracking-wider text-emerald-400">
            OWNER CONTROL PANEL
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Welcome, {profile.full_name || "Owner"}!
          </h1>

          <p className="mt-2 break-all text-sm text-slate-400">
            {user.email}
          </p>

          <div className="mt-5 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400">
            Verified Owner Access
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-xl font-bold">
            Team Management
          </h2>
          <StaffForm />
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-xl font-bold">
            IPO Automation Controls
          </h2>

          <div className="space-y-6">
            <IpoCollectorButton />
            <NseIpoCollectorButton />
            <NseCsvImport />
            <NseAttachmentParserButton />
            <IpoLifecycleButton />
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2">

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-bold">
              Security Control
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Manage access, permissions and platform security.
            </p>
          </div>

          <Link
            href="/ipos"
            className="rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-emerald-500/50"
          >
            <h2 className="text-lg font-bold">
              IPO Management
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Manage IPO records, details and review workflow.
            </p>
            <p className="mt-4 text-sm font-semibold text-emerald-400">
              Open IPO Management →
            </p>
          </Link>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-bold">
              Audit &amp; Logs
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Review platform activity and automation logs.
            </p>
          </div>

        </section>

      </div>
    </main>
  );
}
