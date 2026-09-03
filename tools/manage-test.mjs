// 4주차 통합 테스트: 명부 저장 → 학부모 로그인 가능 → 반 이동·번호 교체 → 퇴원 → 차단, 메모·휴원일·보강 완결·타임라인·월 출결
// node --env-file=../.env.local manage-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const PW = 'manage-' + rnd; const email = p => `${p}@auth.yeongeo.local`;
const otpSend = phone => fetch(`${URL}/functions/v1/otp-send`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ phone }) });
async function mkUser(name, phone) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true }); if (error) throw error;
  await admin.from('users').insert({ id: data.user.id, name, phone }); return data.user.id;
}

const { data: ac } = await admin.from('academies').insert({ slug: `manage-${rnd}`, name: '관리 테스트' }).select().single(); const A = ac.id;
const { data: c1 } = await admin.from('classes').insert({ academy_id: A, name: '고1 A', schedule: [{ dow: 1, start: '19:00', end: '21:00' }, { dow: 3, start: '19:00', end: '21:00' }] }).select().single();
const { data: c2 } = await admin.from('classes').insert({ academy_id: A, name: '고2 B', schedule: [{ dow: 2, start: '20:00', end: '22:00' }] }).select().single();
// 원장
const P_DIR = '0109' + num() + '3'; const dirId = await mkUser('김지영', P_DIR);
const { data: dm } = await admin.from('memberships').insert({ user_id: dirId, academy_id: A, role: 'director' }).select().single();
await admin.from('users').update({ active_membership_id: dm.id }).eq('id', dirId);
const d = createClient(URL, ANON, { auth: { persistSession: false } }); ok(!(await d.auth.signInWithPassword({ email: email(P_DIR), password: PW })).error, '원장 로그인');

// ---- A. 새 학생 저장 → roster 행 3개(학생1·학부모2), enrollments 1
const P_ST = '0109' + num() + '1', P_MOM = '0109' + num() + '2', P_DAD = '0109' + num() + '4', P_ST2 = '0109' + num() + '5';
let r = await d.rpc('roster_save_student', { sid: null, p_name: '박지훈', p_class_ids: [c1.id], p_student_phone: '010-' + P_ST.slice(3, 7) + '-' + P_ST.slice(7), p_parent_phones: [P_MOM, P_DAD] });
ok(!r.error, 'roster_save_student(new): ' + r.error?.message); const SID = r.data;
let { data: rp } = await admin.from('roster_phones').select('phone, role').eq('student_id', SID);
ok(rp?.length === 3 && rp.filter(x => x.role === 'parent').length === 2 && rp.some(x => x.phone === P_ST && x.role === 'student'), `roster 3행 (got ${JSON.stringify(rp)})`);
let { data: en } = await admin.from('enrollments').select('class_id').eq('student_id', SID); ok(en?.length === 1 && en[0].class_id === c1.id, '반 1개');
ok(!(await d.rpc('roster_of_student', { sid: SID })).error && (await d.rpc('roster_of_student', { sid: SID })).data.length === 3, 'roster_of_student 3행');

// ---- B. 학부모(엄마)가 OTP 로 들어올 수 있다 = roster 대조 통과
ok((await otpSend(P_MOM)).status === 200, '엄마 otp-send 200');
const momId = await mkUser('박지훈 어머님', P_MOM);
const { data: mm } = await admin.from('memberships').insert({ user_id: momId, academy_id: A, role: 'parent', student_id: SID }).select().single();
await admin.from('guardians').insert({ student_id: SID, user_id: momId });
await admin.from('users').update({ active_membership_id: mm.id }).eq('id', momId);
const p = createClient(URL, ANON, { auth: { persistSession: false } }); ok(!(await p.auth.signInWithPassword({ email: email(P_MOM), password: PW })).error, '엄마 로그인');
ok(((await p.from('students').select('id').eq('id', SID)).data ?? []).length === 1, '엄마가 자녀를 본다');

