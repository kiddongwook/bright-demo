import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const email = p => `${p}@auth.yeongeo.local`; const PW = 'flow-' + Math.random().toString(36).slice(2);
const num = Date.now().toString().slice(-6), tag = 'flow-' + num;
async function mkUser(phone, name) { const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true }); if (error) throw error; await admin.from('users').insert({ id: data.user.id, name, phone }); return data.user.id; }
async function login(phone, mid) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email: email(phone), password: PW }); if (error) throw error; await c.rpc('set_active_membership', { m: mid }); return c; }
const unread = async (c) => (await c.from('notifications').select('id, title, link, kind').is('read_at', null)).data ?? [];

// 씨앗: 학원 1, 반 1, 학생 1, 원장·학부모·학생
const { data: A } = await admin.from('academies').insert({ name: 'Flow', slug: tag }).select().single();
const { data: cls } = await admin.from('classes').insert({ academy_id: A.id, name: '고1 A' }).select().single();
const { data: st } = await admin.from('students').insert({ academy_id: A.id, name: '흐름학생' }).select().single();
await admin.from('enrollments').insert({ student_id: st.id, class_id: cls.id });
const dir = await mkUser('0102' + num + '1', '흐름원장'), par = await mkUser('0102' + num + '2', '흐름 어머님'), stu = await mkUser('0102' + num + '3', '흐름학생');
const { data: mD } = await admin.from('memberships').insert({ user_id: dir, academy_id: A.id, role: 'director' }).select().single();
const { data: mP } = await admin.from('memberships').insert({ user_id: par, academy_id: A.id, role: 'parent', student_id: st.id }).select().single();
const { data: mS } = await admin.from('memberships').insert({ user_id: stu, academy_id: A.id, role: 'student', student_id: st.id }).select().single();
await admin.from('guardians').insert({ student_id: st.id, user_id: par });
await admin.from('students').update({ user_id: stu }).eq('id', st.id);
const d = await login('0102' + num + '1', mD.id), p = await login('0102' + num + '2', mP.id), s = await login('0102' + num + '3', mS.id);

// 1. 원장 공지 → 학부모·학생 알림
let r = await d.from('notices').insert({ academy_id: A.id, author_id: dir, title: '흐름 공지', body: '본문', target_class_id: cls.id }).select().single();
ok(!r.error, '공지 insert: ' + r.error?.message); const nid = r.data?.id;
ok((await unread(p)).some(n => n.link === 'notice-view:' + nid), '학부모 공지 알림 없음');
ok((await unread(s)).some(n => n.link === 'notice-view:' + nid), '학생 공지 알림 없음');
// 2. 읽은 사람: 아직 0 → 학부모가 읽음 → 1
let rd = await d.rpc('notice_readers', { nid }); ok(!rd.error && rd.data?.length === 1 && rd.data[0].read_at === null, '읽은 사람 초기: ' + JSON.stringify(rd.data ?? rd.error));
ok(!(await p.from('notice_reads').insert({ notice_id: nid, user_id: par })).error, '학부모 읽음 기록 실패');
rd = await d.rpc('notice_readers', { nid }); ok(!!rd.data?.[0]?.read_at, '읽은 뒤 read_at 없음');
ok(!!(await p.rpc('notice_readers', { nid })).error, '학부모가 읽은 사람을 봄');
// 3. 다시 알리기: 다 읽었으니 0명
let rm = await d.rpc('remind_notice', { nid }); ok(!rm.error && rm.data === 0, 'remind 0 기대: ' + JSON.stringify(rm.data ?? rm.error));
// 4. 학부모 문의 → 원장 알림 → 원장 답변 → 학부모 알림
r = await p.from('inquiries').insert({ academy_id: A.id, student_id: st.id, asked_by: par, topic: '숙제', body: '범위요?' }).select().single();
ok(!r.error, '문의 insert: ' + r.error?.message); const iid = r.data?.id;
ok((await unread(d)).some(n => n.link === 'inbox:' + iid), '원장 문의 알림 없음');
ok(!(await d.from('inquiries').update({ answer: '51~75', answered_by: dir, answered_at: new Date().toISOString() }).eq('id', iid)).error, '답변 실패');
ok((await unread(p)).some(n => n.link === 'ask-mine:' + iid), '학부모 답변 알림 없음');
// 5. 결석 신청 → 원장 알림 → 보강 확정 → 학부모 알림
r = await p.from('absence_requests').insert({ academy_id: A.id, student_id: st.id, requested_by: par, date: '2026-06-18', reason: '병원' }).select().single();
ok(!r.error, '결석 신청: ' + r.error?.message); const aid = r.data?.id;
ok((await unread(d)).some(n => n.link === 'today:' + aid), '원장 결석 알림 없음');
ok(!(await d.from('absence_requests').update({ status: 'confirmed', makeup_kind: 'saturday', makeup_at: '2026-06-21T14:00:00+09:00', decided_by: dir }).eq('id', aid)).error, '보강 확정 실패');
ok((await unread(p)).some(n => n.link === 'child:' + aid), '학부모 보강 알림 없음');
// 6. 출결 저장(지각) → 학부모 알림; 주간 조회는 자기 자녀만
ok(!(await d.from('attendance').insert({ academy_id: A.id, student_id: st.id, class_id: cls.id, date: '2026-06-17', status: 'late', marked_by: dir })).error, '출결 저장 실패');
ok((await unread(p)).some(n => n.kind === 'attendance'), '학부모 출결 알림 없음');
let wk = await p.rpc('week_attendance', { sid: st.id, d_from: '2026-06-15', d_to: '2026-06-21' }); ok(!wk.error && wk.data?.length === 1 && wk.data[0].status === 'late', '주간 출결: ' + JSON.stringify(wk.data ?? wk.error));
// 7. 학생 할 것 체크
r = await d.from('todos').insert({ academy_id: A.id, class_id: cls.id, kind: 'homework', title: '워크북', due_date: '2026-06-19' }).select().single();
ok(!(await s.from('todo_done').insert({ todo_id: r.data.id, student_id: st.id })).error, '학생 할 것 체크 실패');
ok((await s.from('todo_done').select('todo_id')).data?.length === 1, '학생 done 조회');
// 8. 알림 읽음 처리
const mine = await unread(p); ok(mine.length >= 3, '학부모 미읽음 ' + mine.length + ' (≥3)');
ok(!(await p.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)).error, '읽음 처리 실패');
ok((await unread(p)).length === 0, '읽음 처리 뒤 남음');

for (const id of [dir, par, stu]) await admin.auth.admin.deleteUser(id);
await admin.from('academies').delete().eq('id', A.id);
console.log(fails.length ? 'FAIL:\n - ' + fails.join('\n - ') : 'PASS: week-2 flow (notice→noti→readers→remind, inquiry↔answer, absence↔makeup, attendance→noti, todo, read)');
process.exit(fails.length ? 1 : 0);
