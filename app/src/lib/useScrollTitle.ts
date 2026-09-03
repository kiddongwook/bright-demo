import { useLayoutEffect, useState } from 'react';

/* 큰 제목 → 작은 제목 전환.
   .view 가 스크롤 통(overflow-y:auto)이라, 그것을 root 로 잡고 화면 위 큰 제목(.head .hello)을 지켜본다.
   제목이 위로 지나가면 scrolled 가 true 가 되고, 앱바가 title 을 17px 로 띄운다.
   화면이 바뀌면(key) 처음부터 다시 — 로딩 뒤에 제목이 나타나는 화면도 있어 MutationObserver 로 다시 붙는다. */

export type ScrollTitle = { title: string; scrolled: boolean };
const NONE: ScrollTitle = { title: '', scrolled: false };

export function useScrollTitle(key: string): ScrollTitle {
  const [st, setSt] = useState<ScrollTitle>(NONE);
  useLayoutEffect(() => {
    setSt(NONE);
    const root = document.querySelector<HTMLElement>('.app > .view') ?? document.querySelector<HTMLElement>('.view');
    if (!root || typeof IntersectionObserver === 'undefined') return;
    let io: IntersectionObserver | null = null;
    let seen: HTMLElement | null = null; let seenTitle = '';
    const attach = () => {
      const el = root.querySelector<HTMLElement>('.head .hello');
      const title = el ? (el.textContent ?? '').trim() : '';
      if (el === seen && title === seenTitle) return;   // 제목 글자가 늦게 채워지는 화면도 따라간다
      seen = el; seenTitle = title;
      io?.disconnect(); io = null;
      if (!el) { setSt(NONE); return; }
      setSt(s => ({ title, scrolled: s.scrolled }));
      io = new IntersectionObserver(([e]) => {
        const scrolled = !e.isIntersecting;
        setSt(s => (s.title === title && s.scrolled === scrolled ? s : { title, scrolled }));
      }, { root, threshold: 0 });
      io.observe(el);
    };
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); io?.disconnect(); };
  }, [key]);
  return st;
}