// ---- C. 반 이동(고1 A → 고2 B) + 아빠 번호 제거 + 이름 수정 + 학생 번호 교체(기존 학생 사용자 연결 해제)
const stId = await mkUser('박지훈', P_ST);
r = await d.rpc('roster_save_student', { sid: SID, p_name: '박지훈', p_class_ids: [c1.id], p_student_phone: P_ST, p_parent_phones: [P_MOM, P_DAD] }); ok(!r.error, '학생 사용자 연결: ' + r.error?.message);
ok((await admin.from('students').select('user_id').eq('id', SID).single()).data?.user_id === stId, '학생 user_id 연결');
r = await d.rpc('roster_save_student', { sid: SID, p_name: '박지훈(수정)', p_class_ids: [c2.id], p_student_phone: P_ST2, p_parent_phones: [P_MOM] });
ok(!r.error, 'roster_save_student(edit): ' + r.error?.message);
({ data: en } = await admin.from('enrollments').select('class_id').eq('student_id', SID)); ok(en?.length === 1 && en[0].class_id === c2.id, '반 이동');
({ data: rp } = await admin.from('roster_phones').select('phone').eq('student_id', SID)); ok(rp?.length === 2 && !rp.some(x => x.phone === P_DAD) && rp.some(x => x.phone === P_ST2), '아빠 번호 제거 + 학생 번호 교체');
ok((await admin.from('students').select('name,user_id').eq('id', SID).single()).data?.name === '박지훈(수정)', '이름 수정');
ok((await admin.from('students').select('user_id').eq('id', SID).single()).data?.user_id === null, '옛 학생 번호의 user_id 해제');
ok(((await admin.from('memberships').select('id').eq('user_id', stId).eq('student_id', SID)).data ?? []).length === 0, '옛 학생 membership 삭제');

// ---- D. 새 학부모 번호가 이미 사용자면 바로 이어 준다
const dadId = await mkUser('박지훈 아버님', P_DAD);
r = await d.rpc('roster_save_student', { sid: SID, p_name: '박지훈', p_class_ids: [c2.id], p_student_phone: P_ST2, p_parent_phones: [P_MOM, P_DAD] });
ok(!r.error, 'roster_save_student(re-add dad): ' + r.error?.message);
ok(((await admin.from('memberships').select('id').eq('user_id', dadId).eq('student_id', SID)).data ?? []).length === 1, '아빠 membership 자동 연결');
ok(((await admin.from('guardians').select('user_id').eq('student_id', SID).eq('user_id', dadId)).data ?? []).length === 1, '아빠 guardians 자동 연결');
r = await d.rpc('roster_save_student', { sid: SID, p_name: '박지훈', p_class_ids: [c2.id], p_student_phone: P_ST2, p_parent_phones: [P_MOM, P_DAD] });
ok(!r.error && ((await admin.from('memberships').select('id').eq('user_id', dadId).eq('student_id', SID)).data ?? []).length === 1, '같은 저장을 두 번 해도 membership 은 하나');

// ---- E. 메모·휴원일·출결·보강 완결
r = await d.from('notes').insert({ academy_id: A, student_id: SID, author_id: dirId, kind: 'consult', body: '어머님 상담: 단어 암기 계획' }).select().single(); ok(!r.error, '메모 insert: ' + r.error?.message);
ok(!(await p.from('notes').select('id').eq('student_id', SID)).data?.length, '학부모는 메모를 못 본다');
r = await d.from('calendar').insert({ academy_id: A, date: kst(1), kind: 'closed', note: '휴원' }).select().single(); ok(!r.error, '휴원일 insert: ' + r.error?.message);
ok(((await p.from('calendar').select('date').eq('academy_id', A)).data ?? []).length === 1, '학부모도 휴원일은 본다');
await admin.from('attendance').upsert([{ academy_id: A, student_id: SID, class_id: c2.id, date: kst(-7), status: 'present', marked_by: dirId }, { academy_id: A, student_id: SID, class_id: c2.id, date: kst(-2), status: 'late', marked_by: dirId }], { onConflict: 'student_id,class_id,date' });
const { data: ab } = await admin.from('absence_requests').insert({ academy_id: A, student_id: SID, requested_by: momId, date: kst(-1), reason: '병원', status: 'confirmed', makeup_kind: 'saturday', makeup_at: kst(2) + 'T14:00:00+09:00', decided_by: dirId }).select().single();
r = await d.rpc('makeup_attended', { aid: ab.id }); ok(!r.error, 'makeup_attended: ' + r.error?.message);
ok(!!(await admin.from('absence_requests').select('attended_at').eq('id', ab.id).single()).data?.attended_at, 'attended_at 기록');
ok((await admin.from('attendance').select('status').eq('student_id', SID).eq('date', kst(2)).maybeSingle()).data?.status === 'makeup', '보강 출결 makeup 행');
ok((await p.rpc('makeup_attended', { aid: ab.id })).error, '학부모는 보강 완결 못 함');

