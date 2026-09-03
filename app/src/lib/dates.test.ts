import { describe, it, expect } from 'vitest';
import { nextClassDays, nextClassDaysFor, monthGrid, dowOf, scheduleSummary } from './api';
describe('nextClassDays + 휴원일', () => {
  it('휴원일은 건너뛴다', () => {
    const sched = [1, 2, 3, 4, 5, 6, 0].map(dow => ({ dow, start: '00:01', end: '23:59' })); // 매일 수업, 오늘은 시작이 지나 제외
    const [d1, d2] = nextClassDays(sched, 2);
    const withClosed = nextClassDays(sched, 2, new Set([d1]));
    expect(withClosed[0]).toBe(d2);
    expect(withClosed).not.toContain(d1);
  });
});
describe('nextClassDaysFor + 반별 휴원', () => {
  it('반마다 자기 휴원만 뺀다', () => {
    const every = (dows: number[]) => dows.map(dow => ({ dow, start: '00:01', end: '23:59' }));
    const A = { id: 'A', name: 'A', schedule: every([1, 2, 3, 4, 5, 6, 0]) };
    const B = { id: 'B', name: 'B', schedule: every([1, 2, 3, 4, 5, 6, 0]) };
    const [d1, d2, d3] = nextClassDays(A.schedule, 3);
    // A 는 d1 휴원, 전체는 d2 휴원 → 결과에 d1 은 B 덕에 남고, d2 는 없다
    const closed = { all: new Set([d2]), byClass: new Map([['A', new Set([d1])]]) };
    const out = nextClassDaysFor([A, B], 3, closed);
    expect(out).toContain(d1); expect(out).not.toContain(d2); expect(out).toContain(d3);
    const onlyA = nextClassDaysFor([A], 2, closed);
    expect(onlyA).not.toContain(d1); expect(onlyA).not.toContain(d2);
  });
});
describe('monthGrid', () => {
  it('월요일 시작, 6주 42칸, 앞뒤는 null, 라벨·이웃 달', () => {
    const g = monthGrid('2026-09');
    expect(g.days.length).toBe(42);
    expect(g.days[0]).toBeNull();          // 2026-09-01 은 화요일 → 월요일 칸은 비움
    expect(g.days[1]).toBe('2026-09-01');
    expect(dowOf(g.days[1]!)).toBe(2);
    expect(g.days[30]).toBe('2026-09-30');
    expect(g.days[31]).toBeNull();
    expect(g.label).toBe('2026년 9월'); expect(g.prev).toBe('2026-08'); expect(g.next).toBe('2026-10');
  });
  it('12월 → 다음 해 1월', () => { const g = monthGrid('2026-12'); expect(g.next).toBe('2027-01'); expect(g.prev).toBe('2026-11'); });
});
describe('scheduleSummary', () => {
  it('시간표가 없으면', () => { expect(scheduleSummary([])).toBe('시간표 없음'); });
  it('요일마다 시간이 같으면 요일을 묶어서', () => {
    const s = [{ dow: 1, start: '19:00', end: '21:00' }, { dow: 3, start: '19:00', end: '21:00' }, { dow: 5, start: '19:00', end: '21:00' }];
    expect(scheduleSummary(s)).toBe('월수금 19:00–21:00');
  });
  it('요일마다 시간이 다르면 요일별로', () => {
    const s = [{ dow: 1, start: '19:00', end: '21:00' }, { dow: 6, start: '10:00', end: '12:00' }];
    expect(scheduleSummary(s)).toBe('월 19:00–21:00 · 토 10:00–12:00');
  });
});
