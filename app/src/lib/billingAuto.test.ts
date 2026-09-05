import { describe, it, expect } from 'vitest';
import { DEFAULT_AUTO, describeAuto } from './billingAuto';

describe('describeAuto', () => {
  it('둘 다 꺼져 있으면 꺼져 있어요', () => {
    expect(describeAuto(DEFAULT_AUTO, 1)).toBe('꺼져 있어요');
  });
  it('발행만 켜면 청구일과 함께', () => {
    expect(describeAuto({ auto_issue: true, auto_remind: false, auto_remind_after_days: 3 }, 25)).toBe('매월 25일 자동 발행');
  });
  it('안내만 켜면 며칠 뒤인지', () => {
    expect(describeAuto({ auto_issue: false, auto_remind: true, auto_remind_after_days: 7 }, 1)).toBe('납기 7일 뒤 미납 안내');
  });
  it('둘 다 켜면 가운뎃점으로 잇는다', () => {
    expect(describeAuto({ auto_issue: true, auto_remind: true, auto_remind_after_days: 3 }, 1)).toBe('매월 1일 자동 발행 · 납기 3일 뒤 미납 안내');
  });
  it('청구일을 안 주면 1일', () => {
    expect(describeAuto({ auto_issue: true, auto_remind: false, auto_remind_after_days: 3 })).toBe('매월 1일 자동 발행');
  });
});
