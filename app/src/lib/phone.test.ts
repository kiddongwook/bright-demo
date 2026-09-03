import { describe, it, expect } from 'vitest';
import { normalizePhone, formatPhone, isValidMobile } from './phone';
describe('phone', () => {
  it('normalizes', () => { expect(normalizePhone('010-1234-0001')).toBe('01012340001'); expect(normalizePhone(' 010 1234 0001 ')).toBe('01012340001'); });
  it('formats', () => { expect(formatPhone('01012340001')).toBe('010-1234-0001'); expect(formatPhone('0101234')).toBe('010-1234'); });
  it('validates', () => { expect(isValidMobile('01012340001')).toBe(true); expect(isValidMobile('0212340001')).toBe(false); expect(isValidMobile('0101234')).toBe(false); });
});
