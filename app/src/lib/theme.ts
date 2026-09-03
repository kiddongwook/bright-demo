import { useSyncExternalStore } from 'react';
/** 폰이 어두운 화면인가 — 색은 CSS 가 알아서 바꾸고, 여기서는 로고 파일만 갈아 끼운다. */
const QUERY = '(prefers-color-scheme: dark)';
const mq = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null);
const subscribe = (cb: () => void) => {
  const m = mq();
  if (!m) return () => {};
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
/* 수동 지정: localStorage.theme = 'dark' | 'light' 이면 기기 설정보다 우선(html[data-theme]) */
const manual = (): 'dark' | 'light' | null => { try { const v = localStorage.getItem('theme'); return v === 'dark' || v === 'light' ? v : null; } catch { return null; } };
if (typeof document !== 'undefined') { const m = manual(); if (m) document.documentElement.dataset.theme = m; }
const getSnapshot = () => { const m = manual(); return m ? m === 'dark' : (mq()?.matches ?? false); };
export const useDark = (): boolean => useSyncExternalStore(subscribe, getSnapshot, () => false);

/* 학원 강조색 적용 — 어두운 화면에서 거의 검은 강조색(#1C1C1C 등)은 바탕에 묻히므로 밝게 섞어서 쓴다 */
let lastBrand: string | null = null;
const hex = (c: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const lum = ([r, g, b]: number[]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
export function brandFor(color: string, dark: boolean): string {
  const rgb = hex(color);
  if (!rgb || !dark || lum(rgb) > 0.18) return color;
  const mix = rgb.map(v => Math.round(v + (255 - v) * 0.62));
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
}
/* 연한 강조색(--brand-soft): 강조색을 바탕색에 옅게 섞어 만든다 — 어떤 색을 골라도 파랑 잔상이 남지 않게 */
const toHex = (rgb: number[]) => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
export function softFor(color: string, dark: boolean): string | null {
  const rgb = hex(brandFor(color, dark));
  if (!rgb) return null;
  const base = dark ? [27, 28, 31] : [255, 255, 255];
  const t = dark ? 0.22 : 0.12;   // 강조색 비율
  return toHex(rgb.map((v, i) => base[i] + (v - base[i]) * t));
}
export function applyBrand(color: string) {
  lastBrand = color;
  const dark = getSnapshot();
  document.documentElement.style.setProperty('--brand', brandFor(color, dark));
  const soft = softFor(color, dark);
  if (soft) document.documentElement.style.setProperty('--brand-soft', soft);
}
mq()?.addEventListener('change', () => { if (lastBrand) applyBrand(lastBrand); });

/* 미디어 질의 하나를 리액트 상태처럼 읽는다 — useDark 와 같은 방식.
   질의마다 subscribe·getSnapshot 을 캐시해 useSyncExternalStore 가 매번 새 함수를 받지 않게 한다. */
type MediaEntry = { subscribe: (cb: () => void) => () => void; get: () => boolean };
const media = new Map<string, MediaEntry>();
function entryFor(query: string): MediaEntry {
  let e = media.get(query);
  if (!e) {
    const m = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null);
    e = {
      subscribe: cb => { const q = m(); if (!q) return () => {}; q.addEventListener('change', cb); return () => q.removeEventListener('change', cb); },
      get: () => m()?.matches ?? false,
    };
    media.set(query, e);
  }
  return e;
}
export const useMedia = (query: string): boolean => {
  const e = entryFor(query);
  return useSyncExternalStore(e.subscribe, e.get, () => false);
};
