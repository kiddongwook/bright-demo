import { supabase } from './supabase';

export type Sched = { dow: number; start: string; end: string };
export type Cls = { id: string; name: string; schedule: Sched[] };
export type Student = { id: string; name: string; classes: Cls[] };
export type AttStatus = 'present' | 'late' | 'absent' | 'makeup';
export type AttRow = { student_id: string; name: string; status: AttStatus | null };
export type Notice = { id: string; title: string; body: string; target_class_id: string | null; created_at: string; reminded_at: string | null; read: boolean; read_count: number };
export type Reader = { user_id: string; name: string; read_at: string | null };
export type Inquiry = { id: string; student_id: string | null; asked_by: string; asker_name: string; student_name: string | null; topic: string; body: string; answer: string | null; answered_at: string | null; created_at: string };
export type Faq = { id: string; q: string; a: string; sort: number };
export type Absence = { id: string; student_id: string; student_name: string; date: string; reason: string; status: 'requested' | 'confirmed' | 'declined'; makeup_kind: 'saturday' | 'material' | null; makeup_at: string | null; created_at: string };
export type Todo = { id: string; class_id: string; kind: 'homework' | 'exam'; title: string; due_date: string; notice_id: string | null; done: boolean };
export type Noti = { id: string; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };
export type Academy = { id: string; name: string; slug: string; brand_color: string };

let ctx = { academyId: '', userId: '' };
export const setContext = (academyId: string, userId: string) => { ctx = { academyId, userId }; };

export function kstToday(): string {
  const d = new Date(Date.now() + 9 * 3600e3);
  return d.toISOString().slice(0, 10);
}
export function kstDate(offsetDays: number): string {
  const d = new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3);
  return d.toISOString().slice(0, 10);
}
export const fmtMD = (iso: string) => { const [, m, d] = iso.split('-'); return `${+m}월 ${+d}일`; };
export const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const dowOf = (iso: string) => new Date(iso + 'T09:00:00Z').getUTCDay();   // 09:00Z = 18:00 KST, 같은 날짜
export const fmtMDW = (iso: string) => `${fmtMD(iso)} ${DOW[dowOf(iso)]}`;

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/* ── 공통 ── */
export async function academy(): Promise<Academy> {
  return must(await supabase.from('academies').select('id, name, slug, brand_color').eq('id', ctx.academyId).single());
}
export async function setBrandColor(color: string) { must(await supabase.from('academies').update({ brand_color: color }).eq('id', ctx.academyId)); }
export async function listClasses(): Promise<Cls[]> {
  return must(await supabase.from('classes').select('id, name, schedule').order('name')) as Cls[];
}
export async function listStudents(classId?: string): Promise<Student[]> {
  const rows = must(await supabase.from('students').select('id, name, enrollments(classes(id, name, schedule))').eq('status', 'active').order('name')) as any[];
  const list = rows.map(r => ({ id: r.id, name: r.name, classes: (r.enrollments ?? []).map((e: any) => e.classes).filter(Boolean) }));
  return classId ? list.filter(s => s.classes.some((c: Cls) => c.id === classId)) : list;
}
export const myChildren = () => listStudents();

/* ── 알림 ── */
export async function listNotifications(): Promise<Noti[]> {
  return must(await supabase.from('notifications').select('id, kind, title, body, link, read_at, created_at').order('created_at', { ascending: false }).limit(50)) as Noti[];
}
export async function unreadCount(): Promise<number> {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  return count ?? 0;
}
export async function markAllRead() { must(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)); }

/* ── 출결 ── */
export async function todayAttendance(classId: string, date: string): Promise<AttRow[]> {
  const students = await listStudents(classId);
  const rows = must(await supabase.from('attendance').select('student_id, status').eq('class_id', classId).eq('date', date)) as { student_id: string; status: AttStatus }[];
  const m = new Map(rows.map(r => [r.student_id, r.status]));
  return students.map(s => ({ student_id: s.id, name: s.name, status: m.get(s.id) ?? null }));
}
export async function saveAttendance(classId: string, date: string, rows: { student_id: string; status: AttStatus }[]) {
  if (!rows.length) return;
  must(await supabase.from('attendance').upsert(rows.map(r => ({ academy_id: ctx.academyId, class_id: classId, date, student_id: r.student_id, status: r.status, marked_by: ctx.userId })), { onConflict: 'student_id,class_id,date' }));
}
export async function weekAttendance(studentId: string, from: string, to: string): Promise<{ date: string; status: AttStatus; arrived_at: string | null }[]> {
  return must(await supabase.rpc('week_attendance', { sid: studentId, d_from: from, d_to: to })) as any;
}

