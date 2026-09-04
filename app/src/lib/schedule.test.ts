import { describe, it, expect } from 'vitest';
import { toGroups, fromGroups, validateGroups, unassignedDows, toggleDow, dowsLabel, type Slot, type Group } from './schedule';

const s = (dow: number, start: string, end: string): Slot => ({ dow, start, end });

describe('toGroups', () => {
  it('시간이 같은 요일은 한 묶음', () => {
    expect(toGroups([s(1, '19:00', '21:00'), s(3, '19:00', '21:00'), s(5, '19:00', '21:00')]))
      .toEqual([{ dows: [1, 3, 5], start: '19:00', end: '21:00' }]);
  });

  it('시간이 다르면 묶음이 갈린다 — 묶음은 이른 요일 순서로', () => {
    expect(toGroups([s(6, '10:00', '12:00'), s(1, '19:00', '21:00'), s(3, '19:00', '21:00')]))
      .toEqual([{ dows: [1, 3], start: '19:00', end: '21:00' }, { dows: [6], start: '10:00', end: '12:00' }]);
  });

  it('일요일은 맨 뒤 — 월→일 순서', () => {
    expect(toGroups([s(0, '10:00', '12:00'), s(1, '10:00', '12:00')])[0].dows).toEqual([1, 0]);
  });

  it("'7:00' 처럼 앞의 0 이 빠진 옛 데이터도 같은 묶음으로 본다", () => {
    expect(toGroups([s(1, '7:00', '9:00'), s(2, '07:00', '09:00')]))
      .toEqual([{ dows: [1, 2], start: '07:00', end: '09:00' }]);
  });

  it('빈 시간표는 묶음이 없다', () => {
    expect(toGroups([])).toEqual([]);
    expect(toGroups(null)).toEqual([]);
  });
});

describe('fromGroups', () => {
  it('묶음을 요일 줄로 펴고 월→일로 정렬', () => {
    expect(fromGroups([{ dows: [6, 0], start: '10:00', end: '12:00' }, { dows: [1, 3], start: '19:00', end: '21:00' }]))
      .toEqual([s(1, '19:00', '21:00'), s(3, '19:00', '21:00'), s(6, '10:00', '12:00'), s(0, '10:00', '12:00')]);
  });

  it('시각을 HH:MM 으로 맞춘다', () => {
    expect(fromGroups([{ dows: [2], start: '7:0', end: '9:5' }])).toEqual([s(2, '07:00', '09:05')]);
  });

  it('요일 없는 묶음은 아무 줄도 만들지 않는다', () => {
    expect(fromGroups([{ dows: [], start: '19:00', end: '21:00' }])).toEqual([]);
  });
});

describe('오가기(round-trip)', () => {
  it('시간표 → 묶음 → 시간표 가 그대로', () => {
    const sched = [s(1, '19:00', '21:00'), s(3, '19:00', '21:00'), s(6, '10:00', '12:00')];
    expect(fromGroups(toGroups(sched))).toEqual(sched);
  });

  it('묶음 → 시간표 → 묶음 이 그대로', () => {
    const g: Group[] = [{ dows: [1, 3, 5], start: '19:00', end: '21:00' }, { dows: [6], start: '10:00', end: '12:00' }];
    expect(toGroups(fromGroups(g))).toEqual(g);
  });

  it('한 요일만 시간을 바꾸면 묶음이 둘로 갈린다', () => {
    const g: Group[] = [{ dows: [1, 3, 5], start: '19:00', end: '21:00' }];
    const split = toGroups(fromGroups(g).map(x => x.dow === 5 ? { ...x, start: '20:00', end: '22:00' } : x));
    expect(split).toEqual([{ dows: [1, 3], start: '19:00', end: '21:00' }, { dows: [5], start: '20:00', end: '22:00' }]);
  });
});

describe('validateGroups', () => {
  const ok: Group[] = [{ dows: [1, 3], start: '19:00', end: '21:00' }];
  it('제대로 된 묶음은 null', () => { expect(validateGroups(ok)).toBeNull(); });
  it('묶음이 없으면 막는다', () => { expect(validateGroups([])).toMatch(/요일/); });
  it('요일을 하나도 안 고르면 막는다', () => { expect(validateGroups([{ dows: [], start: '19:00', end: '21:00' }])).toMatch(/요일/); });
  it('묶음 하나만 비어도 막는다', () => {
    expect(validateGroups([...ok, { dows: [], start: '10:00', end: '12:00' }])).toMatch(/요일을 안 고른/);
  });
  it('끝이 시작보다 이르면 막는다', () => {
    expect(validateGroups([{ dows: [1], start: '21:00', end: '19:00' }])).toMatch(/늦어야/);
  });
  it('시작과 끝이 같아도 막는다', () => {
    expect(validateGroups([{ dows: [1], start: '19:00', end: '19:00' }])).toMatch(/늦어야/);
  });
  it('24:00 · 19:60 같은 시각은 막는다', () => {
    expect(validateGroups([{ dows: [1], start: '19:00', end: '24:00' }])).toMatch(/00:00~23:59/);
    expect(validateGroups([{ dows: [1], start: '19:60', end: '21:00' }])).toMatch(/00:00~23:59/);
  });
  it('한 요일이 두 묶음에 있으면 막는다', () => {
    expect(validateGroups([{ dows: [1, 3], start: '19:00', end: '21:00' }, { dows: [3], start: '10:00', end: '12:00' }]))
      .toMatch(/두 묶음/);
  });
  it("'7:00' 은 저장 전에 맞춰 주니 통과", () => {
    expect(validateGroups([{ dows: [1], start: '7:00', end: '9:00' }])).toBeNull();
  });
});

describe('unassignedDows / toggleDow', () => {
  it('어디에도 안 든 요일만 월→일 순서로', () => {
    expect(unassignedDows([{ dows: [1, 3], start: '19:00', end: '21:00' }])).toEqual([2, 4, 5, 6, 0]);
    expect(unassignedDows([{ dows: [1, 2, 3, 4, 5, 6, 0], start: '19:00', end: '21:00' }])).toEqual([]);
  });

  it('다른 묶음에서 켜면 앞 묶음에서 빠진다', () => {
    const g: Group[] = [{ dows: [1, 3], start: '19:00', end: '21:00' }, { dows: [6], start: '10:00', end: '12:00' }];
    expect(toggleDow(g, 1, 3)).toEqual([{ dows: [1], start: '19:00', end: '21:00' }, { dows: [3, 6], start: '10:00', end: '12:00' }]);
  });

  it('켜진 요일을 다시 누르면 꺼진다 — 다른 묶음은 그대로', () => {
    const g: Group[] = [{ dows: [1, 3], start: '19:00', end: '21:00' }, { dows: [6], start: '10:00', end: '12:00' }];
    expect(toggleDow(g, 0, 3)).toEqual([{ dows: [1], start: '19:00', end: '21:00' }, { dows: [6], start: '10:00', end: '12:00' }]);
  });

  it('원래 배열은 건드리지 않는다', () => {
    const g: Group[] = [{ dows: [1], start: '19:00', end: '21:00' }];
    toggleDow(g, 0, 2);
    expect(g[0].dows).toEqual([1]);
  });
});

describe('dowsLabel', () => {
  it('월→일 순서로 가운뎃점을 찍는다', () => { expect(dowsLabel([5, 1, 3])).toBe('월·수·금'); });
  it('빈 묶음은 빈 글자', () => { expect(dowsLabel([])).toBe(''); });
});
