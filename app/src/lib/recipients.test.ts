import { describe, it, expect } from 'vitest';
import { countRecipients, type EntryRow } from './api';
import { targetLabel, readPct, remindLabel } from './recipients';

const row = (role: EntryRow['role'], phone: string, studentName: string | null, name = '이름'): EntryRow =>
  ({ role, name, phone, student_name: studentName, entered: false, push: false, kakao_ok: false });

describe('countRecipients', () => {
  it('대상 학생의 본인 번호와 학부모 번호를 함께 센다', () => {
    const rows = [row('student', '01011112222', '민준'), row('parent', '01033334444', '민준')];
    expect(countRecipients(['민준'], rows)).toBe(2);
  });
  it('같은 번호는 한 번만 센다 — 형제자매의 학부모', () => {
    const rows = [row('parent', '01033334444', '민준'), row('parent', '01033334444', '서연'), row('student', '01011112222', '민준')];
    expect(countRecipients(['민준', '서연'], rows)).toBe(2);
  });
  it('대상 밖 학생과 번호 없는 줄은 빼고 센다', () => {
    const rows = [row('parent', '01033334444', '민준'), row('parent', '01055556666', '지호'), row('student', '', '민준')];
    expect(countRecipients(['민준'], rows)).toBe(1);
  });
  it('학생이 없으면 0', () => {
    expect(countRecipients([], [row('parent', '01033334444', '민준')])).toBe(0);
  });
});

const CLS = [{ id: 'a', name: '고1 A' }, { id: 'b', name: '고2 B' }, { id: 'c', name: '고3 C' }];

describe('targetLabel', () => {
  it('비면 전체', () => {
    expect(targetLabel([], CLS)).toBe('전체');
    expect(targetLabel(null, CLS)).toBe('전체');
  });
  it('한 반이면 그 반 이름', () => expect(targetLabel(['b'], CLS)).toBe('고2 B'));
  it('여러 반은 가운뎃점으로 잇는다 — 고른 차례가 아니라 반 목록 차례로', () => {
    expect(targetLabel(['b', 'a'], CLS)).toBe('고1 A · 고2 B');
    expect(targetLabel(['a', 'b'], CLS)).toBe('고1 A · 고2 B');
  });
  it('반 목록을 아직 못 읽었으면 자리만 채운다', () => expect(targetLabel(['a', 'b'], null)).toBe('반 · 반'));
  it('지워진 반은 뒤에 "반" 으로', () => expect(targetLabel(['zzz', 'a'], CLS)).toBe('고1 A · 반'));
});

describe('readPct', () => {
  it('아무도 없으면 0% (0 나누기 0 을 막는다)', () => expect(readPct(0, 0)).toBe(0));
  it('절반', () => expect(readPct(1, 2)).toBe(50));
  it('반올림', () => expect(readPct(1, 3)).toBe(33));
  it('다 읽으면 100', () => expect(readPct(4, 4)).toBe(100));
  it('셈이 어긋나도 100 을 넘지 않는다', () => expect(readPct(5, 4)).toBe(100));
});

describe('remindLabel', () => {
  it('안 읽은 사람이 없으면 누를 것이 없다', () => expect(remindLabel(0)).toBe('모두 읽었어요'));
  it('처음 알릴 때', () => expect(remindLabel(3)).toBe('안 읽은 3명에게 다시 알리기'));
  it('이미 한 번 알렸으면', () => expect(remindLabel(3, true)).toBe('안 읽은 3명에게 한 번 더 알리기'));
});
