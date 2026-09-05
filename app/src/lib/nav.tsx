import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { atBase, backSnap, curEntry, hasNavEntry, pushHistory, pushSnap, replaceHistory, replaceSnap, rootSnap, sameSnap, setLive, startHistory, tabSnap, type NavEntry, type NavSnap } from './nav-history';

export type Role = 'director' | 'teacher' | 'parent' | 'student' | 'operator';
export const TABS: Record<Role, string[]> = {
  director: ['today', 'notice', 'inbox', 'more'],
  teacher: ['today', 'notice', 'inbox', 'more'],
  parent: ['child', 'notice', 'ask', 'more'],
  student: ['me', 'notice', 'more'],
  operator: ['op-home', 'op-settings'],   // BRIGHT 운영자 — 학원 · 설정 둘뿐
};
export const TABMETA: Record<string, [string, 'list' | 'notice' | 'chat' | 'house']> = {
  today: ['홈', 'list'], child: ['우리 아이', 'list'], me: ['나', 'list'],
  notice: ['공지', 'notice'], inbox: ['문의', 'chat'], ask: ['문의', 'chat'], more: ['더보기', 'house'],
  'op-home': ['학원', 'list'], 'op-settings': ['설정', 'house'],
};
/* 진입 화면 제목 [제목, 오른쪽] */
export const TITLE: Record<string, [string, string]> = {
  'notice-new': ['공지 쓰기', ''], readers: ['읽은 사람', ''], answer: ['문의', ''], faq: ['자주 묻는 질문', '관리'],
  roster: ['명부', '반별'], academy: ['우리 학원', ''], makeup: ['결석 신청', '보강'], noti: ['알림', ''],
  'notice-view': ['공지', ''], 'ask-new': ['직접 문의하기', ''], 'ask-mine': ['내 문의', ''], absence: ['결석 미리 알리기', ''], install: ['홈 화면에 추가', ''],
  student: ['학생', ''], 'student-edit': ['학생', '편집'], teachers: ['강사', ''], calendar: ['휴원일·특강', ''], classes: ['반·시간표', ''],
  stats: ['반별 출결표', ''], import: ['명부 CSV 올리기', ''], 'child-month': ['이번 달', ''], about: ['앱 정보·진단', ''], prefs: ['알림 설정', ''],
  todos: ['이번 주 할 것', '관리'],
  billing: ['수강료', ''], 'billing-settings': ['수강료 설정', ''],
  /* BRIGHT 운영 */
  'op-home': ['BRIGHT', ''], 'op-academy': ['학원', ''], 'op-new': ['학원 만들기', ''], 'op-settings': ['운영 설정', ''],
};

/* 넓은 화면에서 폰 틀을 벗고 대시보드로 펼칠 관리 화면들 — App 이 body.wide 를 붙였다 뗀다 */
export const WIDE_VIEWS = new Set(['stats', 'roster', 'student', 'student-edit', 'import', 'todos', 'calendar', 'classes', 'teachers', 'readers', 'inbox', 'answer', 'billing', 'op-home', 'op-academy']);

type Nav ={ view: string; params: Record<string, string>; isTab: boolean; tabBase: string; limited: boolean; tab: (n: string) => void; push: (n: string, p?: Record<string, string>) => void; back: () => void; replace: (n: string, p?: Record<string, string>) => void };
const C = createContext<Nav>(null!);

/* 진입 화면이 속한 탭 — 링크로 바로 열었을 때 뒤로가기·탭 표시에 쓴다 */
const PARENT_TAB: Record<string, string> = { 'notice-view': 'notice', 'notice-new': 'notice', readers: 'notice', answer: 'inbox', faq: 'inbox', 'ask-new': 'ask', 'ask-mine': 'ask', absence: 'child', makeup: 'today', roster: 'more', academy: 'more', install: 'more', noti: 'more', student: 'more', 'student-edit': 'more', teachers: 'more', calendar: 'more', classes: 'more', stats: 'more', import: 'more', 'child-month': 'child', about: 'more', prefs: 'more', todos: 'today', billing: 'more', 'billing-settings': 'more', 'op-academy': 'op-home', 'op-new': 'op-home' };

