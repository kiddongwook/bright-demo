// 출결 사유(attendance.note) 테스트: 원장이 사유와 함께 저장 → 행에 note → 학부모 알림 문구에 사유 → 알림톡 params 는 그대로.
// node --env-file=../.env.local attendance-note-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const PW = 'attnote-' + rnd; const email = p => `${p}@auth.yeongeo.local`;

// ---- 준비: 학원·반·학생 둘·원장·학부모 둘
const { data: ac } = await admin.from('academies').insert({ slug: `attnote-${rnd}`, name: '사유 테스트' }).select().single();
const A = ac.id;
const { data: cls } = await admin.from('classes').insert({ academy_id: A, name: '고1 A', schedule: [{ dow: 1, start: '19:00', end: '21:00' }] }).select().single();
async function person(role, name, phone, student_id = null) {
  const { data: au, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from('users').insert({ id: au.user.id, name, phone });
  const { data: m } = await admin.from('memberships').insert({ user_id: au.user.id, academy_id: A, role, student_id }).select().single();
  await admin.from('users').update({ active_membership_id: m.id }).eq('id', au.user.id);
  if (role === 'parent') await admin.from('guardians').insert({ student_id, user_id: au.user.id });
  return au.user.id;
}
async function student(name) {
  const { data: st } = await admin.from('students').insert({ academy_id: A, name }).select().single();
  const { error } = await admin.from('enrollments').insert({ student_id: st.id, class_id: cls.id }); if (error) throw error;
  return st;
}
const st1 = await student('박지훈'), st2 = await student('김서연'), st3 = await student('이하늘');
const P_DIR = '0109' + num() + '3'; const dir = await person('director', '김지영', P_DIR);
const P_MOM1 = '0109' + num() + '1'; await person('parent', '박지훈 어머님', P_MOM1, st1.id);
const P_MOM2 = '0109' + num() + '2'; const mom2 = await person('parent', '김서연 어머님', P_MOM2, st2.id);
const d = createClient(URL, ANON, { auth: { persistSession: false } });
ok(!(await d.auth.signInWithPassword({ email: email(P_DIR), password: PW })).error, '원장 로그인');

// ---- A. 앱의 saveAttendanceWithNotes 와 같은 upsert (원장 세션으로 — RLS 도 함께 본다)
const DATE = kst(0);
const rows = [
  { academy_id: A, class_id: cls.id, date: DATE, student_id: st1.id, status: 'late', note: '10분', marked_by: dir },
  { academy_id: A, class_id: cls.id, date: DATE, student_id: st2.id, status: 'absent', note: '병원', marked_by: dir },
  { academy_id: A, class_id: cls.id, date: DATE, student_id: st3.id, status: 'absent', note: null, marked_by: dir },
];
let r = await d.from('attendance').upsert(rows, { onConflict: 'student_id,class_id,date' });
ok(!r.error, '사유와 함께 저장: ' + r.error?.message);

const { data: saved } = await admin.from('attendance').select('student_id, status, note').eq('class_id', cls.id).eq('date', DATE);
const byStudent = sid => (saved ?? []).find(x => x.student_id === sid);
ok(byStudent(st1.id)?.note === '10분', `지각 사유가 행에 남는다 (got ${JSON.stringify(byStudent(st1.id))})`);
ok(byStudent(st2.id)?.note === '병원', `결석 사유가 행에 남는다 (got ${JSON.stringify(byStudent(st2.id))})`);
ok(byStudent(st3.id)?.note === null, '사유 없이도 저장된다');

// ---- B. 학부모 알림 문구에 사유가 붙는다
const { data: notis } = await admin.from('notifications').select('user_id, kind, title, body, link').eq('academy_id', A).eq('kind', 'attendance');
const nOf = uid => (notis ?? []).find(n => n.user_id === uid);
const n1 = nOf((await admin.from('guardians').select('user_id').eq('student_id', st1.id).single()).data.user_id);
ok(!!n1, '지각 학부모 알림이 있다');
ok(n1?.title?.includes('10분') && n1?.body?.includes('10분'), `알림 제목·본문에 사유 (got ${JSON.stringify([n1?.title, n1?.body])})`);
ok(n1?.title?.includes('박지훈') && n1?.title?.includes('지각'), '알림 제목에 이름·상태는 그대로');
const n2 = nOf(mom2);
ok(n2?.body?.includes('병원') && n2?.title?.includes('결석'), `결석 알림에 사유 (got ${JSON.stringify([n2?.title, n2?.body])})`);
const n3 = nOf((await admin.from('guardians').select('user_id').eq('student_id', st3.id).maybeSingle()).data?.user_id ?? '00000000-0000-0000-0000-000000000000');
ok(!n3, '보호자가 없으면 알림도 없다');
const noSep = (notis ?? []).filter(n => n.body?.includes(' · '));
ok(noSep.length === 2, `사유가 없는 알림에는 ' · ' 가 붙지 않는다 (got ${noSep.length})`);

// ---- C. 알림톡 줄(outbox) 의 params 는 그대로 — 심사받은 ATTENDANCE 템플릿에 사유 칸이 없다
const { data: ob } = await admin.from('outbox').select('template_code, params, channel').eq('academy_id', A).eq('template_code', 'ATTENDANCE');
ok((ob ?? []).length === 2, `ATTENDANCE 줄 2건 (got ${ob?.length})`);
ok((ob ?? []).every(o => o.params['상태'] === '지각' || o.params['상태'] === '결석'), `params['상태'] 는 지각·결석 그대로 (got ${JSON.stringify(ob?.map(o => o.params))})`);
ok((ob ?? []).every(o => !JSON.stringify(o.params).includes('10분')), '사유는 알림톡 params 에 새지 않는다');

// ---- D. 사유만 고쳐 다시 저장해도 저장 자체는 된다 (상태가 그대로면 알림은 다시 가지 않는다 — 중복 발송 방지)
const before = (notis ?? []).length;
r = await d.from('attendance').upsert([{ ...rows[0], note: '20분' }], { onConflict: 'student_id,class_id,date' });
ok(!r.error, '사유만 고쳐 저장: ' + r.error?.message);
ok((await admin.from('attendance').select('note').eq('student_id', st1.id).eq('date', DATE).single()).data?.note === '20분', '고친 사유가 남는다');
const { data: after } = await admin.from('notifications').select('id').eq('academy_id', A).eq('kind', 'attendance');
ok((after ?? []).length === before, `상태가 그대로면 알림은 늘지 않는다 (${before} → ${after?.length})`);

// ---- E. 상태가 바뀌면 새 알림이 새 사유와 함께 나간다
r = await d.from('attendance').upsert([{ ...rows[0], status: 'absent', note: '아픔' }], { onConflict: 'student_id,class_id,date' });
ok(!r.error, '상태 바꿔 저장: ' + r.error?.message);
const { data: after2 } = await admin.from('notifications').select('title, body, created_at').eq('academy_id', A).eq('kind', 'attendance').order('created_at', { ascending: false });
ok((after2 ?? []).length === before + 1, `상태가 바뀌면 알림 하나 더 (${before} → ${after2?.length})`);
ok(after2?.[0]?.title?.includes('결석') && after2?.[0]?.body?.includes('아픔'), `새 알림에 새 사유 (got ${JSON.stringify([after2?.[0]?.title, after2?.[0]?.body])})`);

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: attendance note A~E');
