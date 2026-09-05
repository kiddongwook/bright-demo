import { describe, it, expect } from 'vitest';
import { needsConsent, TERMS_VERSION, PRIVACY_VERSION } from './legal';

const row = (terms: string, privacy: string) => ({ terms_version: terms, privacy_version: privacy, agreed_at: '2026-09-05T00:00:00Z' });

describe('needsConsent', () => {
  it('행이 없으면 동의가 필요하다', () => {
    expect(needsConsent(null)).toBe(true);
    expect(needsConsent(undefined)).toBe(true);
  });
  it('지금 판에 동의했으면 필요 없다', () => {
    expect(needsConsent(row(TERMS_VERSION, PRIVACY_VERSION))).toBe(false);
  });
  it('둘 중 하나라도 낮으면 필요하다', () => {
    expect(needsConsent(row('2026-01-01', '2026-09-05'), '2026-09-05', '2026-09-05')).toBe(true);
    expect(needsConsent(row('2026-09-05', '2026-01-01'), '2026-09-05', '2026-09-05')).toBe(true);
  });
  it('더 높은 판(미래 날짜)에 동의해 둔 것은 다시 묻지 않는다', () => {
    expect(needsConsent(row('2027-01-01', '2027-01-01'), '2026-09-05', '2026-09-05')).toBe(false);
  });
  it('판 모양이 이상하면 다시 묻는다', () => {
    expect(needsConsent(row('', '2026-09-05'))).toBe(true);
    expect(needsConsent(row('v1', 'v1'))).toBe(true);
  });
  it('상수 두 개는 날짜 모양이다', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
