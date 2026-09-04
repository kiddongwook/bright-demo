import { describe, it, expect } from 'vitest';
import { normalizePhone, formatPhone, isValidMobile } from './phone';
describe('phone', () => {
  it('normalizes', () => { expect(normalizePhone('010-1234-0001')).toBe('01012340001'); expect(normalizePhone(' 010 1234 0001 ')).toBe('01012340001'); });
  it('formats', () => { expect(formatPhone('01012340001')).toBe('010-1234-0001'); expect(formatPhone('0101234')).toBe('010-1234'); });
  it('validates', () => { expect(isValidMobile('01012340001')).toBe(true); expect(isValidMobile('0212340001')).toBe(false); expect(isValidMobile('0101234')).toBe(false); });
  it('국가번호·전각 숫자·띄어쓰기를 되돌린다 (INP-30/31)', () => {
    expect(normalizePhone('+82 10-1234-5678')).toBe('01012345678');
    expect(normalizePhone('+82 010 1234 5678')).toBe('01012345678');
    expect(normalizePhone('821012345678')).toBe('01012345678');
    expect(normalizePhone('０１０１２３４５６７８')).toBe('01012345678');
    expect(normalizePhone('010 1234 5678')).toBe('01012345678');
    expect(isValidMobile('+82 10-1234-5678')).toBe(true);
  });
  it('010 은 11자리뿐이다 (INP-36)', () => {
    expect(isValidMobile('0101234567')).toBe(false);   // 010 + 7자리
    expect(isValidMobile('0111234567')).toBe(true);    // 011 은 10자리도 옛 번호
    expect(isValidMobile('010123456789')).toBe(false);
  });
});
