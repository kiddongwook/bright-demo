import { describe, it, expect } from 'vitest';
import { pushToNav, urlBase64ToUint8Array } from './push';

describe('urlBase64ToUint8Array', () => {
  it('base64url 을 바이트로 푼다', () => {
    // 'Hello' → base64 'SGVsbG8='. 패딩이 없어도 읽어야 한다.
    expect([...urlBase64ToUint8Array('SGVsbG8')]).toEqual([72, 101, 108, 108, 111]);
  });
  it('- 와 _ 를 + 와 / 로 되돌린다', () => {
    // 0xFB 0xFF 0xBF → base64 '+/+/' → base64url '-_-_'
    expect([...urlBase64ToUint8Array('-_-_')]).toEqual([0xfb, 0xff, 0xbf]);
  });
  it('VAPID 공개키(65바이트)를 그 길이로 푼다', () => {
    expect(urlBase64ToUint8Array('B' + 'a'.repeat(86)).length).toBe(65);
  });
});

describe('pushToNav', () => {
  it('공지는 id 를 달고 공지 화면으로', () => {
    expect(pushToNav('notice-view', 'n1', 'parent')).toEqual({ view: 'notice-view', params: { id: 'n1' } });
  });
  it('문의는 학부모면 내 문의, 원장·강사면 답하기 화면', () => {
    expect(pushToNav('inbox', 'q1', 'parent')).toEqual({ view: 'ask-mine', params: { id: 'q1' } });
    expect(pushToNav('inbox', 'q1', 'director')).toEqual({ view: 'answer', params: { id: 'q1' } });
  });
  it('오늘은 학부모면 우리 아이로 간다', () => {
    expect(pushToNav('today', null, 'parent')).toEqual({ view: 'child', params: {} });
    expect(pushToNav('today', null, 'teacher')).toEqual({ view: 'today', params: {} });
  });
  it('학생의 나 화면', () => { expect(pushToNav('me', null, 'student')).toEqual({ view: 'me', params: {} }); });
  it('모르는 이름·빈 값은 null', () => {
    expect(pushToNav('nope', null, 'parent')).toBeNull();
    expect(pushToNav('', null, 'parent')).toBeNull();
  });
});
