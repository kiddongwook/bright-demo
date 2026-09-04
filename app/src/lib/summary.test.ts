import { describe, it, expect } from 'vitest';
import { summarizeToday, dowOf, type ClsFull, type Inquiry, type Absence, type EntryRow } from './api';

const TODAY = '2026-09-07';                       // 월요일 (2026-09-01 이 화요일)
const TODAY_DOW = dowOf(TODAY);
const OTHER_DOW = (TODAY_DOW + 3) % 7;

const cls = (id: string, name: string, dow: number, start = '19:00', end = '21:00'): ClsFull =>
  ({ id, name, schedule: [{ dow, start, end }], teacher_id: null, teacher_phone: null });

const inquiry = (id: string, answer: string | null): Inquiry =>
  ({ id, student_id: null, asked_by: 'u', asker_name: '학부모', student_name: null, topic: '문의', body: '내용', answer, answered_at: answer ? '2026-09-07T00:00:00Z' : null, created_at: '2026-09-06T00:00:00Z' });

const absence = (id: string, status: Absence['status']): Absence =>
  ({ id, student_id: 's', student_name: '학생', date: TODAY, reason: '병원', status, makeup_kind: null, makeup_at: null, attended_at: null, created_at: '2026-09-06T00:00:00Z' });

const base = { today: TODAY, marks: {}, studentsByClass: {}, inquiries: [] as Inquiry[], absences: [] as Absence[], studentsTotal: 0, entry: null as EntryRow[] | null };

describe('summarizeToday', () => {
  it('오늘 수업이 없으면 classesToday 는 비고, 반 수는 그대로 센다', () => {
    const s = summarizeToday({ ...base, classes: [cls('a', '고1 A', OTHER_DOW), cls('b', '고1 B', OTHER_DOW)] });
    expect(s.classesToday).toEqual([]);
    expect(s.classesTotal).toBe(2);
    expect(s.parentsEntered).toBeNull();
    expect(s.parentsTotal).toBeNull();
  });

  it('오늘 수업 둘 중 하나만 기록됐으면 marked 가 갈린다', () => {
    const s = summarizeToday({
      ...base,
      classes: [cls('a', '고1 A', TODAY_DOW, '17:00', '19:00'), cls('b', '고1 B', TODAY_DOW), cls('c', '고2', OTHER_DOW)],
      marks: { a: 3, b: 0 },
      studentsByClass: { a: 3, b: 4 },
    });
    expect(s.classesToday.map(c => c.id)).toEqual(['a', 'b']);
    expect(s.classesToday[0]).toMatchObject({ name: '고1 A', start: '17:00', end: '19:00', marked: true, students: 3 });
    expect(s.classesToday[1]).toMatchObject({ marked: false, students: 4 });
  });

  it('답변 대기·결석 신청·학부모 들어옴 수를 센다', () => {
    const entry: EntryRow[] = [
      { role: 'parent', name: '가 학부모', phone: '01011112222', student_name: '가', entered: true, push: true, kakao_ok: false },
      { role: 'parent', name: '나 학부모', phone: '01011113333', student_name: '나', entered: false, push: false, kakao_ok: false },
      { role: 'student', name: '다', phone: '01011114444', student_name: '다', entered: true, push: false, kakao_ok: false },
    ];
    const s = summarizeToday({
      ...base,
      classes: [cls('a', '고1 A', TODAY_DOW)],
      inquiries: [inquiry('1', null), inquiry('2', '답했어요'), inquiry('3', null)],
      absences: [absence('1', 'requested'), absence('2', 'confirmed'), absence('3', 'requested')],
      studentsTotal: 12,
      entry,
    });
    expect(s.pendingInquiries).toBe(2);
    expect(s.pendingAbsences).toBe(2);
    expect(s.studentsTotal).toBe(12);
    expect(s.parentsEntered).toBe(1);
    expect(s.parentsTotal).toBe(2);
  });
});
