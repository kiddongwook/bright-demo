import { describe, it, expect } from 'vitest';
import { givenName, callName } from './name';

describe('callName', () => {
  it('세 글자 이름은 성을 빼고 받침이 있으면 이를 붙인다', () => {
    expect(callName('박지훈')).toBe('지훈이');
    expect(callName('김민수')).toBe('민수');
  });
  it('받침이 없으면 이를 붙이지 않는다', () => {
    expect(callName('이지수')).toBe('지수');
    expect(callName('최유나')).toBe('유나');
  });
  it('두 글자 이름과 복성을 다룬다', () => {
    expect(givenName('김민')).toBe('민');
    expect(callName('김민')).toBe('민이');
    expect(callName('남궁민수')).toBe('민수');
  });
  it('숫자·영문이 섞이면 손대지 않는다', () => {
    expect(callName('박테스터1')).toBe('박테스터1');
    expect(callName('Tom')).toBe('Tom');
  });
});
