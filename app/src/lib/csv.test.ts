import { describe, it, expect } from 'vitest';
import { parseRosterCsv, splitCsv, groupRoster } from './csv';
const HEAD = '반,요일,시작,끝,학생,학생번호,보호자,보호자번호,관계';
describe('splitCsv', () => {
  it('따옴표 안 쉼표·이중 따옴표·CRLF·BOM', () => {
    expect(splitCsv('﻿a,"b,c","d""e"\r\n1,2,3\n')).toEqual([['a', 'b,c', 'd"e'], ['1', '2', '3']]);
  });
});
describe('parseRosterCsv', () => {
  it('정상 행 → 요일 숫자·번호 숫자만', () => {
    const { rows, errors } = parseRosterCsv(HEAD + '\n고1 A,월수금,19:00,21:00,박지훈,010-1234-0101,박지훈 어머님,010-1234-0001,어머니\n');
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ line: 2, cls: '고1 A', dows: [1, 3, 5], start: '19:00', end: '21:00', student: '박지훈', student_phone: '01012340101', parent_phone: '01012340001' });
  });
  it('머리글이 빠지면 오류 하나', () => { expect(parseRosterCsv('반,학생\n고1,박').errors[0].msg).toContain('머리글'); });
  it('번호 모양·요일·시간 오류를 줄 번호와 함께', () => {
    const { errors } = parseRosterCsv(HEAD + '\n고1 A,ㅁ,7시,21:00,박지훈,123,엄마,010-1,어머니');
    expect(errors.map(e => e.line)).toEqual([3, 3, 3, 3].slice(0, errors.length).map(() => 2));
    expect(errors.length).toBe(4);
  });
});
describe('groupRoster', () => {
  it('같은 학생의 두 줄(보호자 둘·반 둘)을 하나로', () => {
    const { rows } = parseRosterCsv(HEAD + '\n고1 A,월수금,19:00,21:00,박지훈,010-1234-0101,어머님,010-1234-0001,어머니\n고1 A,월수금,19:00,21:00,박지훈,010-1234-0101,아버님,010-1234-0002,아버지\n독해반,토,10:00,12:00,박지훈,010-1234-0101,어머님,010-1234-0001,어머니');
    const g = groupRoster(rows);
    expect(g.students.length).toBe(1);
    expect(g.students[0].classes).toEqual(['고1 A', '독해반']);
    expect(g.students[0].parent_phones).toEqual(['01012340001', '01012340002']);
    expect(g.classes.map(c => c.name)).toEqual(['고1 A', '독해반']);
    expect(g.classes[1].dows).toEqual([6]);
  });
});
