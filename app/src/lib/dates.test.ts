import { describe, it, expect } from 'vitest';
import { nextClassDays, nextClassDaysFor, monthGrid, dowOf, scheduleSummary } from './api';
import { fmtDateLong, fmtTime12, addDays, hm, withEul, hmToMin, normHm, isValidHm } from './dates';
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

/* ── 날짜·시간 글자 (dates.ts) ── */
describe('fmtDateLong', () => {
  it('9월 11일 (금)', () => { expect(fmtDateLong('2026-09-11')).toBe('9월 11일 (금)'); });
  it('앞의 0 은 떼고 쓴다', () => { expect(fmtDateLong('2026-03-03')).toBe('3월 3일 (화)'); });
  it('날짜 꼴이 아니면 빈 글자', () => { expect(fmtDateLong('')).toBe(''); expect(fmtDateLong('내일')).toBe(''); });
  it('없는 날짜를 그럴듯하게 보여 주지 않는다 (INP-47)', () => {
    expect(fmtDateLong('2026-02-30')).toBe(''); expect(fmtDateLong('2026-13-01')).toBe('');
  });
});
describe('addDays', () => {
  it('다음 주 같은 요일', () => { expect(addDays('2026-09-11', 7)).toBe('2026-09-18'); });
  it('달을 넘어간다', () => { expect(addDays('2026-09-30', 2)).toBe('2026-10-02'); });
  it('뒤로도 간다', () => { expect(addDays('2026-01-01', -1)).toBe('2025-12-31'); });
  it('날짜가 아니면 그대로', () => { expect(addDays('', 3)).toBe(''); });
});
describe('fmtTime12', () => {
  it('오후', () => { expect(fmtTime12('19:00')).toBe('오후 7:00'); });
  it('자정은 오전 12시', () => { expect(fmtTime12('00:00')).toBe('오전 12:00'); });
  it('정오는 오후 12시', () => { expect(fmtTime12('12:00')).toBe('오후 12:00'); });
  it('분은 두 자리 그대로', () => { expect(fmtTime12('13:05')).toBe('오후 1:05'); });
  it('오전', () => { expect(fmtTime12('09:30')).toBe('오전 9:30'); });
  it('시간 꼴이 아니면 빈 글자', () => { expect(fmtTime12('')).toBe(''); expect(fmtTime12('저녁')).toBe(''); });
  it('없는 시각은 hmToMin 과 같은 잣대로 거른다 (INP-49)', () => {
    for (const bad of ['19:60', '24:00', '25:00', '7:00', '99:99']) {
      expect(fmtTime12(bad)).toBe('');
      expect(hmToMin(bad)).toBeNull();
    }
  });
});
describe('hm', () => {
  it('두 자리로 맞춘다', () => { expect(hm(9, 0)).toBe('09:00'); expect(hm(21, 30)).toBe('21:30'); });
});
describe('withEul', () => {
  it('받침이 있으면 을', () => { expect(withEul('단어 시험')).toBe('단어 시험을'); });
  it('받침이 없으면 를', () => { expect(withEul('중간고사')).toBe('중간고사를'); });
  it('빈 말은 그대로', () => { expect(withEul('  ')).toBe(''); });
});

describe('normHm · isValidHm', () => {
  it('앞의 0 이 빠진 시각을 맞춘다 (INP-46)', () => {
    expect(normHm('7:00')).toBe('07:00'); expect(normHm('9:5')).toBe('09:05'); expect(normHm('19:00')).toBe('19:00');
  });
  it('시각이 아니면 손대지 않는다', () => { expect(normHm('저녁')).toBe('저녁'); expect(normHm('')).toBe(''); });
  it('00:00~23:59 만 받는다', () => {
    expect(isValidHm('00:00')).toBe(true); expect(isValidHm('23:59')).toBe(true);
    expect(isValidHm('24:00')).toBe(false); expect(isValidHm('19:60')).toBe(false); expect(isValidHm('7:00')).toBe(false);
  });
});
