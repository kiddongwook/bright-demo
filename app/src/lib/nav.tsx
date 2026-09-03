import { createContext, useContext, useState, type ReactNode } from 'react';

export type Role = 'director' | 'teacher' | 'parent' | 'student';
export const TABS: Record<Role, string[]> = {
  director: ['today', 'notice', 'inbox', 'more'],
  teacher: ['today', 'notice', 'inbox', 'more'],
  parent: ['child', 'notice', 'ask', 'more'],
  student: ['me', 'notice', 'more'],
};
export const TABMETA: Record<string, [string, 'list' | 'notice' | 'chat' | 'house']> = {
  today: ['오늘', 'list'], child: ['우리 아이', 'list'], me: ['나', 'list'],
  notice: ['공지', 'notice'], inbox: ['문의', 'chat'], ask: ['문의', 'chat'], more: ['더보기', 'house'],
};
/* 진입 화면 제목 [제목, 오른쪽] */
export const TITLE: Record<string, [string, string]> = {
  'notice-new': ['공지 쓰기', ''], readers: ['읽은 사람', ''], answer: ['문의', ''], faq: ['자주 묻는 질문', '관리'],
  roster: ['명부', '반별'], academy: ['우리 학원', ''], makeup: ['결석 신청', '보강'], noti: ['알림', ''],
  'notice-view': ['공지', ''], 'ask-new': ['직접 문의하기', ''], 'ask-mine': ['내 문의', ''], absence: ['결석 미리 알리기', ''],
};

type Entry = { view: string; params: Record<string, string> };
type Nav = { view: string; params: Record<string, string>; isTab: boolean; tabBase: string; tab: (n: string) => void; push: (n: string, p?: Record<string, string>) => void; back: () => void; replace: (n: string, p?: Record<string, string>) => void };
const C = createContext<Nav>(null!);

export function NavProvider({ role, children }: { role: Role; children: ReactNode }) {
  const first = TABS[role][0];
  const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
  const initial = h && (TABS[role].includes(h) || TITLE[h]) ? h : first;
  const [cur, setCur] = useState<Entry>({ view: initial, params: {} });
  const [hist, setHist] = useState<Entry[]>(TABS[role].includes(initial) ? [] : [{ view: first, params: {} }]);
  const isTab = TABS[role].includes(cur.view);
  const tabBase = hist.length ? hist[0].view : cur.view;
  const tab = (n: string) => { setHist([]); setCur({ view: n, params: {} }); };
  const push = (n: string, p: Record<string, string> = {}) => { setHist(x => [...x, cur]); setCur({ view: n, params: p }); };
  const replace = (n: string, p: Record<string, string> = {}) => setCur({ view: n, params: p });
  const back = () => { const prev = hist[hist.length - 1]; setHist(x => x.slice(0, -1)); setCur(prev ?? { view: first, params: {} }); };
  return <C.Provider value={{ view: cur.view, params: cur.params, isTab, tabBase, tab, push, back, replace }}>{children}</C.Provider>;
}
export const useNav = () => useContext(C);

export const ICON: Record<string, string> = {
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
  notice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9v6h3l6 4V5L8 9z"/><path d="M17 9.5a3.5 3.5 0 0 1 0 5"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v10H9l-5 4z"/></svg>',
  house: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V9.6L12 4l8 5.6V20"/><path d="M15 6.5V4h2v4"/></svg>',
};

/* 알림 link → 화면. '<view>:<id>' */
export function linkToNav(link: string | null, role: Role): { view: string; params: Record<string, string> } | null {
  if (!link) return null;
  const [v, id] = link.split(':');
  const p: Record<string, string> = id ? { id } : {};
  if (v === 'notice-view') return { view: 'notice-view', params: p };
  if (v === 'inbox') return role === 'parent' ? { view: 'ask-mine', params: p } : { view: 'answer', params: p };
  if (v === 'ask-mine') return { view: 'ask-mine', params: p };
  if (v === 'today') return { view: role === 'parent' ? 'child' : 'today', params: {} };
  if (v === 'child') return { view: 'child', params: {} };
  if (v === 'me') return { view: 'me', params: {} };
  return null;
}
