"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./session";
import { errorText } from "./supabase";

/**
 * Load data now, then every `intervalMs` while the tab is visible.
 * Vote counts are only available through database functions (so nobody can
 * see who voted for what), which is why these lists refresh on a timer
 * instead of streaming live.
 */
export function usePolling<T>(loader: () => Promise<T>, intervalMs = 15000) {
  const { refresh: refreshSession } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await loader());
      setError(null);
    } catch (err) {
      const text = errorText(err);
      setError(text);
      if (/join the class/i.test(text)) await refreshSession();
    }
  }, [loader, refreshSession]);

  useEffect(() => {
    const first = window.setTimeout(() => void reload(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload, intervalMs]);

  return { data, error, setError, reload };
}
