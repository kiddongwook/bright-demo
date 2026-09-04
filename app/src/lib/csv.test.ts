import { describe, it, expect } from 'vitest';
import { parseRosterCsv, splitCsv, groupRoster, toCsv, planImport, matchStudent, mergePhones, type ExistingStudent } from './csv';
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
describe('toCsv', () => {
  it('평범한 칸은 그대로, BOM + CRLF 로 이어붙인다', () => {
    expect(toCsv([['이름', '점수'], ['박지훈', 90]])).toBe('﻿이름,점수\r\n박지훈,90');
  });
  it('쉼표·따옴표·줄바꿈이 있는 칸은 따옴표로 감싸고 따옴표는 두 배로', () => {
    expect(toCsv([['a,b', 'c"d', 'e\nf']])).toBe('﻿"a,b","c""d","e\nf"');
  });
  it('빈 칸(null·undefined) 은 빈 문자열로', () => {
    expect(toCsv([['x', null, undefined]])).toBe('﻿x,,');
  });
});

describe('CSV 시각 (INP-46/60)', () => {
  const one = (start: string, end: string) => parseRosterCsv(HEAD + `
고1 A,월,${start},${end},박지훈,010-1234-0101,어머님,010-1234-0001,어머니`);
  it("앞의 0 이 빠진 '7:00' 은 받아서 '07:00' 으로 맞춘다", () => {
    const { rows, errors } = one('7:00', '9:00');
    expect(errors).toEqual([]); expect(rows[0].start).toBe('07:00'); expect(rows[0].end).toBe('09:00');
  });
  it('25:00·19:60 은 막는다', () => {
    expect(one('25:00', '26:00').errors.some(e => e.msg.includes('19:00 처럼'))).toBe(true);
    expect(one('19:60', '21:00').errors.some(e => e.msg.includes('19:00 처럼'))).toBe(true);
  });
  it('끝이 시작보다 늦어야 한다', () => {
    expect(one('21:00', '19:00').errors.some(e => e.msg.includes('늦어야'))).toBe(true);
    expect(one('19:00', '19:00').errors.some(e => e.msg.includes('늦어야'))).toBe(true);
  });
});

describe('planImport — 동명이인 (INP-62)', () => {
  const ex = (id: string, name: string, phone = '', parents: string[] = []): ExistingStudent =>
    ({ id, name, student_phone: phone, parent_phones: parents, class_ids: [] });
  const csvOne = (phone: string) => groupRoster(parseRosterCsv(HEAD + `
고1 A,월,19:00,21:00,김민수,${phone},어머님,010-3333-0003,어머니`).rows).students;

  it('학생번호가 비었고 동명이인이 둘이면 그 줄을 막는다', () => {
    const plan = planImport(csvOne(''), [ex('A', '김민수', '01011110001'), ex('B', '김민수', '01011110002')]);
    expect(plan.errors.length).toBe(1);
    expect(plan.errors[0].msg).toBe('동명이인이 있어 학생 번호가 필요해요 (2줄)');
    expect(plan.merges).toEqual([]);
  });
  it('같은 이름이 하나뿐이면 합치기 — 확인 문구를 돌려준다', () => {
    const plan = planImport(csvOne(''), [ex('A', '김민수', '01011110001')]);
    expect(plan.errors).toEqual([]);
    expect(plan.merges).toEqual(['기존 학생 김민수에 합쳐요']);
    expect(plan.by.get('김민수|')).toEqual({ kind: 'merge', id: 'A' });
  });
  it('학생번호가 딱 맞으면 그 학생만 갱신 (확인 필요 없음)', () => {
    const plan = planImport(csvOne('010-1111-0002'), [ex('A', '김민수', '01011110001'), ex('B', '김민수', '01011110002')]);
    expect(plan.errors).toEqual([]); expect(plan.merges).toEqual([]);
    expect(plan.by.get('김민수|01011110002')).toEqual({ kind: 'update', id: 'B' });
  });
  it('같은 이름이 아예 없으면 새로 넣는다', () => {
    const plan = planImport(csvOne('010-1111-0009'), [ex('A', '박지훈')]);
    expect(plan.by.get('김민수|01011110009')).toEqual({ kind: 'new' });
  });
  it('번호가 맞는 후보가 없고 번호 빈 후보가 둘이면 막는다', () => {
    expect(matchStudent({ student_phone: '01011110003' }, [ex('A', '김민수'), ex('B', '김민수')])).toEqual({ kind: 'ambiguous' });
  });
});

describe('mergePhones', () => {
  it('보호자 번호를 덮어쓰지 않고 합친다', () => {
    expect(mergePhones(['01022220001'], ['01033330003'])).toEqual(['01022220001', '01033330003']);
    expect(mergePhones(['01022220001'], ['01022220001'])).toEqual(['01022220001']);
    expect(mergePhones([], ['01033330003'])).toEqual(['01033330003']);
  });
});
