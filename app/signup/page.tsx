
"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setSuccess(false);

    if (password.length < 8) {
      setMessage("Password kam se kam 8 characters ka hona chahiye.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Dono password match nahi kar rahe.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          account_type: "user",
          full_name: fullName.trim(),
        },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (data.user && data.session) {
      setMessage(
        "Account create ho gaya, lekin email verification required hai. Apna email check karein."
      );
      setSuccess(true);
    } else {
      setMessage(
        "Signup request submit ho gayi. Email par verification link check karein."
      );
      setSuccess(true);
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">
            CAPITAL<span className="text-emerald-400">360</span>IPO
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Create your Capital360IPO account
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-5">

          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Full Name
            </label>
            <input
              type="text"
              required
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create password"
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
              placeholder="Confirm password"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-emerald-400"
            />
          </div>

          {message && (
            <p className={`rounded-lg p-3 text-sm ${
              success
                ? "bg-emerald-950 text-emerald-300"
                : "bg-slate-800 text-amber-300"
            }`}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-500 py-3 font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? "Please wait..." : "Create Account"}
          </button>

        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-400 hover:underline">
            Login
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-slate-500">
          Secure Authentication by Capital360IPO
        </p>
      </div>
    </main>
  );
}
