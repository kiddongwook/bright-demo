import { fn, supabase } from './supabase';
import { DOW, dowOf, hmToMin, kstToday, kstDate } from './dates';
import type { Membership } from '../auth/session';

export type Sched = { dow: number; start: string; end: string };
export type Cls = { id: string; name: string; schedule: Sched[] };
export type Student = { id: string; name: string; classes: Cls[] };
export type AttStatus = 'present' | 'late' | 'absent' | 'makeup';
export type AttRow = { student_id: string; name: string; status: AttStatus | null };
/** class_ids: 이 공지가 걸린 반들. 빈 배열이면 전체 공지.
 *  (DB 는 notice_targets 줄이 있으면 그것, 없으면 옛 target_class_id 를 본다 — 0021) */
export type Notice = { id: string; title: string; body: string; target_class_id: string | null; class_ids: string[]; created_at: string; reminded_at: string | null; photos: string[]; read: boolean; read_count: number };
export type Reader = { user_id: string; name: string; read_at: string | null };
export type Inquiry = { id: string; student_id: string | null; asked_by: string; asker_name: string; student_name: string | null; topic: string; body: string; answer: string | null; answered_at: string | null; created_at: string };
export type Faq = { id: string; q: string; a: string; sort: number };
export type Absence = { id: string; student_id: string; student_name: string; date: string; reason: string; status: 'requested' | 'confirmed' | 'declined'; makeup_kind: 'saturday' | 'material' | null; makeup_at: string | null; attended_at: string | null; created_at: string };
export type Todo = { id: string; class_id: string; kind: 'homework' | 'exam'; title: string; due_date: string; notice_id: string | null; done: boolean };
export type Noti = { id: string; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };
export type Academy = { id: string; name: string; slug: string; brand_color: string; logo_path: string | null };
/* 4주차 관리 */
export type StudentFull = Student & { status: 'active' | 'left'; left_at: string | null; student_phone: string; parent_phones: string[] };
export type Note = { id: string; kind: 'consult' | 'memo'; body: string; created_at: string; author_name: string };
export type CalItem = { id: string; date: string; kind: 'closed' | 'makeup' | 'special'; note: string | null; class_id: string | null };
export type TimelineItem = { ts: string; kind: 'attendance' | 'absence' | 'inquiry' | 'note'; title: string; body: string; ref: string };
export type Teacher = { user_id: string | null; name: string; phone: string };
export type ClsFull = Cls & { teacher_id: string | null; teacher_phone: string | null };

let ctx = { academyId: '', userId: '' };
export const setContext = (academyId: string, userId: string) => { ctx = { academyId, userId }; };
/** 지금 누가 어느 학원으로 보고 있나 — 오류 보고가 읽어 간다 (읽기 전용 사본) */
export const getContext = () => ({ ...ctx });

