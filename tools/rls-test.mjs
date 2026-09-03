import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const email = p => `${p}@auth.yeongeo.local`;
const PW = 'rls-test-' + Math.random().toString(36).slice(2);

async function mkUser(phone, name) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from('users').insert({ id: data.user.id, name, phone });
  return data.user.id;
}
async function login(phone, membershipId) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(phone), password: PW });
  if (error) throw error;
  const { error: e2 } = await c.rpc('set_active_membership', { m: membershipId });
  if (e2) throw e2;
  return c;
}

// ── 씨앗: 학원 A, B ──
const tag = Date.now().toString(36);
const num = Date.now().toString().slice(-6);   // 전화번호용 숫자 꼬리
const { data: A } = await admin.from('academies').insert({ name: 'A', slug: 'a-' + tag }).select().single();
const { data: B } = await admin.from('academies').insert({ name: 'B', slug: 'b-' + tag }).select().single();
const { data: cA } = await admin.from('classes').insert({ academy_id: A.id, name: 'A반' }).select().single();
const { data: cB } = await admin.from('classes').insert({ academy_id: B.id, name: 'B반' }).select().single();
const { data: sA1 } = await admin.from('students').insert({ academy_id: A.id, name: 'A학생1' }).select().single();
const { data: sA2 } = await admin.from('students').insert({ academy_id: A.id, name: 'A학생2' }).select().single();
const { data: sB1 } = await admin.from('students').insert({ academy_id: B.id, name: 'B학생1' }).select().single();
await admin.from('enrollments').insert([{ student_id: sA1.id, class_id: cA.id }, { student_id: sA2.id, class_id: cA.id }, { student_id: sB1.id, class_id: cB.id }]);
const dirA = await mkUser('0101' + num + '1', 'A원장');
const parA = await mkUser('0101' + num + '2', 'A학부모');
const stuA = await mkUser('0101' + num + '3', 'A학생1');
const dirB = await mkUser('0101' + num + '4', 'B원장');
const { data: mDirA } = await admin.from('memberships').insert({ user_id: dirA, academy_id: A.id, role: 'director' }).select().single();
const { data: mParA } = await admin.from('memberships').insert({ user_id: parA, academy_id: A.id, role: 'parent', student_id: sA1.id }).select().single();
const { data: mStuA } = await admin.from('memberships').insert({ user_id: stuA, academy_id: A.id, role: 'student', student_id: sA1.id }).select().single();
const { data: mDirB } = await admin.from('memberships').insert({ user_id: dirB, academy_id: B.id, role: 'director' }).select().single();
await admin.from('guardians').insert({ student_id: sA1.id, user_id: parA });
await admin.from('students').update({ user_id: stuA }).eq('id', sA1.id);
await admin.from('attendance').insert([
  { academy_id: A.id, student_id: sA1.id, class_id: cA.id, date: '2026-06-17', status: 'late' },
  { academy_id: A.id, student_id: sA2.id, class_id: cA.id, date: '2026-06-17', status: 'present' },
  { academy_id: B.id, student_id: sB1.id, class_id: cB.id, date: '2026-06-17', status: 'absent' }]);
await admin.from('notices').insert([
  { academy_id: A.id, author_id: dirA, title: 'A전체' },
  { academy_id: A.id, author_id: dirA, title: 'A반공지', target_class_id: cA.id },
  { academy_id: B.id, author_id: dirB, title: 'B전체' }]);

// ── 검사 ──
const d = await login('0101' + num + '1', mDirA.id);
let r = await d.from('attendance').select('id'); ok(r.data?.length === 2, 'A원장 attendance=' + r.data?.length + ' (2)');
r = await d.from('notices').select('id');        ok(r.data?.length === 2, 'A원장 notices=' + r.data?.length + ' (2)');
r = await d.from('students').select('id').eq('academy_id', B.id); ok(r.data?.length === 0, 'A원장이 B학생을 봄');
r = await d.from('attendance').insert({ academy_id: B.id, student_id: sB1.id, class_id: cB.id, date: '2026-06-18', status: 'present' });
ok(!!r.error, 'A원장이 B출결을 씀');

const p = await login('0101' + num + '2', mParA.id);
r = await p.from('attendance').select('student_id'); ok(r.data?.length === 1 && r.data[0].student_id === sA1.id, 'A학부모 attendance=' + JSON.stringify(r.data) + ' (자녀만)');
r = await p.from('students').select('id');         ok(r.data?.length === 1, 'A학부모 students=' + r.data?.length + ' (자녀만)');
r = await p.from('notices').select('title');       ok(r.data?.length === 2, 'A학부모 notices=' + r.data?.length + ' (전체+자기 반)');
r = await p.from('attendance').update({ status: 'present' }).eq('student_id', sA1.id).select();
ok(!r.data?.length, 'A학부모가 출결을 고침');
r = await p.from('absence_requests').insert({ academy_id: A.id, student_id: sA1.id, requested_by: parA, date: '2026-06-20', reason: '병원' }); ok(!r.error, 'A학부모 결석 신청 실패: ' + r.error?.message);
r = await p.from('absence_requests').insert({ academy_id: A.id, student_id: sA2.id, requested_by: parA, date: '2026-06-20', reason: '남의 자녀' }); ok(!!r.error, 'A학부모가 남의 자녀 결석 신청');
r = await p.from('roster_phones').select('id');    ok(r.error || r.data?.length === 0, 'A학부모가 명부 번호를 봄');

