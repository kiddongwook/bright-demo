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
export type Absence = { id: string; student_id: string; student_name: string; date: string; reason: string; status: 'requested' | 'confirmed' | 'declined'; makeup_kind: 'saturday' | 'material' | null; makeup_at: string | null; attended_at: string | null; created_at: string };
export type Todo = { id: string; class_id: string; kind: 'homework' | 'exam'; title: string; due_date: string; notice_id: string | null; done: boolean };
export type Noti = { id: string; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };
export type Academy = { id: string; name: string; slug: string; brand_color: string };
/* 4주차 관리 */
export type StudentFull = Student & { status: 'active' | 'left'; left_at: string | null; student_phone: string; parent_phones: string[] };
export type Note = { id: string; kind: 'consult' | 'memo'; body: string; created_at: string; author_name: string };
export type CalItem = { id: string; date: string; kind: 'closed' | 'makeup' | 'special'; note: string | null; class_id: string | null };
export type TimelineItem = { ts: string; kind: 'attendance' | 'absence' | 'inquiry' | 'note'; title: string; body: string; ref: string };
export type Teacher = { user_id: string | null; name: string; phone: string };
export type ClsFull = Cls & { teacher_id: string | null };

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
/** timestamptz → 한국 날짜(YYYY-MM-DD). UTC 로 slice 하면 밤 시간대가 하루 밀린다. */
export const kstDay = (ts: string) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
/** timestamptz → "8월 31일 월 12:00" */
export const fmtDT = (ts: string) => `${fmtMDW(kstDay(ts))} ${new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })}`;
/** 오늘이면 "오늘", 아니면 "9월 4일 금" */
export const fmtDayOrToday = (iso: string) => iso === kstToday() ? '오늘' : fmtMDW(iso);

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
export async function listStudents(classId?: string, includeLeft = false): Promise<(Student & { status: 'active' | 'left' })[]> {
  let q = supabase.from('students').select('id, name, status, enrollments(classes(id, name, schedule))').order('name');
  if (!includeLeft) q = q.eq('status', 'active');
  const rows = must(await q) as any[];
  const list = rows.map(r => ({ id: r.id, name: r.name, status: r.status, classes: (r.enrollments ?? []).map((e: any) => e.classes).filter(Boolean) }));
  return classId ? list.filter(s => s.classes.some((c: Cls) => c.id === classId)) : list;
}
export const myChildren = () => listStudents();

