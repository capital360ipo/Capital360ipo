import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type AccountRole = "owner" | "admin" | "editor" | "viewer" | "customer";

async function handleLogout() {
  "use server";

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  redirect("/login");
}

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Temporary session diagnostic.
  if (userError || !user) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <h1 className="text-2xl font-bold">Session Check</h1>

        <p className="mt-4">
          User: {user ? "Found" : "Not Found"}
        </p>

        <p className="mt-2 break-words">
          Error: {userError?.message || "No authenticated user session found."}
        </p>

        <Link
          href="/login"
          className="mt-6 inline-block text-emerald-400 underline"
        >
          Back to Login
        </Link>
      </main>
    );
  }

  const [staffResult, customerResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .maybeSingle(),

    supabase
      .from("customer_profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  let role: AccountRole | null = null;
  let fullName = "";
  let message = "";

  if (staffResult.error || customerResult.error) {
    message = "Account details load nahi ho paye.";
  } else if (staffResult.data) {
    role = staffResult.data.role as AccountRole;
    fullName = staffResult.data.full_name || "";
  } else if (customerResult.data) {
    role = "customer";
    fullName = customerResult.data.full_name || "";
  } else {
    message = "Account profile abhi available nahi hai.";
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

          <form action={handleLogout}>
            <button
              type="submit"
              className="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-300"
            >
              Logout
            </button>
          </form>
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
              <p className="mt-1 text-lg">{fullName || "Not added"}</p>
            </div>

            <div>
              <p className="text-xs text-slate-500">EMAIL ADDRESS</p>
              <p className="mt-1 break-all text-lg">{user.email || ""}</p>
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
