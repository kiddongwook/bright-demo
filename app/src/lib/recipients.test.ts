import { describe, it, expect } from 'vitest';
import { countRecipients, type EntryRow } from './api';

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
