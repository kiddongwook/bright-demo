import { describe, it, expect } from 'vitest';
import { isScheduled, fmtPublishAt, toPublishAt, publishAtParts, defaultScheduleAt, scheduleProblem, sortWithScheduled, humanizeScheduleError } from './noticeSchedule';

/* 2026-09-05 (토) 12:00 KST 를 '지금' 으로 고정한다 — 기기 시간대와 무관하게 같은 답이 나와야 한다 */
const NOW = Date.parse('2026-09-05T12:00:00+09:00');

describe('isScheduled', () => {
  it('나갈 시각이 미래이고 아직 안 나갔으면 예약', () => {
    expect(isScheduled({ publish_at: '2026-09-06T08:00:00+09:00', fanned_at: null }, NOW)).toBe(true);
  });
  it('이미 나갔으면(fanned_at) 시각이 미래라도 예약이 아니다', () => {
    expect(isScheduled({ publish_at: '2026-09-06T08:00:00+09:00', fanned_at: '2026-09-05T11:00:00+09:00' }, NOW)).toBe(false);
  });
  it('시각이 지났으면 예약이 아니다(크론이 곧 뿌린다)', () => {
    expect(isScheduled({ publish_at: '2026-09-05T11:59:00+09:00', fanned_at: null }, NOW)).toBe(false);
  });
  it('칸이 없으면(옛 select) false', () => {
    expect(isScheduled({}, NOW)).toBe(false);
    expect(isScheduled({ publish_at: null }, NOW)).toBe(false);
  });
});

describe('fmtPublishAt', () => {
  it('한국 시각으로 "9/6 (일) 08:00"', () => {
    expect(fmtPublishAt('2026-09-06T08:00:00+09:00')).toBe('9/6 (일) 08:00');
    expect(fmtPublishAt('2026-09-05T23:00:00Z')).toBe('9/6 (일) 08:00');   /* UTC 23시 = 다음날 08시 KST */
  });
  it('자정 넘김·한 자리 달', () => {
    expect(fmtPublishAt('2026-01-01T00:05:00+09:00')).toBe('1/1 (목) 00:05');
  });
  it('시각이 아니면 빈 글자', () => {
    expect(fmtPublishAt('')).toBe(''); expect(fmtPublishAt(null)).toBe(''); expect(fmtPublishAt('abc')).toBe('');
  });
});

describe('toPublishAt', () => {
  it('날짜 칸 + 시간 칸을 한국 시각 Date 로', () => {
    expect(toPublishAt('2026-09-06', '08:00')?.toISOString()).toBe('2026-09-05T23:00:00.000Z');
  });
  it('모양이 아니면 null', () => {
    expect(toPublishAt('', '08:00')).toBeNull();
    expect(toPublishAt('2026-02-30', '08:00')).toBeNull();
    expect(toPublishAt('2026-09-06', '8:00')).toBeNull();
    expect(toPublishAt('2026-09-06', '24:00')).toBeNull();
  });
  it('fmtPublishAt 과 되돌아온다', () => {
    expect(fmtPublishAt(toPublishAt('2026-09-06', '08:00')!.toISOString())).toBe('9/6 (일) 08:00');
  });
});

describe('publishAtParts', () => {
  it('나갈 시각을 한국 날짜·시간 칸으로', () => {
    expect(publishAtParts('2026-09-05T23:00:00Z')).toEqual({ date: '2026-09-06', hm: '08:00' });
    expect(publishAtParts('2026-09-06T08:30:00+09:00')).toEqual({ date: '2026-09-06', hm: '08:30' });
  });
  it('시각이 아니면 기본값(내일 08:00)', () => {
    expect(publishAtParts(null)).toEqual(defaultScheduleAt());
  });
});

describe('defaultScheduleAt', () => {
  it('내일 08:00 (한국 날짜 꼴)', () => {
    const d = defaultScheduleAt();
    expect(d.hm).toBe('08:00');
    expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const tomorrow = new Date(Date.now() + 9 * 3600e3 + 86400e3).toISOString().slice(0, 10);
    expect(d.date).toBe(tomorrow);
  });
});

describe('scheduleProblem', () => {
  it('지금보다 뒤, 90일 안이면 문제 없음', () => {
    expect(scheduleProblem(new Date(NOW + 3600e3), NOW)).toBeNull();
    expect(scheduleProblem(new Date(NOW + 89 * 86400e3), NOW)).toBeNull();
  });
  it('지난 시각·같은 시각은 막는다', () => {
    expect(scheduleProblem(new Date(NOW), NOW)).toBe('지금보다 뒤의 시간을 골라 주세요');
    expect(scheduleProblem(new Date(NOW - 60e3), NOW)).toBe('지금보다 뒤의 시간을 골라 주세요');
  });
  it('90일 넘으면 막는다(서버 bad_time 과 같은 금)', () => {
    expect(scheduleProblem(new Date(NOW + 91 * 86400e3), NOW)).toBe('예약은 90일 안까지만 돼요');
  });
  it('비었거나 깨진 시각', () => {
    expect(scheduleProblem(null, NOW)).toBe('날짜와 시간을 골라 주세요');
    expect(scheduleProblem(new Date(NaN), NOW)).toBe('날짜와 시간을 골라 주세요');
  });
});

describe('sortWithScheduled', () => {
  it('예약이 위로(이른 것부터), 나머지는 원래 차례', () => {
    const list = [
      { id: 'a', publish_at: '2026-09-05T10:00:00+09:00', fanned_at: '2026-09-05T10:00:00+09:00' },
      { id: 'b', publish_at: '2026-09-08T08:00:00+09:00', fanned_at: null },
      { id: 'c', publish_at: '2026-09-04T10:00:00+09:00', fanned_at: '2026-09-04T10:00:00+09:00' },
      { id: 'd', publish_at: '2026-09-06T08:00:00+09:00', fanned_at: null },
    ];
    expect(sortWithScheduled(list, NOW).map(x => x.id)).toEqual(['d', 'b', 'a', 'c']);
  });
  it('예약이 없으면 그대로', () => {
    const list = [{ id: 'a', publish_at: '2026-09-05T10:00:00+09:00', fanned_at: '2026-09-05T10:00:00+09:00' }, { id: 'b' }];
    expect(sortWithScheduled(list, NOW).map(x => x.id)).toEqual(['a', 'b']);
  });
});

describe('humanizeScheduleError', () => {
  it('예약 오류 코드를 사람 말로', () => {
    expect(humanizeScheduleError(new Error('bad_time'))).toBe('예약은 지금부터 90일 안까지만 돼요');
    expect(humanizeScheduleError(new Error('already_published'))).toBe('이미 나간 공지예요');
    expect(humanizeScheduleError(new Error('not_published'))).toBe('아직 안 나간 공지예요');
  });
  it('모르는 것은 공용 안내로 넘긴다', () => {
    expect(humanizeScheduleError(new Error('duplicate key value'))).toBe('이미 있는 항목이에요');
  });
});
