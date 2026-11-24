"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { errorText, rpc } from "@/lib/supabase";
import { STATUS_LABEL, type Summary } from "@/lib/types";
import JoinScreen from "./JoinScreen";

const DEFAULT_INTRO =
  "We are writing on behalf of the graduating class to respectfully ask for an update on the issuing of our certificates. We graduated about two months ago and have not yet received them. Many of us need the certificates for jobs, further studies and professional registration. The points below were gathered anonymously from the class and show how many graduates each issue affects.";

const DEFAULT_REQUEST =
  "We kindly ask the administration to share a clear date for when certificates will be issued, the reason for the delay, and a contact person for follow-up. We appreciate your attention and look forward to your response.";

export default function ReportView() {
  const { status } = useSession();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState("The Academic Registrar");
  const [from, setFrom] = useState("The graduating class");
  const [intro, setIntro] = useState(DEFAULT_INTRO);
  const [request, setRequest] = useState(DEFAULT_REQUEST);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    rpc<Summary>("get_summary")
      .then((s) => !cancelled && setSummary(s))
      .catch((e) => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "loading") return <p className="p-6 text-slate-500">Loading…</p>;
  if (status !== "ready") return <JoinScreen />;

  const date = summary
    ? new Date(summary.generated_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const issues = summary?.issues.slice(0, 10) ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 print:max-w-none print:p-0">
      <div className="mb-6 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900 print:hidden">
        <p>
          This is the report for the administration. Edit the text boxes, then use{" "}
          <b>Print / Save as PDF</b>. Numbers come live from the board and polls. Nothing you
          type here is saved.
        </p>
        <div className="mt-3 flex gap-3">
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-700"
          >
            Print / Save as PDF
          </button>
          <Link href="/" className="rounded-lg border border-indigo-300 px-3 py-2">
            Back to the app
          </Link>
        </div>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {!summary && !error && <p className="text-slate-500">Building the report…</p>}

      {summary && (
        <article className="space-y-6 text-slate-900">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold">Request for an update on graduation certificates</h1>
            <p className="text-sm text-slate-600">{date}</p>
            <Field label="To" value={to} onChange={setTo} />
            <Field label="From" value={from} onChange={setFrom} />
          </header>

          <Editable value={intro} onChange={setIntro} />

          <section>
            <h2 className="mb-3 text-lg font-semibold">In numbers</h2>
            <div className="grid grid-cols-3 gap-3">
              <Stat value={summary.members} label="graduates joined" />
              <Stat value={summary.participants} label="took part" />
              <Stat value={issues[0]?.votes ?? 0} label="support the top issue" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Issues raised, by number of graduates affected</h2>
            {issues.length === 0 ? (
              <p className="text-sm text-slate-500">No issues have been posted yet.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-slate-600">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Issue</th>
                    <th className="py-2 pr-2 text-right">Graduates</th>
                    <th className="py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue, i) => (
                    <tr key={issue.id} className="border-b border-slate-200 align-top">
                      <td className="py-2 pr-2 text-slate-500">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <p className="font-medium">{issue.title}</p>
                        {issue.description && (
                          <p className="mt-0.5 text-slate-600">{issue.description}</p>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right font-semibold">{issue.votes}</td>
                      <td className="py-2 text-right text-slate-600">{STATUS_LABEL[issue.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {summary.polls.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">What the class thinks</h2>
              <div className="space-y-4">
                {summary.polls.map((poll) => (
                  <div key={poll.id} className="break-inside-avoid">
                    <p className="font-medium">
                      {poll.question}{" "}
                      <span className="text-sm font-normal text-slate-500">
                        ({poll.total} vote{poll.total === 1 ? "" : "s"})
                      </span>
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {poll.options.map((o) => {
                        const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
                        return (
                          <li key={o.id} className="flex items-center gap-2">
                            <span className="w-48 shrink-0">{o.label}</span>
                            <span className="h-2 flex-1 rounded bg-slate-200 print:border print:border-slate-400">
                              <span
                                className="block h-2 rounded bg-indigo-600"
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                            <span className="w-20 text-right text-slate-600">
                              {pct}% ({o.votes})
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-lg font-semibold">Our request</h2>
            <Editable value={request} onChange={setRequest} />
          </section>

          <footer className="border-t border-slate-200 pt-3 text-xs text-slate-500">
            How this was gathered: graduates joined a private, anonymous space using a class
            access code. No names or contact details were collected. Counts are of anonymous
            participants (one per device), so they are a close estimate rather than a verified
            headcount.
          </footer>
        </article>
      )}
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <p className="text-sm">
      <span className="font-medium">{label}: </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-2/3 border-b border-dashed border-slate-300 bg-transparent outline-none focus:border-indigo-500 print:border-none"
      />
    </p>
  );
}

function Editable({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded-lg border border-dashed border-slate-300 p-2 leading-relaxed outline-none focus:border-indigo-500 print:hidden"
      />
      <p className="hidden whitespace-pre-wrap leading-relaxed print:block">{value}</p>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 text-center">
      <p className="text-3xl font-semibold text-indigo-700">{value}</p>
      <p className="text-xs text-slate-600">{label}</p>
    </div>
  );
}
