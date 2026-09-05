import { describe, it, expect } from 'vitest';
import { directorInviteText, appUrl, introUrl, parentBase, slugOk, suggestSlug } from './operator';

describe('suggestSlug', () => {
  it('영문·숫자만 남기고 소문자·붙임표로', () => {
    expect(suggestSlug('Bright English 2')).toBe('bright-english-2');
  });
  it('기호와 겹친 공백은 한 덩어리로 붙는다', () => {
    expect(suggestSlug('  Bright  &  Co.  ')).toBe('bright-co');
  });
  it('한글 이름은 빈 값 — 로마자로 바꾸지 않는다(운영자가 손으로 적는다)', () => {
    expect(suggestSlug('영어의 집')).toBe('');
    expect(suggestSlug('한빛수학 3관')).toBe('');   // 남는 게 한 글자뿐이면 규칙(2자 이상)에 못 미쳐 빈 값
  });
  it('두 글자에 못 미치면 빈 값', () => {
    expect(suggestSlug('A')).toBe('');
    expect(suggestSlug('!!')).toBe('');
  });
  it('40자를 넘기지 않고, 잘린 끝의 붙임표는 떼어 낸다', () => {
    const s = suggestSlug('a'.repeat(38) + ' bcd');
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith('-')).toBe(false);
    expect(slugOk(s)).toBe(true);
  });
  it('제안한 값은 언제나 서버 규칙(^[a-z0-9-]{2,40}$)을 지난다', () => {
    for (const n of ['Bright English 2', 'ABC Academy', 'the 1st math']) expect(slugOk(suggestSlug(n))).toBe(true);
  });
});

describe('parentBase · 링크', () => {
  it('앱(pwa) 한 칸 위가 소개 페이지 자리', () => {
    expect(parentBase('/bright-demo/pwa/')).toBe('/bright-demo/');
    expect(parentBase('/')).toBe('/');
  });
  it('소개 페이지 주소에 ?a=slug 가 붙는다', () => {
    expect(introUrl('https://kiddongwook.github.io', '/bright-demo/pwa/', 'yeongeo'))
      .toBe('https://kiddongwook.github.io/bright-demo/?a=yeongeo');
    expect(introUrl('http://localhost:4174', '/', 'yeongeo')).toBe('http://localhost:4174/?a=yeongeo');
  });
  it('앱 주소는 BASE_URL 그대로', () => {
    expect(appUrl('https://kiddongwook.github.io', '/bright-demo/pwa/', 'yeongeo'))
      .toBe('https://kiddongwook.github.io/bright-demo/pwa/?a=yeongeo');
  });
});

describe('directorInviteText', () => {
  const URL = 'https://kiddongwook.github.io/bright-demo/pwa/?a=yeongeo&i=' + 'a'.repeat(32);
  it('첫 줄은 학원 이름과 7일 안내', () => {
    expect(directorInviteText('영어의 집', URL).split('\n')[0])
      .toBe('[BRIGHT] 영어의 집 원장님 초대 — 링크를 누르면 바로 들어와요 (7일 안에)');
  });
  it('서버가 준 초대 주소를 그대로 싣는다', () => {
    expect(directorInviteText('영어의 집', URL)).toContain(URL);
  });
  it('처음 할 일(로고·명부) 안내가 붙는다', () => {
    expect(directorInviteText('영어의 집', URL)).toContain('로고와 반·학생 명부');
  });
});
