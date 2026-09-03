import { describe, it, expect } from 'vitest';
import { detectEnv, externalOpenUrl } from './env';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const AND = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const KAKAO = AND + ' KAKAOTALK/10.8.0';
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
describe('detectEnv', () => {
  it('설치된 앱(standalone)이 먼저', () => { expect(detectEnv(IOS, true)).toBe('installed'); });
  it('카톡 내장 브라우저', () => { expect(detectEnv(KAKAO, false)).toBe('kakao'); });
  it('iOS 사파리', () => { expect(detectEnv(IOS, false)).toBe('ios'); });
  it('안드로이드 크롬', () => { expect(detectEnv(AND, false)).toBe('android'); });
  it('데스크톱', () => { expect(detectEnv(PC, false)).toBe('desktop'); });
});
describe('externalOpenUrl', () => {
  it('카톡이면 외부 브라우저 스킴', () => { expect(externalOpenUrl('https://x.app/?a=1', 'kakao')).toBe('kakaotalk://web/openExternal?url=' + encodeURIComponent('https://x.app/?a=1')); });
  it('아니면 null', () => { expect(externalOpenUrl('https://x.app/', 'ios')).toBeNull(); });
});