export const fmtMD = (iso: string) => { const [, m, d] = iso.split('-'); return `${+m}월 ${+d}일`; };
/* 요일·오늘 셈은 dates.ts 한 곳에서 — 여기서 다시 내보내 옛 호출부를 그대로 둔다 */
export { DOW, dowOf, kstToday, kstDate };
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
  return must(await supabase.from('academies').select('id, name, slug, brand_color, logo_path').eq('id', ctx.academyId).single());
}
export async function setBrandColor(color: string) { must(await supabase.from('academies').update({ brand_color: color }).eq('id', ctx.academyId)); }
export async function setLogo(path: string | null) { must(await supabase.from('academies').update({ logo_path: path }).eq('id', ctx.academyId)); }
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
  const grid = monthGrid(ym).days.filter((d): d is string => !!d); const first = grid[0], last = grid[grid.length - 1]; // 9월 31일 같은 날짜는 400
  const cls = must(await supabase.from('classes').select('id, schedule').eq('id', classId).single()) as Cls;
  const students = await listStudents(classId);
  const rows = must(await supabase.from('attendance').select('student_id, date, status').eq('class_id', classId).gte('date', first).lte('date', last)) as { student_id: string; date: string; status: AttStatus }[];
  const cal = must(await supabase.from('calendar').select('date, class_id').eq('kind', 'closed').gte('date', first).lte('date', last)) as { date: string; class_id: string | null }[];
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
  return must(await supabase.from('classes').select('id, name, schedule, teacher_id, teacher_phone').order('name')) as ClsFull[];
}
export async function createClass(name: string, schedule: Sched[]): Promise<string> {
  return (must(await supabase.from('classes').insert({ academy_id: ctx.academyId, name, schedule }).select('id').single()) as { id: string }).id;
}
export async function updateClass(id: string, name: string, schedule: Sched[]) {
  must(await supabase.from('classes').update({ name, schedule }).eq('id', id));
}
/* 담당 강사는 번호로 잡는다 — 아직 앱에 안 들어온 강사도 배정되고, 들어올 때 사용자가 이어진다 */
export async function assignClassTeacher(classId: string, phone: string | null) {
  must(await supabase.rpc('assign_class_teacher', { p_class: classId, p_phone: phone ?? '' }));
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
/** 명부 한 줄의 현황. entered = 앱에 들어왔나. push = 살아 있는 푸시 구독이 있나.
 *  kakao_ok = 문자/알림톡이 실제로 나가는 상태인가(대행사가 붙기 전에는 늘 false).
 *  들어왔는데 push·kakao_ok 가 둘 다 false 면 앱 밖에서는 아무것도 못 받는 사람이다. */
export type EntryRow = { role: 'parent' | 'student'; name: string; phone: string; student_name: string | null; entered: boolean; push: boolean; kakao_ok: boolean };
export async function entryStatus(): Promise<EntryRow[]> { return must(await supabase.rpc('roster_entry_status')) as EntryRow[]; }

/* ── 알림 설정 — 카톡만 끈다. 앱 안 알림·종 배지는 그대로. 키가 없으면 켠 것. ── */
export async function getPrefs(): Promise<Record<string, boolean>> {
  const r = must(await supabase.from('users').select('prefs').eq('id', ctx.userId).single()) as { prefs: Record<string, boolean> | null };
  return r.prefs ?? {};
}
export async function setPrefs(p: Record<string, boolean>) { must(await supabase.from('users').update({ prefs: p }).eq('id', ctx.userId)); }
/** 푸시를 켠 뒤에도 카톡을 같이 받을지 — 기본은 꺼짐(푸시만). 서버 트리거가 이 값을 본다. */
export async function setKakaoAlso(on: boolean) { const p = await getPrefs(); await setPrefs({ ...p, kakao_also: on }); }

/* ── 웹 푸시 구독 — 기기 하나에 endpoint 하나. 발송은 서버(outbox-send)가 한다. ── */
export type PushRow = { endpoint: string; p256dh: string; auth: string };
export async function savePushSubscription(s: PushRow) {
  // endpoint 는 unique 다. 같은 기기를 다시 켜면 내 옛 행이 남아 있을 수 있어 지우고 넣는다(RLS 가 update 를 안 준다).
  must(await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint));
  must(await supabase.from('push_subscriptions').insert({ user_id: ctx.userId, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, ua: navigator.userAgent.slice(0, 300) }));
}
export async function removePushSubscription(endpoint: string) {
  must(await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint));
}
/** 서버에 내 행이 있나 — 기기엔 구독이 남았는데 서버에선 지워진 경우를 가른다(RLS 라 남의 행은 안 보인다). */
export async function hasPushSubscription(endpoint: string): Promise<boolean> {
  const r = await supabase.from('push_subscriptions').select('endpoint').eq('endpoint', endpoint).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return !!r.data;
}

