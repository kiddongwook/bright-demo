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
const { data: A } = await admin.from('academies').insert({ name: 'A', slug: 'a-' + tag }).select().single();
const { data: B } = await admin.from('academies').insert({ name: 'B', slug: 'b-' + tag }).select().single();
const { data: cA } = await admin.from('classes').insert({ academy_id: A.id, name: 'A반' }).select().single();
const { data: cB } = await admin.from('classes').insert({ academy_id: B.id, name: 'B반' }).select().single();
const { data: sA1 } = await admin.from('students').insert({ academy_id: A.id, name: 'A학생1' }).select().single();
const { data: sA2 } = await admin.from('students').insert({ academy_id: A.id, name: 'A학생2' }).select().single();
const { data: sB1 } = await admin.from('students').insert({ academy_id: B.id, name: 'B학생1' }).select().single();
await admin.from('enrollments').insert([{ student_id: sA1.id, class_id: cA.id }, { student_id: sA2.id, class_id: cA.id }, { student_id: sB1.id, class_id: cB.id }]);
const dirA = await mkUser('0101' + tag.slice(-6) + '1', 'A원장');
const parA = await mkUser('0101' + tag.slice(-6) + '2', 'A학부모');
const stuA = await mkUser('0101' + tag.slice(-6) + '3', 'A학생1');
const dirB = await mkUser('0101' + tag.slice(-6) + '4', 'B원장');
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
const d = await login('0101' + tag.slice(-6) + '1', mDirA.id);
let r = await d.from('attendance').select('id'); ok(r.data?.length === 2, 'A원장 attendance=' + r.data?.length + ' (2)');
r = await d.from('notices').select('id');        ok(r.data?.length === 2, 'A원장 notices=' + r.data?.length + ' (2)');
r = await d.from('students').select('id').eq('academy_id', B.id); ok(r.data?.length === 0, 'A원장이 B학생을 봄');
r = await d.from('attendance').insert({ academy_id: B.id, student_id: sB1.id, class_id: cB.id, date: '2026-06-18', status: 'present' });
ok(!!r.error, 'A원장이 B출결을 씀');

const p = await login('0101' + tag.slice(-6) + '2', mParA.id);
r = await p.from('attendance').select('student_id'); ok(r.data?.length === 1 && r.data[0].student_id === sA1.id, 'A학부모 attendance=' + JSON.stringify(r.data) + ' (자녀만)');
r = await p.from('students').select('id');         ok(r.data?.length === 1, 'A학부모 students=' + r.data?.length + ' (자녀만)');
r = await p.from('notices').select('title');       ok(r.data?.length === 2, 'A학부모 notices=' + r.data?.length + ' (전체+자기 반)');
r = await p.from('attendance').update({ status: 'present' }).eq('student_id', sA1.id).select();
ok(!r.data?.length, 'A학부모가 출결을 고침');
r = await p.from('absence_requests').insert({ academy_id: A.id, student_id: sA1.id, requested_by: parA, date: '2026-06-20', reason: '병원' }); ok(!r.error, 'A학부모 결석 신청 실패: ' + r.error?.message);
r = await p.from('absence_requests').insert({ academy_id: A.id, student_id: sA2.id, requested_by: parA, date: '2026-06-20', reason: '남의 자녀' }); ok(!!r.error, 'A학부모가 남의 자녀 결석 신청');
r = await p.from('roster_phones').select('id');    ok(r.error || r.data?.length === 0, 'A학부모가 명부 번호를 봄');

const s = await login('0101' + tag.slice(-6) + '3', mStuA.id);
r = await s.from('attendance').select('student_id'); ok(r.data?.length === 1, 'A학생 attendance=' + r.data?.length + ' (본인만)');
r = await s.from('notices').select('id');            ok(r.data?.length === 2, 'A학생 notices=' + r.data?.length);
r = await s.from('notes').select('id');              ok(r.error || r.data?.length === 0, 'A학생이 상담 메모를 봄');

const b = await login('0101' + tag.slice(-6) + '4', mDirB.id);
r = await b.from('notices').select('id'); ok(r.data?.length === 1, 'B원장 notices=' + r.data?.length + ' (1)');
r = await b.from('attendance').select('id'); ok(r.data?.length === 1, 'B원장 attendance=' + r.data?.length + ' (1)');

// ── 정리 ──
for (const id of [dirA, parA, stuA, dirB]) await admin.auth.admin.deleteUser(id);
await admin.from('academies').delete().in('id', [A.id, B.id]);

console.log(fails.length ? 'FAIL:\n - ' + fails.join('\n - ') : 'PASS: RLS isolation (A/B academies, director/parent/student)');
process.exit(fails.length ? 1 : 0);
