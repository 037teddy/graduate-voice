"use client";

import { useState } from "react";
import { useSession } from "@/lib/session";
import { errorText, rpc, timeAgo } from "@/lib/supabase";
import type { Poll } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

const loadPolls = () => rpc<Poll[]>("get_polls");

export default function Polls() {
  const { me } = useSession();
  const { data: polls, error, setError, reload } = usePolling(loadPolls);
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
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
      await rpc("create_poll", { p_question: question, p_options: options });
      setQuestion("");
      setOptions(["", ""]);
      setShowForm(false);
    });
    setBusy(false);
  }

  const filled = options.filter((o) => o.trim()).length;

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Different views? Put them to a vote. Results appear after you vote and go into the
          report.
        </p>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {showForm ? "Cancel" : "New poll"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mb-4 space-y-2 rounded-xl bg-white p-3 shadow-sm">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, 200))}
            placeholder="Question, e.g. How should we approach the administration?"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          {options.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={opt}
                onChange={(e) =>
                  setOptions((o) => o.map((x, j) => (j === i ? e.target.value.slice(0, 100) : x)))
                }
                placeholder={`Option ${i + 1}`}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptions((o) => o.filter((_, j) => j !== i))}
                  className="px-2 text-slate-400 hover:text-red-600"
                  aria-label="Remove option"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-3">
            {options.length < 6 && (
              <button
                type="button"
                onClick={() => setOptions((o) => [...o, ""])}
                className="text-sm text-indigo-700 underline"
              >
                Add option
              </button>
            )}
            <button
              disabled={busy || question.trim().length < 5 || filled < 2}
              className="ml-auto rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Create poll
            </button>
          </div>
        </form>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!polls && !error && <p className="text-sm text-slate-500">Loading polls…</p>}
      {polls?.length === 0 && <p className="text-sm text-slate-500">No polls yet.</p>}

      <ul className="space-y-3">
        {polls?.map((poll) => {
          const showResults = poll.my_option !== null || poll.is_closed;
          return (
            <li
              key={poll.id}
              className={`rounded-xl bg-white p-3 shadow-sm ${poll.is_hidden ? "opacity-60" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-slate-900">{poll.question}</h3>
                {poll.is_closed && (
                  <span className="rounded bg-slate-200 px-1.5 text-xs text-slate-700">Closed</span>
                )}
                {poll.is_hidden && (
                  <span className="rounded bg-red-100 px-1.5 text-xs text-red-700">Hidden</span>
                )}
              </div>
              <p className="mb-2 text-xs text-slate-400">
                {poll.is_mine ? "You" : poll.nickname} · {timeAgo(poll.created_at)} ·{" "}
                {poll.total} vote{poll.total === 1 ? "" : "s"}
              </p>
              <div className="space-y-1.5">
                {poll.options.map((o) => {
                  const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
                  const chosen = poll.my_option === o.id;
                  return (
                    <button
                      key={o.id}
                      disabled={poll.is_closed || poll.is_hidden}
                      onClick={() =>
                        act(() => rpc("vote_poll", { p_poll_id: poll.id, p_option_id: o.id }))
                      }
                      className={`relative block w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm ${
                        chosen ? "border-indigo-600" : "border-slate-300 hover:border-indigo-400"
                      } disabled:cursor-default`}
                    >
                      {showResults && (
                        <span
                          className={`absolute inset-y-0 left-0 ${chosen ? "bg-indigo-100" : "bg-slate-100"}`}
                          style={{ width: `${pct}%` }}
                        />
                      )}
                      <span className="relative flex justify-between gap-2">
                        <span>
                          {chosen && "✓ "}
                          {o.label}
                        </span>
                        {showResults && (
                          <span className="text-slate-500">
                            {pct}% ({o.votes})
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!poll.is_closed && poll.my_option !== null && (
                <p className="mt-1 text-xs text-slate-400">You can change your vote until it closes.</p>
              )}
              <div className="mt-2 flex gap-3 text-xs">
                {!poll.is_closed && (poll.is_mine || me?.is_moderator) && (
                  <button
                    onClick={() =>
                      window.confirm("Close this poll? Nobody will be able to vote after this.") &&
                      act(() => rpc("close_poll", { p_poll_id: poll.id }))
                    }
                    className="text-slate-600 underline"
                  >
                    Close poll
                  </button>
                )}
                {me?.is_moderator && (
                  <button
                    onClick={() =>
                      act(() => rpc("moderate_poll", { p_poll_id: poll.id, p_hide: !poll.is_hidden }))
                    }
                    className="text-red-600 underline"
                  >
                    {poll.is_hidden ? "Unhide" : "Hide"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
