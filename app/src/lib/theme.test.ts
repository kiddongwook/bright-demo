// 화면 설정의 순수 부분 — vitest 는 node 환경이라 localStorage·document·window 를 흉내 내서 붙인다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear() };
}
const dataset: Record<string, string> = {};
const listeners: Record<string, (() => void)[]> = {};
vi.stubGlobal('localStorage', fakeStorage());
vi.stubGlobal('document', { documentElement: { dataset, style: { setProperty() {} } } });
vi.stubGlobal('window', {
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener: (k: string, cb: () => void) => { (listeners[k] ??= []).push(cb); },
  removeEventListener() {},
  dispatchEvent: (e: { type: string }) => { (listeners[e.type] ?? []).forEach(cb => cb()); return true; },
});
const theme = await import('./theme');

describe('theme prefs', () => {
  beforeEach(() => { localStorage.clear(); for (const k of Object.keys(dataset)) delete dataset[k]; });

  it('parse — 모르는 값은 기본으로', () => {
    expect(theme.parseTextScale(null)).toBe('normal');
    expect(theme.parseTextScale('huge')).toBe('normal');
    expect(theme.parseTextScale('large')).toBe('large');
    expect(theme.parseThemePref(null)).toBe('system');
    expect(theme.parseThemePref('blue')).toBe('system');
    expect(theme.parseThemePref('dark')).toBe('dark');
  });

  it('글자 크기 — 저장값과 data-text 가 같이 움직인다', () => {
    theme.setTextScale('large');
    expect(localStorage.getItem('text')).toBe('large');
    expect(dataset.text).toBe('large');
    expect(theme.getTextScale()).toBe('large');
    theme.setTextScale('normal');
    expect(localStorage.getItem('text')).toBeNull();
    expect(dataset.text).toBeUndefined();
    expect(theme.getTextScale()).toBe('normal');
  });

  it('applyTextScale — 저장된 값으로 부팅', () => {
    localStorage.setItem('text', 'large');
    theme.applyTextScale();
    expect(dataset.text).toBe('large');
    localStorage.removeItem('text');
    theme.applyTextScale();
    expect(dataset.text).toBeUndefined();
  });

  it('테마 — 기기 따라는 둘 다 지우고, 밝게·어둡게는 둘 다 쓴다 + theme-changed 이벤트', () => {
    let fired = 0;
    window.addEventListener('theme-changed', () => { fired++; });
    theme.setThemePref('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(dataset.theme).toBe('dark');
    expect(theme.getThemePref()).toBe('dark');
    theme.setThemePref('light');
    expect(dataset.theme).toBe('light');
    theme.setThemePref('system');
    expect(localStorage.getItem('theme')).toBeNull();
    expect(dataset.theme).toBeUndefined();
    expect(theme.getThemePref()).toBe('system');
    expect(fired).toBe(3);
  });
});
