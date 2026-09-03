import { useCallback, useEffect, useState } from 'react';
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => { setErr(null); return fn().then(setData).catch(e => setErr(e?.message ?? String(e))); }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, err, reload, setData };
}
