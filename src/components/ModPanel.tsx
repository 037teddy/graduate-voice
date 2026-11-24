"use client";

import { useState } from "react";
import { errorText, rpc, timeAgo } from "@/lib/supabase";
import type { ModLogEntry, QueueItem } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

type ModData = {
  queue: QueueItem[];
  log: ModLogEntry[];
  settings: { slow_mode_seconds: number; code_epoch: number } | null;
};

const loadModData = async (): Promise<ModData> => {
  const [queue, log, settings] = await Promise.all([
    rpc<QueueItem[]>("get_mod_queue"),
    rpc<ModLogEntry[]>("get_mod_log"),
    rpc<ModData["settings"]>("get_settings"),
  ]);
  return { queue, log, settings };
};

export default function ModPanel() {
  const { data, error, setError, reload } = usePolling(loadModData, 20000);
  const [slow, setSlow] = useState<string>("");
  const [newCode, setNewCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, done?: string) {
    try {
      await fn();
      setNotice(done ?? null);
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <section>
        <h2 className="mb-2 font-semibold text-slate-900">Reported messages</h2>
        {!data && <p className="text-sm text-slate-500">Loading…</p>}
        {data?.queue.length === 0 && <p className="text-sm text-slate-500">Nothing to review.</p>}
        <ul className="space-y-3">
          {data?.queue.map((q) => (
            <li key={q.message_id} className="rounded-xl bg-white p-3 shadow-sm">
              <p className="text-xs text-slate-500">
                {q.nickname} · message #{q.message_id} · {q.report_count} report
                {q.report_count === 1 ? "" : "s"} · {timeAgo(q.last_reported_at)}
                {q.is_hidden && <span className="ml-1 text-red-600">(already hidden)</span>}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{q.body}</p>
              <ul className="mt-2 list-disc pl-5 text-xs text-slate-600">
                {q.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2 text-sm">
                {!q.is_hidden && (
                  <button
                    onClick={() => {
                      const reason = window.prompt("Reason for hiding (shown to everyone, optional)");
                      if (reason !== null)
                        void act(() =>
                          rpc("moderate_message", {
                            p_message_id: q.message_id,
                            p_hide: true,
                            p_reason: reason,
                          }),
                        );
                    }}
                    className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white"
                  >
                    Hide
                  </button>
                )}
                <button
                  onClick={() => act(() => rpc("dismiss_reports", { p_message_id: q.message_id }))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5"
                >
                  {q.is_hidden ? "Mark reviewed" : "Keep (dismiss reports)"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h2 className="mb-2 font-semibold text-slate-900">Slow mode</h2>
        <p className="text-sm text-slate-600">
          Minimum seconds between chat messages from the same person (moderators are exempt).
          Currently: <b>{data?.settings?.slow_mode_seconds ?? "…"}s</b>
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            min={0}
            max={600}
            value={slow}
            onChange={(e) => setSlow(e.target.value)}
            placeholder="e.g. 10"
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            disabled={slow === ""}
            onClick={() =>
              act(() => rpc("set_slow_mode", { p_seconds: Number(slow) }), "Slow mode updated.")
            }
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </section>

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h2 className="mb-2 font-semibold text-slate-900">Rotate access code</h2>
        <p className="text-sm text-slate-600">
          Use this if the code leaks outside the class. Everyone (except you) must enter the new
          code; they keep their nicknames. Share the new code in the class group yourself.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="New code (min. 6 characters)"
            autoComplete="off"
            className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm uppercase"
          />
          <button
            disabled={newCode.trim().length < 6}
            onClick={() => {
              if (!window.confirm("Change the code now? All other members will be locked out until they enter it.")) return;
              void act(async () => {
                await rpc("set_access_code", { p_new_code: newCode });
                setNewCode("");
              }, "Access code changed. Share the new code with the class.");
            }}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Change
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-slate-900">Moderation log</h2>
        <p className="mb-2 text-xs text-slate-500">Visible to all moderators.</p>
        <ul className="space-y-1 text-sm">
          {data?.log.map((l, i) => (
            <li key={i} className="text-slate-700">
              <span className="text-slate-400">{timeAgo(l.created_at)}</span> · <b>{l.moderator}</b>{" "}
              {l.action} {l.target}
              {l.reason ? ` (${l.reason})` : ""}
            </li>
          ))}
          {data?.log.length === 0 && <li className="text-slate-500">No actions yet.</li>}
        </ul>
      </section>
    </div>
  );
}