/* ── 관리: 명부·학생 상세·메모·휴원일·시간표·강사·FAQ ── */
export async function studentDetail(sid: string): Promise<StudentFull> {
  const r = must(await supabase.from('students').select('id, name, status, left_at, enrollments(classes(id, name, schedule))').eq('id', sid).single()) as any;
  const phones = must(await supabase.rpc('roster_of_student', { sid })) as { phone: string; role: string }[];
  return { id: r.id, name: r.name, status: r.status, left_at: r.left_at, classes: (r.enrollments ?? []).map((e: any) => e.classes).filter(Boolean),
    student_phone: phones.find(p => p.role === 'student')?.phone ?? '', parent_phones: phones.filter(p => p.role === 'parent').map(p => p.phone) };
}
export async function saveStudent(sid: string | null, name: string, classIds: string[], studentPhone: string, parentPhones: string[]): Promise<string> {
  return must(await supabase.rpc('roster_save_student', { sid, p_name: name, p_class_ids: classIds, p_student_phone: studentPhone, p_parent_phones: parentPhones })) as string;
}
export async function leaveStudent(sid: string) { must(await supabase.rpc('student_leave', { sid })); }
export async function monthAttendance(sid: string, ym: string): Promise<{ date: string; status: AttStatus }[]> {
  return must(await supabase.rpc('month_attendance', { sid, ym })) as any;
}
export async function timeline(sid: string, lim = 50): Promise<TimelineItem[]> { return must(await supabase.rpc('student_timeline', { sid, lim })) as TimelineItem[]; }
export async function listNotes(sid: string): Promise<Note[]> {
  const rows = must(await supabase.from('notes').select('id, kind, body, created_at, users!notes_author_id_fkey(name)').eq('student_id', sid).order('created_at', { ascending: false })) as any[];
  return rows.map(r => ({ id: r.id, kind: r.kind, body: r.body, created_at: r.created_at, author_name: r.users?.name ?? '' }));
}
export async function addNote(sid: string, kind: 'consult' | 'memo', body: string) {
  must(await supabase.from('notes').insert({ academy_id: ctx.academyId, student_id: sid, author_id: ctx.userId, kind, body }));
}
export async function deleteNote(id: string) { must(await supabase.from('notes').delete().eq('id', id)); }
export async function listCalendar(fromDate: string): Promise<CalItem[]> {
  return must(await supabase.from('calendar').select('id, date, kind, note, class_id').gte('date', fromDate).order('date')) as CalItem[];
}
export async function addCalendar(date: string, kind: CalItem['kind'], note: string, classId: string | null) {
  // unique 에 class_id(null 가능)가 끼어 있어 전체 항목은 on conflict 가 안 잡힌다 → 먼저 찾고 있으면 고친다
  let q = supabase.from('calendar').select('id').eq('date', date).eq('kind', kind);
  q = classId ? q.eq('class_id', classId) : q.is('class_id', null);
  const ex = must(await q.maybeSingle()) as { id: string } | null;
  if (ex) must(await supabase.from('calendar').update({ note: note || null }).eq('id', ex.id));
  else must(await supabase.from('calendar').insert({ academy_id: ctx.academyId, date, kind, note: note || null, class_id: classId }));
}
export async function removeCalendar(id: string) { must(await supabase.from('calendar').delete().eq('id', id)); }
/** 휴원일 — 오늘부터 60일. all = 전체 휴원, byClass = 반별 휴원. 다음 수업·결석 신청 후보에서 뺀다. */
export type Closed = { all: Set<string>; byClass: Map<string, Set<string>> };
export async function closedByClass(): Promise<Closed> {
  const rows = must(await supabase.from('calendar').select('date, class_id').eq('kind', 'closed').gte('date', kstToday()).lte('date', kstDate(60))) as { date: string; class_id: string | null }[];
  const all = new Set<string>(); const byClass = new Map<string, Set<string>>();
  for (const r of rows) { if (!r.class_id) all.add(r.date); else { if (!byClass.has(r.class_id)) byClass.set(r.class_id, new Set()); byClass.get(r.class_id)!.add(r.date); } }
  return { all, byClass };
}
/** 전체 휴원일만 (예전 호출부용) */
export async function closedDays(): Promise<Set<string>> { return (await closedByClass()).all; }
/** 한 반이 쉬는 날 = 전체 휴원 ∪ 그 반 휴원 */
export const closedFor = (c: Closed | undefined, classId: string): Set<string> => { const s = new Set(c?.all ?? []); for (const d of c?.byClass.get(classId) ?? []) s.add(d); return s; };
/** 반마다 자기 휴원을 빼고 다음 수업일을 모아 정렬 (학부모·학생 화면) */
export function nextClassDaysFor(classes: Cls[], count: number, closed?: Closed): string[] {
  const all = new Set<string>();
  for (const c of classes) for (const d of nextClassDays(c.schedule ?? [], count, closedFor(closed, c.id))) all.add(d);
  return [...all].sort().slice(0, count);
}
/** 반별 월 출결표: 학생 × 수업일 (시간표 기준, 휴원 제외) */
export async function classMonthTable(classId: string, ym: string): Promise<{ students: { id: string; name: string }[]; days: string[]; cells: Record<string, Record<string, AttStatus>> }> {
  const cls = must(await supabase.from('classes').select('id, schedule').eq('id', classId).single()) as Cls;
  const students = await listStudents(classId);
  const rows = must(await supabase.from('attendance').select('student_id, date, status').eq('class_id', classId).gte('date', ym + '-01').lte('date', ym + '-31')) as { student_id: string; date: string; status: AttStatus }[];
  const cal = must(await supabase.from('calendar').select('date, class_id').eq('kind', 'closed').gte('date', ym + '-01').lte('date', ym + '-31')) as { date: string; class_id: string | null }[];
  const closed = new Set(cal.filter(c => !c.class_id || c.class_id === classId).map(c => c.date));
  const dows = new Set((cls.schedule ?? []).map(s => s.dow));
  const days = monthGrid(ym).days.filter((d): d is string => !!d && dows.has(dowOf(d)) && !closed.has(d));
  const cells: Record<string, Record<string, AttStatus>> = {};
  for (const r of rows) { (cells[r.student_id] ??= {})[r.date] = r.status; if (!days.includes(r.date)) days.push(r.date); }
  days.sort();
  return { students: students.map(s => ({ id: s.id, name: s.name })), days, cells };
}
/** 학원 데이터 통째로 (원장만) — Edge Function 이 JWT 를 검사한다 */
export async function exportAcademy(): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-academy`, { method: 'POST', headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (session?.access_token ?? '') } });
  if (!r.ok) throw new Error(r.status === 403 ? '원장님만 내려받을 수 있어요' : '내려받지 못했어요 (' + r.status + ')');
  return await r.blob();
}
export async function listClassesFull(): Promise<ClsFull[]> {
  return must(await supabase.from('classes').select('id, name, schedule, teacher_id').order('name')) as ClsFull[];
}
export async function createClass(name: string, schedule: Sched[]): Promise<string> {
  return (must(await supabase.from('classes').insert({ academy_id: ctx.academyId, name, schedule }).select('id').single()) as { id: string }).id;
}
export async function updateClass(id: string, name: string, schedule: Sched[], teacherId: string | null) {
  must(await supabase.from('classes').update({ name, schedule, teacher_id: teacherId }).eq('id', id));
}
export async function markMakeupAttended(aid: string) { must(await supabase.rpc('makeup_attended', { aid })); }
export async function saveFaq(id: string | null, q: string, a: string, sort: number) {
  if (id) must(await supabase.from('faqs').update({ q, a }).eq('id', id));
  else must(await supabase.from('faqs').insert({ academy_id: ctx.academyId, q, a, sort }));
}
export async function deleteFaq(id: string) { must(await supabase.from('faqs').delete().eq('id', id)); }
export async function listTeachers(): Promise<Teacher[]> { return must(await supabase.rpc('list_teachers')) as Teacher[]; }
export async function saveTeacher(name: string, phone: string) { must(await supabase.rpc('roster_save_teacher', { p_name: name, p_phone: phone })); }
export async function removeTeacher(phone: string) { must(await supabase.rpc('roster_remove_teacher', { p_phone: phone })); }

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
  const rows = must(await supabase.from('absence_requests').select('id, student_id, date, reason, status, makeup_kind, makeup_at, attended_at, created_at, students(name)').order('created_at', { ascending: false })) as any[];
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
export function nextClassDays(schedule: Sched[], count: number, closed?: Set<string>): string[] {
  // 오늘도 수업 시작 전이면 후보에 넣는다 — 낮에 보면 "다음 수업 오늘 20:00". 휴원일(closed)은 건너뛴다.
  const nowK = new Date(Date.now() + 9 * 3600e3); const hm = `${String(nowK.getUTCHours()).padStart(2, '0')}:${String(nowK.getUTCMinutes()).padStart(2, '0')}`;
  const out: string[] = [];
  for (let i = 0; out.length < count && i < 60; i++) {
    const iso = kstDate(i); const dow = dowOf(iso);
    if (closed?.has(iso)) continue;
    if (schedule.some(s => s.dow === dow && (i > 0 || s.start > hm))) out.push(iso);
  }
  return out;
}
/** 월 격자: 월요일 시작 6주 42칸, 그 달이 아닌 칸은 null. ym = 'YYYY-MM' */
export function monthGrid(ym: string): { days: (string | null)[]; label: string; prev: string; next: string } {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)); const lead = (first.getUTCDay() + 6) % 7;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days: (string | null)[] = Array.from({ length: 42 }, (_, i) => { const d = i - lead + 1; return d >= 1 && d <= dim ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null; });
  const ymOf = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}`;
  return { days, label: `${y}년 ${m}월`, prev: m === 1 ? ymOf(y - 1, 12) : ymOf(y, m - 1), next: m === 12 ? ymOf(y + 1, 1) : ymOf(y, m + 1) };
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
