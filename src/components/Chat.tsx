"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { errorText, getSupabase, rpc, timeAgo } from "@/lib/supabase";
import type { Message } from "@/lib/types";

const MAX_LEN = 1000;
const REMINDER_KEY = "agv-reminder-ack";

function mergeMessage(list: Message[], m: Message): Message[] {
  const i = list.findIndex((x) => x.id === m.id);
  if (i === -1) return [...list, m].sort((a, b) => a.id - b.id);
  const copy = list.slice();
  copy[i] = m;
  return copy;
}

export default function Chat({ onIssueCreated }: { onIssueCreated: () => void }) {
  const { uid, me, refresh } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const liveRef = useRef(false);
  const lastIdRef = useRef(0);
  const [liveFailed, setLiveFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("messages")
      .select("*")
      .order("id", { ascending: false })
      .limit(300);
    if (error) {
      setError(error.message);
    } else {
      setMessages((data as Message[]).reverse());
    }
    setLoading(false);
  }, []);

  /** Fetch only messages newer than the newest one we already have. */
  const fetchNewer = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("messages")
      .select("*")
      .gt("id", lastIdRef.current)
      .order("id", { ascending: true })
      .limit(200);
    if (!error && data?.length) {
      setMessages((list) => (data as Message[]).reduce(mergeMessage, list));
    }
  }, []);

  useEffect(() => {
    lastIdRef.current = messages.length ? messages[messages.length - 1].id : 0;
  }, [messages]);

  useEffect(() => {
    const supabase = getSupabase();

    // 1. Always load the history straight away, without waiting for the live connection.
    const first = window.setTimeout(() => void load(), 0);

    // 2. Fallback: while there is no live connection (e.g. the free plan's limit of
    //    ~200 live connections is reached, or a weak mobile signal), check for new
    //    messages every 5 seconds. Every 6th check reloads everything so hidden
    //    messages are also picked up. Supabase keeps retrying the live connection.
    let ticks = 0;
    const poll = window.setInterval(() => {
      if (liveRef.current || document.visibilityState !== "visible") return;
      ticks += 1;
      void (ticks % 6 === 0 ? load() : fetchNewer());
    }, 5000);

    const channel = supabase
      .channel("chat-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as Partial<Message>).id;
            setMessages((list) => list.filter((m) => m.id !== oldId));
          } else {
            setMessages((list) => mergeMessage(list, payload.new as Message));
          }
        },
      )
      .subscribe((state) => {
        const isLive = state === "SUBSCRIBED";
        liveRef.current = isLive;
        if (isLive) {
          setLiveFailed(false);
          // Catch up on anything missed before (re)connecting.
          void load();
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          setLiveFailed(true);
        }
      });
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      liveRef.current = false;
      void supabase.removeChannel(channel);
    };
  }, [load, fetchNewer]);

  useEffect(() => {
    const t = window.setTimeout(() => setShowReminder(!localStorage.getItem(REMINDER_KEY)), 0);
    return () => window.clearTimeout(t);
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function handleFailure(err: unknown) {
    const text = errorText(err);
    if (/join the class|row-level security/i.test(text)) await refresh();
    setError(text);
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const { error } = await getSupabase()
      .from("messages")
      .insert({ body, reply_to: replyTo?.id ?? null });
    setSending(false);
    if (error) {
      await handleFailure(error);
      return;
    }
    setDraft("");
    setReplyTo(null);
    stickToBottom.current = true;
    // Show your own message immediately, even without a live connection.
    if (!liveRef.current) void fetchNewer();
  }

  async function report(m: Message) {
    setOpenMenu(null);
    const reason = window.prompt("Why are you reporting this message? (e.g. insult, personal details)");
    if (!reason?.trim()) return;
    try {
      await rpc("report_message", { p_message_id: m.id, p_reason: reason });
      setToast("Thanks. A moderator will review it.");
    } catch (err) {
      await handleFailure(err);
    }
  }

  async function moderate(m: Message, hide: boolean) {
    setOpenMenu(null);
    const reason = hide ? window.prompt("Reason for hiding (shown to everyone, optional)") : null;
    if (hide && reason === null) return;
    try {
      await rpc("moderate_message", { p_message_id: m.id, p_hide: hide, p_reason: reason });
    } catch (err) {
      await handleFailure(err);
    }
  }

  async function reveal(m: Message) {
    setOpenMenu(null);
    try {
      const body = await rpc<string | null>("get_hidden_body", { p_message_id: m.id });
      setRevealed((r) => ({ ...r, [m.id]: body ?? "(original text not found)" }));
    } catch (err) {
      await handleFailure(err);
    }
  }

  async function toIssue(m: Message) {
    setOpenMenu(null);
    const title = window.prompt(
      "Short title for this issue on the board:",
      m.body.length > 80 ? m.body.slice(0, 77) + "…" : m.body,
    );
    if (!title?.trim()) return;
    try {
      await rpc("create_issue", {
        p_title: title,
        p_description: m.body,
        p_source_message_id: m.id,
      });
      setToast("Added to the Issues board.");
      onIssueCreated();
    } catch (err) {
      await handleFailure(err);
    }
  }

  function dismissReminder() {
    localStorage.setItem(REMINDER_KEY, "1");
    setShowReminder(false);
  }

  const byId = new Map(messages.map((m) => [m.id, m]));

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-200 bg-indigo-50 px-4 py-2 text-xs text-indigo-900">
        Criticise the situation, not people. No names of staff or classmates. Be polite: this
        conversation shapes our report.
      </div>
      {liveFailed && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          Live updates are busy right now. New messages will appear every few seconds.
        </div>
      )}

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-4"
        onClick={() => setOpenMenu(null)}
      >
        {loading && <p className="text-center text-sm text-slate-500">Loading conversation…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            No messages yet. Start the conversation.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.session_id === uid;
          const parent = m.reply_to ? byId.get(m.reply_to) : null;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`group relative max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${
                  mine ? "bg-indigo-600 text-white" : "bg-white text-slate-900"
                }`}
              >
                <div
                  className={`mb-0.5 flex items-center gap-2 text-xs ${
                    mine ? "text-indigo-100" : "text-slate-500"
                  }`}
                >
                  <span className="font-semibold">{mine ? "You" : m.nickname}</span>
                  {m.author_is_moderator && (
                    <span
                      className={`rounded px-1 text-[10px] font-semibold uppercase ${
                        mine ? "bg-indigo-500" : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      Mod
                    </span>
                  )}
                  <span>{timeAgo(m.created_at)}</span>
                  <button
                    aria-label="Message actions"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenu(openMenu === m.id ? null : m.id);
                    }}
                    className="ml-auto px-1 font-bold opacity-70 hover:opacity-100"
                  >
                    ⋯
                  </button>
                </div>

                {parent && (
                  <div
                    className={`mb-1 border-l-2 pl-2 text-xs ${
                      mine ? "border-indigo-300 text-indigo-100" : "border-slate-300 text-slate-500"
                    }`}
                  >
                    <span className="font-semibold">{parent.nickname}: </span>
                    {parent.is_hidden ? "(hidden message)" : parent.body.slice(0, 120)}
                  </div>
                )}

                {m.is_hidden ? (
                  <p className={`text-sm italic ${mine ? "text-indigo-100" : "text-slate-400"}`}>
                    Hidden by a moderator{m.hidden_reason ? `: ${m.hidden_reason}` : "."}
                    {revealed[m.id] && (
                      <span className="mt-1 block not-italic text-slate-600">
                        Original: {revealed[m.id]}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                )}

                {openMenu === m.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-7 z-10 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm text-slate-800 shadow-lg"
                  >
                    {!m.is_hidden && (
                      <MenuItem
                        onClick={() => {
                          setReplyTo(m);
                          setOpenMenu(null);
                        }}
                      >
                        Reply
                      </MenuItem>
                    )}
                    {!m.is_hidden && <MenuItem onClick={() => toIssue(m)}>Add to Issues board</MenuItem>}
                    {!mine && !m.is_hidden && <MenuItem onClick={() => report(m)}>Report</MenuItem>}
                    {me?.is_moderator &&
                      (m.is_hidden ? (
                        <>
                          <MenuItem onClick={() => reveal(m)}>View original</MenuItem>
                          <MenuItem onClick={() => moderate(m, false)}>Unhide</MenuItem>
                        </>
                      ) : (
                        <MenuItem onClick={() => moderate(m, true)} danger>
                          Hide message
                        </MenuItem>
                      ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow">
          {toast}
        </div>
      )}

      <div className="border-t border-slate-200 bg-white p-3">
        {showReminder && (
          <div className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            <p className="flex-1">
              Before you post: your nickname hides your name, but details like your exact
              course, room or personal story can still identify you. Share only what you are
              comfortable with.
            </p>
            <button onClick={dismissReminder} className="font-semibold underline">
              Got it
            </button>
          </div>
        )}
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
            <span className="flex-1 truncate">
              Replying to <b>{replyTo.nickname}</b>: {replyTo.body}
            </span>
            <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="px-1">
              ✕
            </button>
          </div>
        )}
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Write a message…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            className="h-11 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
        {draft.length > MAX_LEN - 100 && (
          <p className="mt-1 text-right text-xs text-slate-400">
            {draft.length}/{MAX_LEN}
          </p>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-2 text-left hover:bg-slate-100 ${danger ? "text-red-600" : ""}`}
    >
      {children}
    </button>
  );
}
