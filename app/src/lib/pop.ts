import { useCallback, useState } from 'react';

/* 누른 그 자리만 한 번 튀게 하는 표시.
   `.pop` 클래스를 잠깐 붙였다가 animationend 에서 뗀다 — 처음 그릴 때는 안 튄다
   (이미 켜져 있는 표시들이 화면에 들어오자마자 우르르 튀는 것을 막는다).
   움직임 줄이기(prefers-reduced-motion)에서는 애니메이션이 꺼져 있어 클래스만 남고 아무 일도 없다. */
export function usePop() {
  const [key, setKey] = useState<string | null>(null);
  const fire = useCallback((k: string) => setKey(k), []);
  const cls = useCallback((k: string) => (key === k ? ' pop' : ''), [key]);
  const end = useCallback(() => setKey(null), []);
  return { fire, cls, end };
}