const s = await login('0101' + num + '3', mStuA.id);
r = await s.from('attendance').select('student_id'); ok(r.data?.length === 1, 'A학생 attendance=' + r.data?.length + ' (본인만)');
r = await s.from('notices').select('id');            ok(r.data?.length === 2, 'A학생 notices=' + r.data?.length);
r = await s.from('notes').select('id');              ok(r.error || r.data?.length === 0, 'A학생이 상담 메모를 봄');

const b = await login('0101' + num + '4', mDirB.id);
r = await b.from('notices').select('id'); ok(r.data?.length === 1, 'B원장 notices=' + r.data?.length + ' (1)');
r = await b.from('attendance').select('id'); ok(r.data?.length === 1, 'B원장 attendance=' + r.data?.length + ' (1)');

// ── 강사: 담당 반만 (읽기·쓰기) ──
const { data: cA2 } = await admin.from('classes').insert({ academy_id: A.id, name: 'A반2' }).select().single();
const { data: sA3 } = await admin.from('students').insert({ academy_id: A.id, name: 'A학생3' }).select().single();
await admin.from('enrollments').insert({ student_id: sA3.id, class_id: cA2.id });
await admin.from('notices').insert({ academy_id: A.id, author_id: dirA, title: 'A반2 공지', body: '', target_class_id: cA2.id });
const tchA = await mkUser('0101' + num + '5', 'A강사');
const { data: mTch } = await admin.from('memberships').insert({ user_id: tchA, academy_id: A.id, role: 'teacher' }).select().single();
const t = await login('0101' + num + '5', mTch.id);
ok(((await t.from('students').select('id')).data ?? []).length === 0, '담당 반 없는 강사는 학생을 못 본다');
await admin.from('classes').update({ teacher_id: tchA }).eq('id', cA.id);
const tst = (await t.from('students').select('id')).data ?? [];
ok(tst.length === 2 && !tst.some(x => x.id === sA3.id), `강사 담당 반 학생만 (got ${tst.length})`);
const tn = (await t.from('notices').select('title')).data ?? [];
ok(tn.some(x => x.title !== 'A반2 공지') && !tn.some(x => x.title === 'A반2 공지'), `강사 공지 읽기는 전체+담당 반만 (got ${tn.map(x => x.title).join('/')})`);
ok(!(await t.from('attendance').insert({ academy_id: A.id, student_id: sA1.id, class_id: cA.id, date: '2026-06-01', status: 'present', marked_by: tchA })).error, '강사 담당 반 출결 쓰기');
ok(!!(await t.from('attendance').insert({ academy_id: A.id, student_id: sA3.id, class_id: cA2.id, date: '2026-06-01', status: 'present', marked_by: tchA })).error, '강사 다른 반 출결은 거절');
ok(!(await t.from('notices').insert({ academy_id: A.id, author_id: tchA, title: '반 공지', body: '', target_class_id: cA.id })).error, '강사 담당 반 공지 쓰기');
ok(!!(await t.from('notices').insert({ academy_id: A.id, author_id: tchA, title: '전체 공지', body: '', target_class_id: null })).error, '전체 공지는 원장만');
ok(!!(await t.rpc('roster_save_student', { sid: null, p_name: 'x', p_class_ids: [cA.id], p_student_phone: '', p_parent_phones: [] })).error, '강사는 명부 편집 못 함');
ok(!!(await t.from('calendar').insert({ academy_id: A.id, date: '2026-06-02', kind: 'closed' })).error, '강사는 휴원일 못 넣음');
ok(!(await t.rpc('student_timeline', { sid: sA1.id, lim: 5 })).error, '강사 담당 학생 타임라인 OK');
ok(!!(await t.rpc('student_timeline', { sid: sA3.id, lim: 5 })).error, '강사 다른 반 학생 타임라인 거절');
ok(((await t.from('users').select('id').eq('id', dirA)).data ?? []).length === 1, '강사가 원장 이름을 본다(메모·문의 작성자 표시)');
ok(((await d.from('students').select('id')).data ?? []).length === 3, '원장은 여전히 학생 전부');

// ── 정리 ──
for (const id of [dirA, parA, stuA, dirB, tchA]) await admin.auth.admin.deleteUser(id);
await admin.from('academies').delete().in('id', [A.id, B.id]);

console.log(fails.length ? 'FAIL:\n - ' + fails.join('\n - ') : 'PASS: RLS isolation (A/B academies, director/parent/student)');
process.exit(fails.length ? 1 : 0);
