import { describe, it, expect } from 'vitest';
import { parseContacts } from './contacts';

describe('parseContacts', () => {
  it('이름 뒤에 번호', () => {
    expect(parseContacts('김민수 010-1234-5678')).toEqual([{ name: '김민수', phone: '01012345678' }]);
  });
  it('번호 뒤에 이름 · 띄어쓴 번호', () => {
    expect(parseContacts('010 1234 5678 김민수')).toEqual([{ name: '김민수', phone: '01012345678' }]);
  });
  it('쉼표·탭으로 나뉜 줄', () => {
    expect(parseContacts('홍길동,01012345678')).toEqual([{ name: '홍길동', phone: '01012345678' }]);
    expect(parseContacts('김민수\t010-1234-5678')).toEqual([{ name: '김민수', phone: '01012345678' }]);
  });
  it('+82 국가번호 · 전각 숫자', () => {
    expect(parseContacts('박지훈 +82 10-1234-5678')).toEqual([{ name: '박지훈', phone: '01012345678' }]);
    expect(parseContacts('０１０１２３４５６７８')).toEqual([{ phone: '01012345678' }]);
  });
  it('여러 줄 · 같은 번호는 한 번만 (이름은 뒤에서 채워진다)', () => {
    expect(parseContacts('010-1234-5678\n김민수 010-1234-5678\n이서연 010-2222-3333'))
      .toEqual([{ name: '김민수', phone: '01012345678' }, { name: '이서연', phone: '01022223333' }]);
  });
  it('휴대폰이 아닌 번호·꼬리표는 버린다', () => {
    expect(parseContacts('학원 02-123-4567')).toEqual([]);
    expect(parseContacts('김민수 휴대폰 010-1234-5678')).toEqual([{ name: '김민수', phone: '01012345678' }]);
    expect(parseContacts('010123456789')).toEqual([]);          // 12자리 — 잘라 내지 않고 버린다
    expect(parseContacts('이도윤 011-234-5678')).toEqual([{ name: '이도윤', phone: '0112345678' }]);
  });
  it('한 줄에 번호가 둘이면 앞의 번호만 이름을 가진다', () => {
    expect(parseContacts('김민수 010-1111-2222 010-3333-4444'))
      .toEqual([{ name: '김민수', phone: '01011112222' }, { phone: '01033334444' }]);
  });
  it('빈 글 · 번호 없는 글', () => {
    expect(parseContacts('')).toEqual([]);
    expect(parseContacts('김민수')).toEqual([]);
  });
});