/* ── 초대 링크 — 원장이 명부에서 만들고, 받은 사람은 번호 없이 들어온다 ── */
/** 명부에 있는 번호로 7일짜리 1회용 토큰을 만든다(원장만). 돌아오는 값은 원문 토큰 32자 hex. */
export async function createInvite(phone: string): Promise<string> {
  return must(await supabase.rpc('create_invite', { p_phone: phone })) as string;
}
export type InviteOk = { ok: true; user_id: string; session: { access_token: string; refresh_token: string }; memberships: Membership[] };
export type InviteFail = { ok: false; error: 'expired' | 'used' | 'bad_token' | 'network' };
/** 초대 토큰으로 정식 세션을 받는다 — otp-verify 와 같은 응답 형태. 실패는 던지지 않고 사유를 돌려준다. */
export async function inviteLogin(token: string, academy: string): Promise<InviteOk | InviteFail> {
  let r: Response;
  try {
    r = await fetch(fn('invite-login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ token, academy }),
    });
  } catch { return { ok: false, error: 'network' }; }
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as { error?: string };
    return { ok: false, error: j.error === 'expired' || j.error === 'used' ? j.error : 'bad_token' };
  }
  const j = await r.json() as { user_id: string; session: { access_token: string; refresh_token: string }; memberships: Membership[] };
  return { ok: true, ...j };
}

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
/** 공지 한 줄의 대상 반 — 대상 줄이 있으면 그것, 없으면 옛 한 반, 그것도 없으면 전체(빈 배열) */
const noticeClassIds = (r: any): string[] => {
  const t = (r.notice_targets ?? []).map((x: any) => x.class_id).filter(Boolean) as string[];
  return t.length ? t : (r.target_class_id ? [r.target_class_id] : []);
};
const NOTICE_COLS = 'id, title, body, target_class_id, created_at, reminded_at, photos, notice_targets(class_id)';
export async function listNotices(): Promise<Notice[]> {
  const rows = must(await supabase.from('notices').select(NOTICE_COLS + ', notice_reads(user_id)').order('created_at', { ascending: false })) as any[];
  return rows.map(r => ({ ...r, class_ids: noticeClassIds(r), photos: (r.photos ?? []) as string[], read: (r.notice_reads ?? []).some((x: any) => x.user_id === ctx.userId), read_count: (r.notice_reads ?? []).length }));
}
/** classIds 를 주면 공지와 대상 반을 한 트랜잭션에 넣는 RPC(create_notice_v2)로 간다.
 *  빈 배열이면 전체 공지. 안 주면 예전처럼 한 반(targetClassId)만 걸린다. */
