
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (active) {
        setVerified(!!data.session);
        if (!data.session) {
          setMessage("Password reset link invalid ya expire ho gaya hai.");
        }
      }
    };

    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (active && event === "PASSWORD_RECOVERY" && session) {
          setVerified(true);
          setMessage("");
        }
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("Password kam se kam 8 characters ka hona chahiye.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Dono password match nahi kar rahe.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();

    setMessage("Password successfully update ho gaya. Ab Login karo.");

    setLoading(false);
    setTimeout(() => router.push("/login"), 1500);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <h1 className="text-center text-2xl font-bold text-white">
          Create New Password
        </h1>

        <p className="mt-3 text-center text-sm text-slate-400">
          Capital360IPO account ke liye naya password set karein.
        </p>

        {verified ? (
          <form onSubmit={handleUpdate} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-sm text-slate-300">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Confirm Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-emerald-400"
              />
            </div>

            {message && (
              <p className="text-sm text-amber-300">{message}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-500 py-3 font-bold text-slate-950 disabled:opacity-50"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        ) : (
          <div className="mt-8 text-center">
            <p className="text-sm text-amber-300">
              {message || "Verifying reset link..."}
            </p>
            <a
              href="/login"
              className="mt-5 inline-block text-sm text-emerald-400"
            >
              Back to Login
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
