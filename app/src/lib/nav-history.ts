/* 화면 스택을 브라우저 history 에 실어 두는 곳 — 안드로이드의 하드웨어·제스처 뒤로가기가
   앱을 끄지 않고 앞 화면으로 돌아오게 하는 유일한 방법이다 (설치된 PWA 는 되돌릴 항목이 없으면 그냥 꺼진다).

   한 항목의 state 는 { nav: 스냅숏, k: 번호 } — 시트가 쌓은 항목만 sheet: true 를 더 붙인다.
   주소(?a=slug 등)는 건드리지 않는다: pushState/replaceState 에 url 을 넘기지 않으면 지금 주소가 그대로 남는다.

   k 는 "이 항목을 누가 언제 만들었나" 를 가리는 번호다. 새로 고침하면 history.state 는 남고 모듈은 새로 뜨므로
   0 부터 세면 옛 항목과 번호가 겹친다 — 그래서 Date.now() 에서 시작해 마운트마다 새 번호를 받는다.
   base(이번 마운트가 앉은 항목) 보다 작은 번호는 지난 세션·지난 역할이 남긴 항목이니 뿌리로 취급한다. */

export type NavEntry = { view: string; params: Record<string, string> };
/** 화면 스택 전체 — tab 은 지금 탭의 뿌리, stack 은 그 위에 밀고 올라간 화면들(비었으면 탭 루트). */
export type NavSnap = { tab: string; stack: NavEntry[] };
type HState = { nav?: unknown; k?: unknown; sheet?: unknown };

/* ── 순수 헬퍼 — history 없이도 도는 부분이라 여기만 따로 시험한다 ── */

/** 지금 보이는 화면. 스택이 비면 탭 뿌리다. */
export const curEntry = (s: NavSnap): NavEntry => s.stack.length ? s.stack[s.stack.length - 1] : { view: s.tab, params: {} };
export const pushSnap = (s: NavSnap, view: string, params: Record<string, string> = {}): NavSnap => ({ tab: s.tab, stack: [...s.stack, { view, params }] });
/** 탭을 바꾸면 그 탭의 뿌리에서 다시 시작한다 — 앞서 밀고 올라간 화면들은 버린다. */
export const tabSnap = (tab: string): NavSnap => ({ tab, stack: [] });
export const backSnap = (s: NavSnap): NavSnap => s.stack.length ? { tab: s.tab, stack: s.stack.slice(0, -1) } : s;
/** 탭 뿌리로 — 되돌릴 것이 없을 때(우리 항목 밖으로 나갔을 때) 앉히는 자리. */
export const rootSnap = (s: NavSnap): NavSnap => s.stack.length ? { tab: s.tab, stack: [] } : s;
/** 지금 화면을 갈아끼운다. 뿌리에서 부르면 한 칸짜리 스택이 된다(뒤로가기로 탭 뿌리에 돌아올 수 있게). */
export const replaceSnap = (s: NavSnap, view: string, params: Record<string, string> = {}): NavSnap =>
  ({ tab: s.tab, stack: [...s.stack.slice(0, -1), { view, params }] });

const sameParams = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => a[k] === b[k]);
};
export function sameSnap(a: NavSnap, b: NavSnap): boolean {
  if (a === b) return true;
  if (a.tab !== b.tab || a.stack.length !== b.stack.length) return false;
  return a.stack.every((e, i) => e.view === b.stack[i].view && sameParams(e.params, b.stack[i].params));
}

/** history.state 에서 읽어 온 값은 남이 넣었을 수도 있는 값이다 — 모양이 맞을 때만 스냅숏으로 인정한다. */
export function readSnap(v: unknown): NavSnap | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { tab?: unknown; stack?: unknown };
  if (typeof o.tab !== 'string' || !o.tab || !Array.isArray(o.stack)) return null;
  const stack: NavEntry[] = [];
  for (const raw of o.stack) {
    if (!raw || typeof raw !== 'object') return null;
    const e = raw as { view?: unknown; params?: unknown };
    if (typeof e.view !== 'string' || !e.view) return null;
    const params: Record<string, string> = {};
    if (e.params !== undefined && e.params !== null) {
      if (typeof e.params !== 'object' || Array.isArray(e.params)) return null;
      for (const [k, val] of Object.entries(e.params as Record<string, unknown>)) {
        if (typeof val !== 'string') return null;
        params[k] = val;
      }
    }
    stack.push({ view: e.view, params });
  }
  return { tab: o.tab, stack };
}

