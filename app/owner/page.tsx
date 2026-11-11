import Link from "next/link";
import { requireOwner } from "@/lib/require-owner";
import StaffForm from "./staff-form";
import IpoCollectorButton from "./ipo-collector-button";
import NseIpoCollectorButton from "./nse-ipo-collector-button";
import NseCsvImport from "./nse-csv-import";
import IpoLifecycleButton from "./ipo-lifecycle-button";
import NseAttachmentParserButton from "./nse-attachment-parser-button";
import NseListingCollectorButton from "./nse-listing-collector-button";
import NseIpoTrackerPreview from "./nse-ipo-tracker-preview";
import IpoSecurityMasterDiscoverButton from "./ipo-security-master-discover-button";
import IpoListingHistoryImport from "./ipo-listing-history-import";
import IpoListingHistoryReview from "./ipo-listing-history-review";

export const dynamic = "force-dynamic";

export default async function OwnerDashboard() {
  const { user, profile } = await requireOwner();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-7xl space-y-8">

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              Capital360IPO
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Owner Dashboard
            </p>
          </div>

          <Link
            href="/"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            Visit Website
          </Link>
        </header>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">
            Account Information
          </h2>

          <p className="mt-2 text-sm text-slate-300">
            Email: {user.email}
          </p>

          <p className="mt-1 text-sm text-slate-300">
            Role: {profile.role}
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-bold">
            IPO Automation & Data Management
          </h2>

          <IpoCollectorButton />

          <NseIpoCollectorButton />

          <NseCsvImport />

          <IpoLifecycleButton />

          <NseAttachmentParserButton />

          <NseListingCollectorButton />

          <NseIpoTrackerPreview />

          <IpoSecurityMasterDiscoverButton />

          <IpoListingHistoryImport />

          <IpoListingHistoryReview />
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-xl font-semibold">
            Team Management
          </h2>

          <StaffForm />
        </section>

      </div>
    </main>
  );
}
