
import { requireOwner } from "@/lib/require-owner";
import NseImportForm from "./nse-import-form";

export const dynamic = "force-dynamic";

export default async function NseImportPage() {
  await requireOwner();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="text-sm font-semibold tracking-widest text-emerald-400">
            CAPITAL360IPO · OWNER PANEL
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            NSE Security Master Import
          </h1>

          <p className="mt-3 text-sm text-slate-400">
            Import official NSE listed securities data securely.
          </p>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">
            Upload NSE Security File
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Select the official NSE CM Security File in .csv.gz format.
          </p>

          <div className="mt-6">
            <NseImportForm />
          </div>
        </section>

        <p className="mt-6 text-xs text-slate-500">
          Restricted access · Owner authentication required · Raw data
          preserved for auditing.
        </p>
      </div>
    </main>
  );
}
