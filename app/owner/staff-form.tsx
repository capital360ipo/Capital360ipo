
"use client";

import { useState } from "react";

export default function StaffForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setSuccess(false);
    setLoading(true);

    try {
      const response = await fetch("/api/owner/staff", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Invitation failed.");
        return;
      }

      setSuccess(true);
      setMessage("Invitation sent successfully.");
      setFullName("");
      setEmail("");
      setRole("editor");
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-bold">Add Staff Member</h2>

      <p className="mt-2 text-sm text-slate-400">
        Create a secure staff invitation.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label className="mb-2 block text-sm">Full Name</label>
          <input
            required
            maxLength={100}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
            placeholder="Enter full name"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm">Email Address</label>
          <input
            required
            type="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
            placeholder="Enter email address"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm">Staff Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
          >
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-emerald-500 p-3 font-semibold text-slate-950 disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Staff Invitation"}
        </button>

        {message && (
          <p className={success ? "text-sm text-emerald-400" : "text-sm text-red-400"}>
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
