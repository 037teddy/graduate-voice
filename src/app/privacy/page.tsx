import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy · Anonymous Graduate Voice",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-8 text-slate-800">
      <div>
        <Link href="/" className="text-sm text-indigo-700 underline">
          ← Back
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">What is and is not stored</h1>
        <p className="mt-2 text-slate-600">
          We want you to trust this space, so here is exactly how it works.
        </p>
      </div>

      <section>
        <h2 className="font-semibold text-slate-900">Never collected</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your name, email address or phone number.</li>
          <li>Your WhatsApp account or student number.</li>
          <li>Your IP address: the app itself does not record it.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-slate-900">Stored</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            A random anonymous ID and nickname (like “Graduate 47”), kept in your browser. If
            you clear your browser data you get a new nickname.
          </li>
          <li>Your messages, issues, poll choices and upvotes, linked to that nickname.</li>
          <li>
            Who voted for what is never shown to anyone in the app, including moderators. Only
            totals are shown.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-slate-900">The honest limits</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Everything you write under one nickname is linked. Small details added together
            (your exact course, a personal story, writing style) can reveal who you are in a
            small class. Share only what you are comfortable with.
          </li>
          <li>
            The hosting companies (Vercel and Supabase) keep their own short-term technical logs,
            which can include IP addresses, like almost every website.
          </li>
          <li>
            The person who manages the database could, in principle, read the stored data. They
            still cannot see names, because names are never stored.
          </li>
          <li>Moderators can read hidden messages. Every moderator action is logged.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-slate-900">What the administration receives</h2>
        <p className="mt-2">
          Only the exported report: the top issues, how many graduates support each one, and
          poll totals. Chat messages are not included.
        </p>
      </section>
    </main>
  );
}
