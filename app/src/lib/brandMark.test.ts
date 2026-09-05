import { describe, it, expect } from 'vitest';
import { brandMark } from './brandMark';

const W = 'a/wordmark.png', WD = 'a/wordmark-dark.png', L = 'a/logo.png';

describe('brandMark', () => {
  it('학원이 없으면(운영자) BRIGHT', () => {
    expect(brandMark(null, false)).toEqual({ kind: 'bright' });
    expect(brandMark(undefined, true)).toEqual({ kind: 'bright' });
  });
  it('밝은 화면 + 가로 로고 → 그 그림(경로 그대로)', () => {
    expect(brandMark({ wordmark: W, wordmarkDark: null, logo: null }, false)).toEqual({ kind: 'img', src: W });
    expect(brandMark({ wordmark: W, wordmarkDark: WD, logo: L }, false)).toEqual({ kind: 'img', src: W });
  });
  it('어두운 화면 + 다크 가로 로고 → 다크 그림', () => {
    expect(brandMark({ wordmark: null, wordmarkDark: WD, logo: null }, true)).toEqual({ kind: 'img', src: WD });
    expect(brandMark({ wordmark: W, wordmarkDark: WD, logo: L }, true)).toEqual({ kind: 'img', src: WD });
  });
  it('어두운 화면인데 밝은 판만 있으면 글자 — 어두운 바닥에 어두운 글자를 올리지 않는다', () => {
    expect(brandMark({ wordmark: W, wordmarkDark: null, logo: null }, true)).toEqual({ kind: 'text' });
    expect(brandMark({ wordmark: W, wordmarkDark: null, logo: L }, true)).toEqual({ kind: 'text' });
  });
  it('밝은 화면인데 다크 판만 있으면 글자', () => {
    expect(brandMark({ wordmark: null, wordmarkDark: WD, logo: null }, false)).toEqual({ kind: 'text' });
    expect(brandMark({ wordmark: null, wordmarkDark: WD, logo: L }, false)).toEqual({ kind: 'text' });
  });
  it('가로 로고가 없고 네모 로고만 있으면 글자(기존 규칙)', () => {
    expect(brandMark({ wordmark: null, wordmarkDark: null, logo: L }, false)).toEqual({ kind: 'text' });
    expect(brandMark({ wordmark: null, wordmarkDark: null, logo: L }, true)).toEqual({ kind: 'text' });
  });
  it('아무것도 없으면 BRIGHT', () => {
    expect(brandMark({ wordmark: null, wordmarkDark: null, logo: null }, false)).toEqual({ kind: 'bright' });
    expect(brandMark({ wordmark: null, wordmarkDark: null, logo: null }, true)).toEqual({ kind: 'bright' });
  });
});
