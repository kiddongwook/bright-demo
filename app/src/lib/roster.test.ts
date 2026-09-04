import { describe, it, expect } from 'vitest';
import { fillParentPhones, notEnteredRoles } from './roster';
import type { EntryRow } from './api';

const row = (role: EntryRow['role'], phone: string, entered: boolean): EntryRow =>
  ({ role, name: '이름', phone, student_name: '김민수', entered, push: false, kakao_ok: false });

describe('notEnteredRoles', () => {
  it('안 들어온 번호만 자리와 함께 담는다', () => {
    const m = notEnteredRoles([row('parent', '010-1111-2222', false), row('student', '01033334444', true)]);
    expect(m.get('01011112222')).toBe('parent');
    expect(m.has('01033334444')).toBe(false);
    expect(notEnteredRoles(null).size).toBe(0);
  });
});

describe('fillParentPhones', () => {
  it('붙여넣은 학부모 칸이 첫 번호를 받고 나머지는 빈 칸으로', () => {
    expect(fillParentPhones([''], ['010-1111-2222', '010-3333-4444'], 0))
      .toEqual({ pp: ['010-1111-2222', '010-3333-4444'], placed: 2 });
  });
  it('학생 칸에 붙여넣으면 첫 번호는 건너뛴다', () => {
    expect(fillParentPhones([''], ['010-1111-2222', '010-3333-4444'], null))
      .toEqual({ pp: ['010-3333-4444'], placed: 2 });
  });
  it('칸은 3개까지만 · 이미 적힌 번호는 또 넣지 않는다', () => {
    const r = fillParentPhones([''], ['010-1111-2222', '010-3333-4444', '010-5555-6666', '010-7777-8888'], 0);
    expect(r.pp).toEqual(['010-1111-2222', '010-3333-4444', '010-5555-6666']);
    expect(r.placed).toBe(3);
    expect(fillParentPhones(['01011112222', ''], ['010-1111-2222'], null)).toEqual({ pp: ['01011112222', ''], placed: 1 });
  });
});