export function NavProvider({ role, initial: init, limited = false, children }: { role: Role; initial?: { view: string; params?: Record<string, string> }; limited?: boolean; children: ReactNode }) {
  const first = TABS[role][0];
  const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
  const initial = init?.view ?? (h && (TABS[role].includes(h) || TITLE[h]) ? h : first);
  const home = TABS[role].includes(initial) ? initial : (PARENT_TAB[initial] && TABS[role].includes(PARENT_TAB[initial]) ? PARENT_TAB[initial] : first);
  // 화면 스택 전체를 한 덩어리(스냅숏)로 들고 다닌다 — 그대로 history 항목에 실어 두려고
  const [snap, setSnap] = useState<NavSnap>(() => TABS[role].includes(initial)
    ? tabSnap(initial)
    : { tab: home, stack: [{ view: initial, params: init?.params ?? {} }] });
  // ref 로도 들고 있는다: 한 틱에 두 번 옮겨도(저장 → 뒤로) 앞의 결과 위에서 움직이게, popstate 가 최신 값을 보게.
  // 옮기는 자리마다 ref 를 먼저 고쳐 두므로, 아래 effect 는 뒤늦게 맞춰 두는 안전장치다.
  const snapRef = useRef(snap);
  const cfg = useRef({ role, home, limited });
  useEffect(() => { snapRef.current = snap; cfg.current = { role, home, limited }; });

  const go = (next: NavSnap, mode: 'push' | 'replace') => {
    if (sameSnap(snapRef.current, next)) return;   // 같은 자리로 또 가면 항목을 늘리지 않는다 (탭바에서 지금 탭 누르기)
    snapRef.current = next; setSnap(next);
    (mode === 'push' ? pushHistory : replaceHistory)(next);
  };

  // 마운트에 지금 스냅숏을 history 에 깔고 뒤로가기를 듣는다. NavProvider 는 세션·역할이 바뀌면 key 로 새로 뜨므로
  // 이 replaceState 가 곧 "지난 세션의 항목이 이 자리에 남지 않게" 하는 손질이기도 하다.
  useEffect(() => startHistory(snapRef.current, s => {
    const c = cfg.current;
    // 남의 역할·지난 세션이 남긴 스냅숏은 받지 않는다. 제한 세션은 들어온 탭 밖으로 나가지 않는다.
    const ok = s && TABS[c.role].includes(s.tab) && (!c.limited || s.tab === c.home) ? s : null;
    const next = ok ?? rootSnap(snapRef.current);   // 우리 항목 밖으로 나갔다 → 탭 뿌리
    setLive(next);
    if (sameSnap(snapRef.current, next)) return;
    snapRef.current = next; setSnap(next);
  }), []);

  const cur: NavEntry = curEntry(snap);
  const isTab = TABS[role].includes(cur.view);
  const tabBase = snap.tab;
  // 제한 세션(링크로 열림)은 들어온 탭 밖으로 나가지 않는다 — 전체 기능은 번호로 들어와서
  const tab = (n: string) => { if (cfg.current.limited && n !== cfg.current.home) return; go(tabSnap(n), 'push'); };
  const push = (n: string, p: Record<string, string> = {}) => go(pushSnap(snapRef.current, n, p), 'push');
  const replace = (n: string, p: Record<string, string> = {}) => go(replaceSnap(snapRef.current, n, p), 'replace');
  // 앱 안의 뒤로(앱바 꺾쇠·취소·저장 뒤)도 history 를 되돌린다 — 제스처 뒤로가기와 같은 길로 가야 항목이 어긋나지 않는다.
  // 링크로 바로 열린 화면은 우리 첫 항목에 앉아 있어서, 여기서 history.back() 하면 앱이 꺼진다 → 그때만 제자리에서 되돌린다.
  const back = () => {
    if (!snapRef.current.stack.length) return;
    if (hasNavEntry() && !atBase()) { history.back(); return; }
    go(backSnap(snapRef.current), 'replace');
  };
  return <C.Provider value={{ view: cur.view, params: cur.params, isTab, tabBase, limited, tab, push, back, replace }}>{children}</C.Provider>;
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
  if (v === 'billing') return { view: role === 'parent' || role === 'student' ? 'child' : 'billing', params: {} };   // 0028 자동 발행·안내 → 원장 수강료 화면
  return null;
}
