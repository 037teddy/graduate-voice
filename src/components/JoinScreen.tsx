"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/lib/session";
import { errorText } from "@/lib/supabase";

export default function JoinScreen() {
  const { join, codeChanged, status } = useSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await join(code);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-5 py-10">
      <div>
        <p className="text-sm font-medium text-indigo-600">Anonymous Graduate Voice</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Speak freely. Speak together.
        </h1>
        <p className="mt-2 text-slate-600">
          A private space for our class to discuss the delayed certificates and send one clear,
          united message to the administration.
        </p>
      </div>

      {status === "not_configured" ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          The app is temporarily unavailable. Please try again later.
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          {codeChanged && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              The class access code was changed. Enter the new code to continue. You will keep
              your nickname.
            </p>
          )}
          <label htmlFor="code" className="text-sm font-medium text-slate-700">
            Class access code
          </label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="Enter the code shared in the class group"
            className="rounded-lg border border-slate-300 px-3 py-3 text-base uppercase tracking-wider outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Joining…" : "Join anonymously"}
          </button>
        </form>
      )}

      <div className="rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
        <p className="font-medium text-slate-900">What we store</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>No name, email or phone number. Ever.</li>
          <li>You get a random nickname like “Graduate 47” on this device.</li>
        </ul>
        <Link href="/privacy" className="mt-2 inline-block font-medium text-indigo-700 underline">
          Read the full privacy note
        </Link>
      </div>
    </main>
  );
}
