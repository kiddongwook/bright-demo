/* 출결 사유(메모)와 "지금 수업 중인 반" 고르기.
   api.ts 를 건드리지 않으려고 여기 따로 둔다 — 저장 길은 api.saveAttendance 와 같은 upsert 를 그대로 베끼고
   note 한 칸만 더 싣는다(attendance.note 은 0001 스키마에 이미 있다). */
import { supabase } from './supabase';
import { getContext, listStudents, type AttRow, type AttStatus, type Cls } from './api';

/** 출석부 한 줄 + 사유. note 는 빈 문자열이 아니라 null 로 다룬다 (DB 도 null 이 "없음"). */
export type AttNoteRow = AttRow & { note: string | null };

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/** api.todayAttendance 와 같지만 사유까지 읽어 온다 — 다시 열어도 "지각 · 10분" 이 남게. */
export async function todayAttendanceWithNotes(classId: string, date: string): Promise<AttNoteRow[]> {
  const students = await listStudents(classId);
  const rows = must(await supabase.from('attendance').select('student_id, status, note').eq('class_id', classId).eq('date', date)) as { student_id: string; status: AttStatus; note: string | null }[];
  const m = new Map(rows.map(r => [r.student_id, r]));
  return students.map(s => ({ student_id: s.id, name: s.name, status: m.get(s.id)?.status ?? null, note: m.get(s.id)?.note ?? null }));
}

/** api.saveAttendance 와 같은 upsert. note 만 더 싣는다 — 빈 사유는 null 로 지운다. */
export async function saveAttendanceWithNotes(classId: string, date: string, rows: { student_id: string; status: AttStatus; note?: string | null }[]) {
  if (!rows.length) return;
  const ctx = getContext();
  must(await supabase.from('attendance').upsert(rows.map(r => ({
    academy_id: ctx.academyId, class_id: classId, date, student_id: r.student_id,
    status: r.status, note: r.note?.trim() ? r.note.trim() : null, marked_by: ctx.userId,
  })), { onConflict: 'student_id,class_id,date' }));
}

/* ── 사유 빠른 고르기 ── */
export const REASONS: Partial<Record<AttStatus, string[]>> = {
  late: ['10분', '20분', '30분', '차 막힘'],
  absent: ['아픔', '병원', '가족 일정', '학교 행사', '무단'],
};

/* ── "지금 수업 중인 반" 고르기 (순수 — 시험이 여기만 부른다) ── */

/** 'HH:MM' → 자정부터 분. 모양이 아니면 null (시간표가 비어 있어도 터지지 않게). */
export function hmToMin(hm: string | undefined | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm ?? '').trim());
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** 오늘 이 반이 하는 수업 시간대 — 시작이 이른 것부터 */
const todaySlots = (c: Cls, dow: number) =>
  (c.schedule ?? []).filter(s => s.dow === dow)
    .map(s => ({ start: hmToMin(s.start), end: hmToMin(s.end) }))
    .filter((s): s is { start: number; end: number } => s.start !== null && s.end !== null)
    .sort((a, b) => a.start - b.start);

/**
 * 화면을 처음 열 때 어느 반을 보여줄까.
 *   1) 오늘 하는 반 중에 지금 수업 중인 반 — 시작 30분 전부터 끝날 때까지.
 *      (계획서의 "start ≤ now+30 ≤ end" 는 시작 30분 전에 미리 잡아 주자는 뜻이라 앞머리는 그대로 두고,
 *       끝나는 쪽은 end 로 둔다. end-30 으로 자르면 수업 마지막 30분에 반이 튀어 나가 버린다.)
 *   2) 없으면 오늘 남은 수업 중 가장 이른 반
 *   3) 그것도 없으면 첫 번째 반
 * nowMin 은 한국 시간 자정부터 분. 반 목록이 비면 undefined.
 */
export function pickInitialClass<T extends Cls>(classes: T[], dow: number, nowMin: number): T | undefined {
  let now: T | undefined, nowStart = Infinity;
  let next: T | undefined, nextStart = Infinity;
  for (const c of classes) {
    for (const s of todaySlots(c, dow)) {
      if (s.start - 30 <= nowMin && nowMin <= s.end) { if (s.start < nowStart) { now = c; nowStart = s.start; } }
      else if (s.start > nowMin && s.start < nextStart) { next = c; nextStart = s.start; }
    }
  }
  return now ?? next ?? classes[0];
}

/** 지금(한국) 자정부터 분 — 화면이 pickInitialClass 에 넣어 준다 */
export function kstNowMin(now: number = Date.now()): number {
  const d = new Date(now + 9 * 3600e3);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
