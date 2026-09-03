import { useCallback, useEffect, useState } from 'react';
/* 화면 하나의 읽기: data · err · loading(첫 응답 전과 reload 도는 동안) · reload */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setErr(null); setLoading(true);
    return fn().then(setData).catch(e => setErr(e?.message ?? String(e))).finally(() => setLoading(false));
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, err, loading, reload, setData };
}