export async function createNotice(title: string, body: string, targetClassId: string | null, photos: string[] = [], classIds?: string[]): Promise<Notice> {
  if (classIds) {
    const id = must(await supabase.rpc('create_notice_v2', { p_title: title, p_body: body, p_class_ids: classIds })) as string;
    if (photos.length) must(await supabase.from('notices').update({ photos }).eq('id', id));
    const n = must(await supabase.from('notices').select(NOTICE_COLS).eq('id', id).single()) as any;
    return { ...n, class_ids: noticeClassIds(n), photos: (n.photos ?? []) as string[], read: false, read_count: 0 };
  }
  const r = must(await supabase.from('notices').insert({ academy_id: ctx.academyId, author_id: ctx.userId, title, body, target_class_id: targetClassId, photos }).select(NOTICE_COLS).single()) as any;
  return { ...r, class_ids: noticeClassIds(r), photos: (r.photos ?? []) as string[], read: false, read_count: 0 };
}
/** 사진은 공지를 만든 뒤에 올린다(경로에 notice_id 가 들어가서). 다 올린 뒤 경로를 붙인다. */
export async function updateNoticePhotos(id: string, photos: string[]) {
  must(await supabase.from('notices').update({ photos }).eq('id', id));
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
/* 원장·강사용: 반 하나의 다가오는 할 것 + 몇 명이 했는지 (staff 범위 밖 학생은 RLS 가 세지 않는다) */
export type TodoFull = Todo & { done_count: number };
export async function listClassTodos(classId: string, fromDate: string): Promise<TodoFull[]> {
  const rows = must(await supabase.from('todos').select('id, class_id, kind, title, due_date, notice_id, todo_done(student_id)').eq('class_id', classId).gte('due_date', fromDate).order('due_date')) as any[];
  return rows.map(r => ({ id: r.id, class_id: r.class_id, kind: r.kind, title: r.title, due_date: r.due_date, notice_id: r.notice_id, done: false, done_count: (r.todo_done ?? []).length }));
}
export async function createTodo(classId: string, kind: 'homework' | 'exam', title: string, dueDate: string): Promise<string> {
  return (must(await supabase.from('todos').insert({ academy_id: ctx.academyId, class_id: classId, kind, title, due_date: dueDate }).select('id').single()) as { id: string }).id;
}
export async function deleteTodo(id: string): Promise<void> { must(await supabase.from('todos').delete().eq('id', id)); }
/** 숙제 검사: 반 학생 전체 × 이 할 것을 한 학생이 했는지 (원장·강사가 대신 확인) */
export async function todoDoneList(todoId: string, classId: string): Promise<{ student_id: string; name: string; done: boolean }[]> {
  const students = await listStudents(classId);
  const rows = must(await supabase.from('todo_done').select('student_id').eq('todo_id', todoId)) as { student_id: string }[];
  const done = new Set(rows.map(r => r.student_id));
  return students.map(s => ({ student_id: s.id, name: s.name, done: done.has(s.id) }));
}
/** 원장·강사가 학생을 대신 체크(해제) — todo_done_staff 정책(담당 반 범위)이 막아 준다 */
export async function setTodoDoneBy(todoId: string, studentId: string, done: boolean) {
  if (done) must(await supabase.from('todo_done').upsert({ todo_id: todoId, student_id: studentId }, { onConflict: 'todo_id,student_id', ignoreDuplicates: true }));
  else must(await supabase.from('todo_done').delete().eq('todo_id', todoId).eq('student_id', studentId));
}

/** 반 시간표 요약. 요일이 같은 시간이면 "월수금 19:00–21:00", 요일마다 다르면 "월 19:00–21:00 · 토 10:00–12:00" */
export function scheduleSummary(s: Sched[]): string {
  if (!s.length) return '시간표 없음';
  const order = (d: number) => (d + 6) % 7; // 월화수목금토일
  const sorted = [...s].sort((a, b) => order(a.dow) - order(b.dow));
  const same = sorted.every(x => x.start === sorted[0].start && x.end === sorted[0].end);
  if (same) return `${[...new Set(sorted.map(x => x.dow))].map(d => DOW[d]).join('')} ${sorted[0].start}–${sorted[0].end}`;
  return sorted.map(x => `${DOW[x.dow]} ${x.start}–${x.end}`).join(' · ');
}

/* ── 달력 도우미 ── */
export function nextClassDays(schedule: Sched[], count: number, closed?: Set<string>): string[] {
  // 오늘도 수업 시작 전이면 후보에 넣는다 — 낮에 보면 "다음 수업 오늘 20:00". 휴원일(closed)은 건너뛴다.
  // 시각은 분으로 견준다 — 글자로 견주면 '7:00'·'25:00' 이 밤 11시에도 "오늘" 로 잡혔다(INP-80).
  const nowK = new Date(Date.now() + 9 * 3600e3); const nowMin = nowK.getUTCHours() * 60 + nowK.getUTCMinutes();
  const out: string[] = [];
  for (let i = 0; out.length < count && i < 60; i++) {
    const iso = kstDate(i); const dow = dowOf(iso);
    if (closed?.has(iso)) continue;
    if (schedule.some(s => s.dow === dow && (i > 0 || ((hmToMin(s.start) ?? -1) > nowMin)))) out.push(iso);
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

/* ── 오늘 요약 (원장·강사 홈) ── */
export type TodaySummary = {
  classesToday: { id: string; name: string; start: string; end: string; marked: boolean; students: number }[];
  pendingInquiries: number; pendingAbsences: number;
  studentsTotal: number; classesTotal: number;
  parentsEntered: number | null; parentsTotal: number | null;
};
/** 순수 계산 — 화면·테스트가 같이 쓴다. marks = 반 id → 오늘 기록된 사람 수 */
export function summarizeToday(input: {
  classes: ClsFull[]; today: string; marks: Record<string, number>; studentsByClass: Record<string, number>;
  inquiries: Inquiry[]; absences: Absence[]; studentsTotal: number; entry: EntryRow[] | null;
}): TodaySummary {
  const dow = dowOf(input.today);
  const classesToday = input.classes
    .filter(c => (c.schedule ?? []).some(s => s.dow === dow))
    .map(c => {
      const s = (c.schedule ?? []).find(x => x.dow === dow)!;
      return { id: c.id, name: c.name, start: s.start, end: s.end, marked: (input.marks[c.id] ?? 0) > 0, students: input.studentsByClass[c.id] ?? 0 };
    });
  const parents = input.entry?.filter(r => r.role === 'parent') ?? null;
  return {
    classesToday,
    pendingInquiries: input.inquiries.filter(i => !i.answer).length,
    pendingAbsences: input.absences.filter(a => a.status === 'requested').length,
    studentsTotal: input.studentsTotal,
    classesTotal: input.classes.length,
    parentsEntered: parents ? parents.filter(r => r.entered).length : null,
    parentsTotal: parents ? parents.length : null,
  };
}
/** 요약에 필요한 것들을 모아 읽는다. entryStatus 는 원장만(다른 역할은 RPC 가 막는다) → 실패하면 null */
export async function todaySummary(isDirector: boolean): Promise<TodaySummary> {
  const today = kstToday();
  const [classes, students, inquiries, absences, entry] = await Promise.all([
    listClassesFull(),
    listStudents(),
    listInquiries(),
    listAbsences(),
    isDirector ? entryStatus().catch(() => null) : Promise.resolve(null),
  ]);
  const studentsByClass: Record<string, number> = {};
  for (const s of students) for (const c of s.classes) studentsByClass[c.id] = (studentsByClass[c.id] ?? 0) + 1;
  const dow = dowOf(today);
  const todays = classes.filter(c => (c.schedule ?? []).some(s => s.dow === dow));
  const marks: Record<string, number> = {};
  await Promise.all(todays.map(async c => { marks[c.id] = (await todayAttendance(c.id, today)).filter(r => r.status !== null).length; }));
  return summarizeToday({ classes, today, marks, studentsByClass, inquiries, absences, studentsTotal: students.length, entry });
}

/* ── 공지 대상: 알림이 갈 사람 수 ── */
/** 순수 계산 — 대상 반의 활성 학생과 이어진 번호(학생 본인 + 학부모)를 겹치지 않게 센다.
 *  명부(roster_phones)는 클라이언트가 직접 못 읽어서 entryStatus() 행을 학생 이름으로 맞춘다. */
export function countRecipients(studentNames: string[], rows: EntryRow[]): number {
  const names = new Set(studentNames);
  const phones = new Set<string>();
  for (const r of rows) {
    const sn = r.student_name ?? '';
    if (!names.has(sn)) continue;
    if (r.phone) phones.add(r.phone);
  }
  return phones.size;
}
/** 이 공지로 알림이 갈 사람 수. null 이나 빈 배열이면 전체(활성 학생 모두), 반이 여럿이면 합집합.
 *  entryStatus 는 원장만 읽을 수 있어서 강사는 오류가 그대로 올라간다(화면이 문구를 감춘다). */
export async function recipientCount(target: string | string[] | null): Promise<number> {
  const ids = target === null ? null : (Array.isArray(target) ? (target.length ? target : null) : [target]);
  const [students, rows] = await Promise.all([listStudents(), entryStatus()]);
  const list = ids ? students.filter(s => s.classes.some((c: Cls) => ids.includes(c.id))) : students;
  return countRecipients(list.map(s => s.name), rows);
}

/* ── 넣기 거들기 ── */
/** 이 학원에서 최근에 쓴 할 것 제목 — 새 것부터, 같은 제목은 하나만. 부르는 쪽이 지금 반에 이미 걸린 것을 더 걸러 낸다. */
export async function recentTodoTitles(limit = 6): Promise<string[]> {
  const rows = must(await supabase.from('todos').select('title').order('created_at', { ascending: false }).limit(120)) as { title: string }[];
  const out: string[] = [];
  for (const r of rows) { const t = (r.title ?? '').trim(); if (t && !out.includes(t)) out.push(t); if (out.length >= limit) break; }
  return out;
}
/** 휴원일·특강 여러 날을 한 번에 — 부르는 쪽이 이미 있는 날을 걸러 낸 뒤에 쓴다 */
/** 여러 날을 한 번에 — 이미 있는 날은 건너뛰고 실제로 들어간 수를 돌려준다(0018 add_calendar_many).
 *  예전처럼 한 statement 로 넣으면 겹치는 날 하나 때문에 새 날짜까지 통째로 없던 일이 됐다(INT-05). */
export async function addCalendarMany(dates: string[], kind: CalItem['kind'], note: string, classId: string | null): Promise<number> {
  if (!dates.length) return 0;
  return (must(await supabase.rpc('add_calendar_many', { p_dates: dates, p_kind: kind, p_note: note || null, p_class: classId })) as number) ?? 0;
}
