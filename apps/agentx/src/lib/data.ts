import { useCallback, useEffect, useState } from "react";
import { subscribe } from "@/db";

/** Runs an async query and re-runs it after any database write (and every minute, so "overdue" stays fresh). */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): { data: T | undefined; reload: () => Promise<void>; loading: boolean } {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await run());
    } finally {
      setLoading(false);
    }
  }, [run]);
  useEffect(() => {
    let alive = true;
    const load = () => void run().then((d) => alive && (setData(d), setLoading(false)));
    load();
    const unsub = subscribe(load);
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      unsub();
      clearInterval(timer);
    };
  }, [run]);
  return { data, reload, loading };
}

/** Current time, refreshed every minute. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
