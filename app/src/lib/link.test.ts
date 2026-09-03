import { describe, it, expect } from 'vitest';
import { parseLinkToken } from './link';
describe('parseLinkToken', () => {
  it('?l= 의 32자 hex 토큰을 읽는다', () => { expect(parseLinkToken('?l=' + 'a'.repeat(32))).toBe('a'.repeat(32)); });
  it('다른 쿼리와 섞여도 읽는다', () => { expect(parseLinkToken('?r=3&l=' + 'b'.repeat(32) + '&x=1')).toBe('b'.repeat(32)); });
  it('없거나 모양이 다르면 null', () => { expect(parseLinkToken('')).toBeNull(); expect(parseLinkToken('?l=short')).toBeNull(); expect(parseLinkToken('?l=' + 'g'.repeat(32))).toBeNull(); });
});