/* ── 공지 ── */
export async function listNotices(): Promise<Notice[]> {
  const rows = must(await supabase.from('notices').select('id, title, body, target_class_id, created_at, reminded_at, notice_reads(user_id)').order('created_at', { ascending: false })) as any[];
  return rows.map(r => ({ ...r, read: (r.notice_reads ?? []).some((x: any) => x.user_id === ctx.userId), read_count: (r.notice_reads ?? []).length }));
}
export async function createNotice(title: string, body: string, targetClassId: string | null): Promise<Notice> {
  const r = must(await supabase.from('notices').insert({ academy_id: ctx.academyId, author_id: ctx.userId, title, body, target_class_id: targetClassId }).select('id, title, body, target_class_id, created_at, reminded_at').single()) as any;
  return { ...r, read: false, read_count: 0 };
}
export async function markNoticeRead(id: string) {
  await supabase.from('notice_reads').upsert({ notice_id: id, user_id: ctx.userId }, { onConflict: 'notice_id,user_id', ignoreDuplicates: true });
}
export async function noticeReaders(id: string): Promise<Reader[]> { return must(await supabase.rpc('notice_readers', { nid: id })) as Reader[]; }
export async function remindNotice(id: string): Promise<number> { return must(await supabase.rpc('remind_notice', { nid: id })) as number; }

/* ── 문의 ── */
export async function listInquiries(): Promise<Inquiry[]> {
  const rows = must(await supabase.from('inquiries').select('id, student_id, asked_by, topic, body, answer, answered_at, created_at, asker:users!inquiries_asked_by_fkey(name), students(name)').order('created_at', { ascending: false })) as any[];
  return rows.map(r => ({ ...r, asker_name: r.asker?.name ?? '', student_name: r.students?.name ?? null }));
}
export async function createInquiry(studentId: string | null, topic: string, body: string) {
  return must(await supabase.from('inquiries').insert({ academy_id: ctx.academyId, student_id: studentId, asked_by: ctx.userId, topic, body }).select('id').single());
}
export async function answerInquiry(id: string, answer: string) {
  must(await supabase.from('inquiries').update({ answer, answered_by: ctx.userId, answered_at: new Date().toISOString() }).eq('id', id));
}
export async function listFaqs(): Promise<Faq[]> { return must(await supabase.from('faqs').select('id, q, a, sort').order('sort')) as Faq[]; }

/* ── 결석·보강 ── */
export async function listAbsences(): Promise<Absence[]> {
  const rows = must(await supabase.from('absence_requests').select('id, student_id, date, reason, status, makeup_kind, makeup_at, created_at, students(name)').order('created_at', { ascending: false })) as any[];
  return rows.map(r => ({ ...r, student_name: r.students?.name ?? '' }));
}
export async function requestAbsence(studentId: string, date: string, reason: string) {
  return must(await supabase.from('absence_requests').insert({ academy_id: ctx.academyId, student_id: studentId, requested_by: ctx.userId, date, reason }).select('id').single());
}
export async function confirmMakeup(id: string, kind: 'saturday' | 'material', at: string | null) {
  must(await supabase.from('absence_requests').update({ status: 'confirmed', makeup_kind: kind, makeup_at: at, decided_by: ctx.userId }).eq('id', id));
}

/* ── 할 것 ── */
export async function listTodos(classIds: string[], studentId?: string): Promise<Todo[]> {
  if (!classIds.length) return [];
  const rows = must(await supabase.from('todos').select('id, class_id, kind, title, due_date, notice_id, todo_done(student_id)').in('class_id', classIds).order('due_date')) as any[];
  return rows.map(r => ({ ...r, done: !!studentId && (r.todo_done ?? []).some((d: any) => d.student_id === studentId) }));
}
export async function setTodoDone(todoId: string, studentId: string, done: boolean) {
  if (done) must(await supabase.from('todo_done').upsert({ todo_id: todoId, student_id: studentId }, { onConflict: 'todo_id,student_id', ignoreDuplicates: true }));
  else must(await supabase.from('todo_done').delete().eq('todo_id', todoId).eq('student_id', studentId));
}

/* ── 달력 도우미 ── */
export function nextClassDays(schedule: Sched[], count: number): string[] {
  const dows = new Set(schedule.map(s => s.dow));
  const out: string[] = [];
  for (let i = 1; out.length < count && i < 30; i++) {
    const iso = kstDate(i); const dow = new Date(iso + 'T09:00:00Z').getUTCDay();
    if (dows.has(dow)) out.push(iso);
  }
  return out;
}
export function nextSaturdays(count: number): string[] {
  const out: string[] = [];
  for (let i = 1; out.length < count && i < 30; i++) { const iso = kstDate(i); if (new Date(iso + 'T09:00:00Z').getUTCDay() === 6) out.push(iso); }
  return out;
}
export function weekRange(): { from: string; to: string; days: string[] } {
  const today = kstToday(); const dow = new Date(today + 'T09:00:00Z').getUTCDay(); const mon = (dow + 6) % 7;
  const days = Array.from({ length: 7 }, (_, i) => kstDate(i - mon));
  return { from: days[0], to: days[6], days };
}
