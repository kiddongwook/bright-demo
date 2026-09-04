import { describe, it, expect } from 'vitest';
import { hmToMin, kstNowMin, pickInitialClass } from './attendance';
import type { Cls } from './api';

const MON = 1, TUE = 2;
const cls = (id: string, ...slots: [number, string, string][]): Cls =>
  ({ id, name: id, schedule: slots.map(([dow, start, end]) => ({ dow, start, end })) });
const at = (h: number, m = 0) => h * 60 + m;

describe('hmToMin', () => {
  it('HH:MM 을 분으로 바꾼다', () => {
    expect(hmToMin('00:00')).toBe(0);
    expect(hmToMin('19:30')).toBe(19 * 60 + 30);
    expect(hmToMin('09:05')).toBe(545);
  });
  it('모양이 아니면 null', () => {
    expect(hmToMin('')).toBeNull();
    expect(hmToMin(undefined)).toBeNull();
    expect(hmToMin('24:00')).toBeNull();
    expect(hmToMin('19:60')).toBeNull();
    expect(hmToMin('19시')).toBeNull();
    expect(hmToMin('25:00')).toBeNull();
    expect(hmToMin('9:05')).toBeNull();   // 앞의 0 이 없으면 시각이 아니다 — 들어올 때 normHm 이 맞춰 준다
  });
});

describe('kstNowMin', () => {
  it('한국 시간 자정부터 분', () => {
    expect(kstNowMin(Date.parse('2026-09-08T10:00:00Z'))).toBe(at(19));   // 19:00 KST
    expect(kstNowMin(Date.parse('2026-09-08T15:00:00Z'))).toBe(0);        // 자정 KST
  });
});

describe('pickInitialClass', () => {
  const a = cls('a', [MON, '19:00', '21:00']);
  const b = cls('b', [MON, '21:00', '23:00']);
  const c = cls('c', [TUE, '10:00', '12:00']);

  it('반이 없으면 undefined', () => {
    expect(pickInitialClass([], MON, at(19))).toBeUndefined();
  });
  it('수업 중인 반을 고른다', () => {
    expect(pickInitialClass([c, b, a], MON, at(19, 30))?.id).toBe('a');
    expect(pickInitialClass([c, b, a], MON, at(21, 30))?.id).toBe('b');
  });
  it('수업 마지막 30분에도 그 반이 그대로 남는다', () => {
    expect(pickInitialClass([a, b], MON, at(20, 45))?.id).toBe('a');
  });
  it('시작 30분 전이면 미리 그 반을 잡는다', () => {
    expect(pickInitialClass([b, a], MON, at(18, 35))?.id).toBe('a');
  });
  it('아직 이르면 오늘 남은 수업 중 가장 이른 반', () => {
    expect(pickInitialClass([b, a], MON, at(9))?.id).toBe('a');
    expect(pickInitialClass([b, c], MON, at(9))?.id).toBe('b');
  });
  it('오늘 수업이 다 끝났으면 첫 번째 반', () => {
    expect(pickInitialClass([a, b], MON, at(23, 30))?.id).toBe('a');
    expect(pickInitialClass([b, a], MON, at(23, 30))?.id).toBe('b');
  });
  it('오늘 수업이 아예 없으면 첫 번째 반', () => {
    expect(pickInitialClass([c, a], TUE + 1, at(19))?.id).toBe('c');
  });
  it('시간표가 망가진 반은 건너뛴다', () => {
    const bad = cls('bad', [MON, '', '21:00']);
    expect(pickInitialClass([bad, a], MON, at(19, 30))?.id).toBe('a');
    expect(pickInitialClass([bad], MON, at(19, 30))?.id).toBe('bad');   // 고를 게 없으면 첫 번째 반
  });
  it('한 반에 오늘 두 타임이면 지금 하는 타임을 본다', () => {
    const twice = cls('t', [MON, '10:00', '12:00'], [MON, '19:00', '21:00']);
    expect(pickInitialClass([a, twice], MON, at(10, 30))?.id).toBe('t');
  });
});
