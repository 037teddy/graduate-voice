"use client";

import { useState } from "react";
import { useSession } from "@/lib/session";
import { errorText, rpc, timeAgo } from "@/lib/supabase";
import { STATUS_LABEL, type Issue, type IssueStatus } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

const loadIssues = () => rpc<Issue[]>("get_issues");

export default function IssuesBoard() {
  const { me } = useSession();
  const { data: issues, error, setError, reload } = usePolling(loadIssues);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await act(async () => {
      await rpc("create_issue", { p_title: title, p_description: description });
      setTitle("");
      setDescription("");
      setShowForm(false);
    });
    setBusy(false);
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Post a specific issue and support the ones that affect you. The most supported issues
          lead the report.
        </p>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {showForm ? "Cancel" : "New issue"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mb-4 space-y-2 rounded-xl bg-white p-3 shadow-sm">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            placeholder="Short title, e.g. Certificates not issued 2 months after graduation"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
            placeholder="Facts only: what happened, since when, how it affects graduates (optional)"
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <button
            disabled={busy || title.trim().length < 3}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Post issue
          </button>
        </form>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!issues && !error && <p className="text-sm text-slate-500">Loading issues…</p>}
      {issues?.length === 0 && (
        <p className="text-sm text-slate-500">No issues yet. Be the first to post one.</p>
      )}

      <ul className="space-y-3">
        {issues?.map((issue) => (
          <li
            key={issue.id}
            className={`flex gap-3 rounded-xl bg-white p-3 shadow-sm ${issue.is_hidden ? "opacity-60" : ""}`}
          >
            <button
              onClick={() => act(() => rpc("toggle_issue_vote", { p_issue_id: issue.id }))}
              disabled={issue.is_hidden}
              aria-pressed={issue.voted}
              title={issue.voted ? "Remove your support" : "This affects me too"}
              className={`flex w-14 shrink-0 flex-col items-center justify-center rounded-lg border py-2 ${
                issue.voted
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-300 text-slate-700 hover:border-indigo-400"
              }`}
            >
              <span className="text-xs">▲</span>
              <span className="text-lg font-semibold leading-none">{issue.vote_count}</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-slate-900">{issue.title}</h3>
                <StatusBadge status={issue.status} />
                {issue.is_hidden && (
                  <span className="rounded bg-red-100 px-1.5 text-xs text-red-700">Hidden</span>
                )}
              </div>
              {issue.description && (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">
                  {issue.description}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                {issue.is_mine ? "You" : issue.nickname} · {timeAgo(issue.created_at)}
              </p>
              {me?.is_moderator && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={issue.status}
                    onChange={(e) =>
                      act(() =>
                        rpc("set_issue_status", {
                          p_issue_id: issue.id,
                          p_status: e.target.value as IssueStatus,
                        }),
                      )
                    }
                    className="rounded border border-slate-300 px-1 py-0.5"
                  >
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      act(() =>
                        rpc("moderate_issue", { p_issue_id: issue.id, p_hide: !issue.is_hidden }),
                      )
                    }
                    className="text-red-600 underline"
                  >
                    {issue.is_hidden ? "Unhide" : "Hide"}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: IssueStatus }) {
  const style =
    status === "resolved"
      ? "bg-green-100 text-green-800"
      : status === "in_progress"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-700";
  return <span className={`rounded px-1.5 text-xs ${style}`}>{STATUS_LABEL[status]}</span>;
}
