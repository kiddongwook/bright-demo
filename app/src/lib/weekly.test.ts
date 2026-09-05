import { describe, it, expect } from 'vitest';
import { describeWeekly, weeklyToast, clampHour, DEFAULT_WEEKLY, WEEKLY_DOW_ORDER, DOW_LABELS } from './weekly';

describe('describeWeekly', () => {
  it('기본값은 금 18:00', () => {
    expect(describeWeekly(DEFAULT_WEEKLY)).toBe('금 18:00');
  });
  it('요일·시를 그대로 — 한 자리 시는 0 을 채운다', () => {
    expect(describeWeekly({ weekly_summary: true, weekly_dow: 0, weekly_hour: 9 })).toBe('일 09:00');
    expect(describeWeekly({ weekly_summary: true, weekly_dow: 6, weekly_hour: 22 })).toBe('토 22:00');
  });
  it('꺼져 있으면 시각 대신 꺼져 있어요', () => {
    expect(describeWeekly({ weekly_summary: false, weekly_dow: 5, weekly_hour: 18 })).toBe('꺼져 있어요');
    expect(describeWeekly(null)).toBe('꺼져 있어요');
  });
  it('범위 밖 값은 조용히 안전한 값으로', () => {
    expect(describeWeekly({ weekly_summary: true, weekly_dow: 9, weekly_hour: 30 })).toBe('금 22:00');
    expect(clampHour(3)).toBe(6);
    expect(clampHour(NaN)).toBe(18);
  });
});

describe('weeklyToast', () => {
  it('켜면 언제 가는지, 끄면 안 간다고', () => {
    expect(weeklyToast({ weekly_summary: true, weekly_dow: 5, weekly_hour: 18 })).toBe('매주 금 18:00에 학부모에게 요약이 가요');
    expect(weeklyToast({ weekly_summary: false, weekly_dow: 5, weekly_hour: 18 })).toContain('껐어요');
  });
});

describe('요일 표', () => {
  it('월요일부터 일곱 요일 한 번씩 — 번호는 0=일', () => {
    expect(WEEKLY_DOW_ORDER).toHaveLength(7);
    expect(new Set(WEEKLY_DOW_ORDER).size).toBe(7);
    expect(WEEKLY_DOW_ORDER.map(d => DOW_LABELS[d]).join('')).toBe('월화수목금토일');
  });
});