// ---- F. 월 출결 (학부모도) · 타임라인 (원장만) · 강사 명부
const ym = kst(0).slice(0, 7);
r = await p.rpc('month_attendance', { sid: SID, ym }); ok(!r.error && Array.isArray(r.data) && r.data.some(x => x.status === 'late'), `month_attendance(학부모): ${r.error?.message ?? r.data?.length}`);
r = await d.rpc('student_timeline', { sid: SID, lim: 50 });
ok(!r.error && r.data.length >= 4 && r.data.some(x => x.kind === 'note') && r.data.some(x => x.kind === 'absence') && r.data.some(x => x.kind === 'attendance'), `timeline: ${r.error?.message ?? JSON.stringify(r.data?.map(x => x.kind))}`);
ok((await p.rpc('student_timeline', { sid: SID, lim: 10 })).error, '학부모는 타임라인 RPC 거절');
const P_T = '0109' + num() + '6';
r = await d.rpc('roster_save_teacher', { p_name: '이강사', p_phone: P_T }); ok(!r.error, 'roster_save_teacher: ' + r.error?.message);
r = await d.rpc('roster_save_teacher', { p_name: '이강사', p_phone: P_T }); ok(!r.error, '강사 두 번 저장도 OK');
ok(((await admin.from('roster_phones').select('id').eq('academy_id', A).eq('role', 'teacher')).data ?? []).length === 1, '강사 roster 행 하나');
r = await d.rpc('list_teachers'); ok(!r.error && r.data.length === 1 && r.data[0].name === '이강사', 'list_teachers');
ok((await otpSend(P_T)).status === 200, '강사 otp-send 200');
r = await d.rpc('roster_remove_teacher', { p_phone: P_T }); ok(!r.error && (await d.rpc('list_teachers')).data.length === 0, '강사 빼기');
ok((await p.rpc('roster_save_teacher', { p_name: 'x', p_phone: P_T })).error, '학부모는 강사 추가 못 함');

// ---- G. 퇴원 → 학부모 차단, 데이터 보존
r = await d.rpc('student_leave', { sid: SID }); ok(!r.error, 'student_leave: ' + r.error?.message);
const st = (await admin.from('students').select('status,left_at').eq('id', SID).single()).data; ok(st?.status === 'left' && st.left_at, '학생 status left');
ok(((await admin.from('roster_phones').select('id').eq('student_id', SID)).data ?? []).length === 0, 'roster 행 삭제');
ok(((await admin.from('memberships').select('id').eq('student_id', SID)).data ?? []).length === 0, 'membership 삭제');
ok(((await admin.from('attendance').select('id').eq('student_id', SID)).data ?? []).length >= 2, '출결은 남는다');
ok((await otpSend(P_MOM)).status === 404, '퇴원 뒤 엄마 otp-send 404');
const p2 = createClient(URL, ANON, { auth: { persistSession: false } }); await p2.auth.signInWithPassword({ email: email(P_MOM), password: PW });
ok(!((await p2.from('students').select('id').eq('id', SID)).data ?? []).length, '남은 세션으로도 자녀를 못 본다');
ok(((await d.from('students').select('id,status').eq('id', SID)).data ?? []).length === 1, '원장은 퇴원생을 본다');

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: manage A~G');