/* ── history 배선 ── */

const on = () => typeof window !== 'undefined' && typeof history !== 'undefined';
let k = Date.now();
const nextK = () => ++k;
let base = 0;                       // 이번 마운트가 앉은 항목의 번호
let live: NavSnap | null = null;    // history 에 실어 둔 지금 스냅숏
let applying = false;               // popstate 를 되먹이는 중 — 여기서 history 를 또 건드리지 않는다
let sheetClose: (() => void) | null = null;

/** 확인 시트가 항목에 실어 둘 "지금 화면" — 그 항목으로 돌아와도 화면이 그대로이게. */
export const liveSnap = (): NavSnap => live ?? { tab: '', stack: [] };
export const setLive = (s: NavSnap) => { live = s; };

export function pushHistory(s: NavSnap) {
  live = s;
  if (applying || !on()) return;
  history.pushState({ nav: s, k: nextK() }, '');
}
/** 항목을 늘리지 않고 지금 항목만 고쳐 쓴다 — k(항목의 신분증)는 그대로 둔다. */
export function replaceHistory(s: NavSnap) {
  live = s;
  if (applying || !on()) return;
  const cur = history.state as HState | null;
  history.replaceState({ nav: s, k: typeof cur?.k === 'number' ? cur.k : nextK() }, '');
}
/** 우리가 만든 항목 위에 앉아 있나 — 아니면 history.back() 은 앱 밖으로 나간다. */
export const hasNavEntry = () => on() && !!readSnap((history.state as HState | null)?.nav);
/** 이번 마운트의 첫 항목 — 여기서 더 뒤로 가면 앱이 꺼진다. 링크로 바로 열린 화면이 여기에 앉는다. */
export const atBase = () => !on() || (history.state as HState | null)?.k === base;

export const setSheetClose = (fn: (() => void) | null) => { sheetClose = fn; };
export const atSheetEntry = () => on() && (history.state as HState | null)?.sheet === true;
/** 시트가 열릴 때 항목 하나를 쌓는다 — 뒤로가기가 화면 대신 시트를 닫게. */
export function openSheetEntry(): boolean {
  if (!on()) return false;
  history.pushState({ sheet: true, k: nextK(), nav: liveSnap() }, '');
  return true;
}

/** NavProvider 가 마운트에서 한 번 부른다. apply(null) 은 "우리 항목 밖 — 뿌리로" 라는 뜻. */
export function startHistory(initial: NavSnap, apply: (s: NavSnap | null) => void): () => void {
  live = initial;
  if (!on()) return () => {};
  // 뒤로가기로 돌아온 화면의 스크롤은 우리가 맨 위로 올린다 — 브라우저가 옛 위치를 되살리면 꺾쇠로 돌아올 때와 달라 보인다
  try { history.scrollRestoration = 'manual'; } catch { /* 못 바꾸면 그만 */ }
  base = nextK();
  history.replaceState({ nav: initial, k: base }, '');
  const onPop = (e: PopStateEvent) => {
    const st = (e.state ?? null) as HState | null;
    // 앞으로 가기로 지나간 시트 항목에 들어왔다 — 시트는 되살리지 않고 곧장 되돌린다
    if (st?.sheet === true) { history.back(); return; }
    // 시트가 열린 채 뒤로 → 취소로 닫는다. 이 항목의 스냅숏은 지금 화면과 같으니 화면은 그대로 남는다.
    if (sheetClose) { const c = sheetClose; sheetClose = null; c(); }
    const snap = readSnap(st?.nav);
    const kk = st?.k;
    const mine = snap && typeof kk === 'number' && kk >= base ? snap : null;
    applying = true;
    try { apply(mine); } finally { applying = false; }
  };
  addEventListener('popstate', onPop);
  return () => { removeEventListener('popstate', onPop); sheetClose = null; live = null; };
}
