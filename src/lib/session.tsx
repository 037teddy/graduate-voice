"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabase, isConfigured, rpc } from "./supabase";
import type { Me } from "./types";

type Status = "loading" | "not_configured" | "needs_code" | "ready";

type SessionContextValue = {
  status: Status;
  me: Me | null;
  uid: string | null;
  /** True when this device had joined before but the access code was changed. */
  codeChanged: boolean;
  join: (code: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [codeChanged, setCodeChanged] = useState(false);

  const refresh = useCallback(async () => {
    if (!isConfigured()) {
      setStatus("not_configured");
      return;
    }
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setMe(null);
      setUid(null);
      setStatus("needs_code");
      return;
    }
    setUid(data.session.user.id);
    try {
      const current = await rpc<Me | null>("my_session");
      setMe(current);
      setCodeChanged(Boolean(current && !current.active));
      setStatus(current?.active ? "ready" : "needs_code");
    } catch {
      setStatus("needs_code");
    }
  }, []);

  useEffect(() => {
    // Initial load, deferred so no state is set synchronously inside the effect.
    const t = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  const join = useCallback(async (code: string) => {
    const supabase = getSupabase();
    let { data } = await supabase.auth.getSession();
    if (!data.session) {
      const res = await supabase.auth.signInAnonymously();
      if (res.error) throw new Error(res.error.message);
      ({ data } = await supabase.auth.getSession());
    }
    const joined = await rpc<Me>("join_class", { code });
    setUid(data.session?.user.id ?? null);
    setMe(joined);
    setCodeChanged(false);
    setStatus("ready");
  }, []);

  const value = useMemo(
    () => ({ status, me, uid, codeChanged, join, refresh }),
    [status, me, uid, codeChanged, join, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
