"use client";

import AppShell from "@/components/AppShell";
import JoinScreen from "@/components/JoinScreen";
import { useSession } from "@/lib/session";

export default function Home() {
  const { status } = useSession();
  if (status === "loading") {
    return <p className="m-auto text-sm text-slate-500">Loading…</p>;
  }
  return status === "ready" ? <AppShell /> : <JoinScreen />;
}
