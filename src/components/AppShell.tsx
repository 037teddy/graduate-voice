"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/lib/session";
import Chat from "./Chat";
import IssuesBoard from "./IssuesBoard";
import Polls from "./Polls";
import ModPanel from "./ModPanel";

type Tab = "chat" | "issues" | "polls" | "moderate";

export default function AppShell() {
  const { me } = useSession();
  const [tab, setTab] = useState<Tab>("chat");

  const tabs: { id: Tab; label: string }[] = [
    { id: "chat", label: "Chat" },
    { id: "issues", label: "Issues" },
    { id: "polls", label: "Polls" },
    ...(me?.is_moderator ? [{ id: "moderate" as Tab, label: "Moderate" }] : []),
  ];

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Anonymous Graduate Voice</p>
          <p className="text-xs text-slate-500">
            You are <span className="font-medium text-slate-700">{me?.nickname}</span>
            {me?.is_moderator && (
              <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                Moderator
              </span>
            )}
          </p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link href="/report" className="font-medium text-indigo-700 hover:underline">
            Report
          </Link>
          <Link href="/privacy" className="text-slate-500 hover:underline">
            Privacy
          </Link>
        </nav>
      </header>

      <div className="flex border-b border-slate-200 bg-white" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-sm font-medium ${
              tab === t.id
                ? "border-b-2 border-indigo-600 text-indigo-700"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
        {/* Chat stays mounted so the live connection and scroll position survive tab switches */}
        <div className={tab === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <Chat onIssueCreated={() => setTab("issues")} />
        </div>
        {tab === "issues" && <IssuesBoard />}
        {tab === "polls" && <Polls />}
        {tab === "moderate" && me?.is_moderator && <ModPanel />}
      </div>
    </div>
  );
}
