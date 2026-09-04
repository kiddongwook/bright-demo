// 6주차: 공지 대상 여러 반 (0021_notice_targets)
// 반 3개 · 각 반에 학생 1 + 학부모 1. 두 반에만 건 공지가 그 두 반에만 가고, 나머지 반은 아예 못 읽는지.
// node --env-file=../.env.local notice-targets-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8);
const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'nt-' + rnd; const email = p => `${p}@auth.yeongeo.local`;
const sorted = a => [...a].sort();

async function mkUser(name, phone) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from('users').insert({ id: data.user.id, name, phone });
  return data.user.id;
}
async function signIn(phone) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(phone), password: PW });
  if (error) throw error;
  return c;
}
async function member(uid, A, role, studentId = null) {
  const { data, error } = await admin.from('memberships').insert({ user_id: uid, academy_id: A, role, student_id: studentId }).select().single();
  if (error) throw error;
  await admin.from('users').update({ active_membership_id: data.id }).eq('id', uid);
  return data.id;
}

/* ── 판 깔기 ── */
const { data: ac } = await admin.from('academies').insert({ slug: `nt-${rnd}`, name: '공지 대상 점검' }).select().single();
const A = ac.id;
const cls = [];
for (const nm of ['고1 A', '고2 B', '고3 C']) {
  const { data } = await admin.from('classes').insert({ academy_id: A, name: nm, schedule: [{ dow: 1, start: '19:00', end: '21:00' }] }).select().single();
  cls.push(data);
}
const [c1, c2, c3] = cls;

const P_DIR = '0109' + num() + '0'; const dirId = await mkUser('원장', P_DIR);
await member(dirId, A, 'director');
const d = await signIn(P_DIR);

// 반마다 학생 1 · 학부모 1
const pack = [];
for (let i = 0; i < 3; i++) {
  const { data: st } = await admin.from('students').insert({ academy_id: A, name: `학생${i + 1}` }).select().single();
  await admin.from('enrollments').insert({ student_id: st.id, class_id: cls[i].id });
  const pPhone = '0109' + num() + '1', sPhone = '0109' + num() + '2';
  const parentId = await mkUser(`학부모${i + 1}`, pPhone);
  await member(parentId, A, 'parent', st.id);
  await admin.from('guardians').insert({ student_id: st.id, user_id: parentId });
  const studentId = await mkUser(`학생${i + 1}`, sPhone);
  await admin.from('students').update({ user_id: studentId }).eq('id', st.id);
  await member(studentId, A, 'student', st.id);
  pack.push({ st, parentId, studentId, pPhone, sPhone });
}
const [g1, g2, g3] = pack;

const notifiedBy = async link => {
  const { data } = await admin.from('notifications').select('user_id, kind').eq('academy_id', A).eq('link', link);
  return data ?? [];
};

/* ── A. 두 반에 건 공지 ── */
let r = await d.rpc('create_notice_v2', { p_title: `대상 둘 ${rnd}`, p_body: '본문', p_class_ids: [c1.id, c2.id] });
ok(!r.error, 'create_notice_v2(2반): ' + r.error?.message);
const N2 = r.data;
{
  const { data: n } = await admin.from('notices').select('target_class_id, author_id').eq('id', N2).single();
  ok(n?.target_class_id === null, `두 반이면 target_class_id 는 null (got ${n?.target_class_id})`);
  ok(n?.author_id === dirId, '지은이는 원장');
  const { data: t } = await admin.from('notice_targets').select('class_id').eq('notice_id', N2);
  ok(t?.length === 2 && sorted(t.map(x => x.class_id)).join() === sorted([c1.id, c2.id]).join(), `notice_targets 2줄 (got ${t?.length})`);
  const { data: ids } = await admin.rpc('notice_class_ids', { nid: N2 });
  ok(Array.isArray(ids) && ids.length === 2, `notice_class_ids 2개 (got ${JSON.stringify(ids)})`);
}

/* ── B. 알림은 그 두 반의 학부모·학생에게만 ── */
{
  const got = await notifiedBy('notice-view:' + N2);
  const want = sorted([g1.parentId, g1.studentId, g2.parentId, g2.studentId]);
  ok(sorted(got.map(x => x.user_id)).join() === want.join(), `알림 4명(1·2반) (got ${got.length}: ${JSON.stringify(got.map(x => x.user_id))})`);
  ok(!got.some(x => x.user_id === g3.parentId || x.user_id === g3.studentId), '3반에는 알림이 안 간다');
  ok(got.every(x => x.kind === 'notice'), 'kind notice');
}

/* ── C. 안 걸린 반의 학부모는 아예 못 읽는다 (RLS) ── */
const p1 = await signIn(g1.pPhone), p3 = await signIn(g3.pPhone);
{
  const a = await p1.from('notices').select('id').eq('id', N2);
  ok((a.data ?? []).length === 1, '1반 학부모는 본다');
  const b = await p3.from('notices').select('id').eq('id', N2);
  ok((b.data ?? []).length === 0, `3반 학부모는 못 본다 (got ${JSON.stringify(b.data)})`);
  const ta = await p1.from('notice_targets').select('class_id').eq('notice_id', N2);
  ok((ta.data ?? []).length === 2, `1반 학부모는 대상 줄 2개를 본다 (got ${ta.data?.length}) ${ta.error?.message ?? ''}`);
  const tb = await p3.from('notice_targets').select('class_id').eq('notice_id', N2);
  ok((tb.data ?? []).length === 0, '3반 학부모는 대상 줄도 못 본다');
  ok((await admin.rpc('notice_visible_to', { nid: N2, uid: g1.parentId })).data === true, 'notice_visible_to 1반 학부모 true');
  ok((await admin.rpc('notice_visible_to', { nid: N2, uid: g3.parentId })).data === false, 'notice_visible_to 3반 학부모 false');
  ok((await admin.rpc('notice_visible_to', { nid: N2, uid: dirId })).data === true, 'notice_visible_to 원장 true');
}

/* ── D. 읽은 사람 수 · 다시 알리기는 안 읽은 사람에게만 ── */
{
  r = await d.rpc('notice_readers', { nid: N2 });
  ok(!r.error && r.data?.length === 2, `notice_readers 2명(1·2반 학부모): ${r.error?.message ?? r.data?.length}`);
  ok(!r.error && sorted(r.data.map(x => x.user_id)).join() === sorted([g1.parentId, g2.parentId]).join(), '읽은 사람 목록이 대상 학부모와 같다');
  ok(!r.error && r.data.every(x => x.read_at === null), '아직 아무도 안 읽음');
  ok(!(await p1.from('notice_reads').insert({ notice_id: N2, user_id: g1.parentId })).error, '1반 학부모 읽음 표시');
  r = await d.rpc('notice_readers', { nid: N2 });
  ok(r.data?.filter(x => x.read_at).length === 1, `읽음 1명 (got ${r.data?.filter(x => x.read_at).length})`);
  r = await d.rpc('remind_notice', { nid: N2 });
  ok(!r.error && r.data === 1, `remind 1명에게만: ${r.error?.message ?? r.data}`);
  const { data: rem } = await admin.from('notifications').select('user_id').eq('academy_id', A).eq('kind', 'remind').eq('link', 'notice-view:' + N2);
  ok(rem?.length === 1 && rem[0].user_id === g2.parentId, `다시 알림은 안 읽은 2반 학부모에게만 (got ${JSON.stringify(rem)})`);
}

/* ── E. 옛 공지(target_class_id 만) 도 그대로 ── */
{
  const { data: legacy } = await admin.from('notices').insert({ academy_id: A, author_id: dirId, title: `옛 공지 ${rnd}`, body: '', target_class_id: c3.id, photos: [] }).select().single();
  const got = await notifiedBy('notice-view:' + legacy.id);
  ok(sorted(got.map(x => x.user_id)).join() === sorted([g3.parentId, g3.studentId]).join(), `옛 공지는 3반에만 (got ${got.length})`);
  const { data: ids } = await admin.rpc('notice_class_ids', { nid: legacy.id });
  ok(ids?.length === 1 && ids[0] === c3.id, `옛 공지 notice_class_ids = [c3] (got ${JSON.stringify(ids)})`);
  ok(((await p3.from('notices').select('id').eq('id', legacy.id)).data ?? []).length === 1, '3반 학부모는 옛 공지를 본다');
  ok(((await p1.from('notices').select('id').eq('id', legacy.id)).data ?? []).length === 0, '1반 학부모는 옛 공지를 못 본다');
  r = await d.rpc('notice_readers', { nid: legacy.id });
  ok(!r.error && r.data?.length === 1 && r.data[0].user_id === g3.parentId, `옛 공지 읽은 사람 1명: ${r.error?.message ?? r.data?.length}`);
}

/* ── F. 반 하나 · 전체 ── */
{
  r = await d.rpc('create_notice_v2', { p_title: `한 반 ${rnd}`, p_body: '', p_class_ids: [c3.id] });
  ok(!r.error, 'create_notice_v2(1반): ' + r.error?.message);
  const one = r.data;
  const { data: n } = await admin.from('notices').select('target_class_id').eq('id', one).single();
  ok(n?.target_class_id === c3.id, '반이 하나면 target_class_id 에도 적힌다');
  ok(((await admin.from('notice_targets').select('class_id').eq('notice_id', one)).data ?? []).length === 1, '한 반도 대상 줄을 남긴다');
  ok(sorted((await notifiedBy('notice-view:' + one)).map(x => x.user_id)).join() === sorted([g3.parentId, g3.studentId]).join(), '한 반 공지는 그 반에만');

  r = await d.rpc('create_notice_v2', { p_title: `전체 ${rnd}`, p_body: '', p_class_ids: [] });
  ok(!r.error, 'create_notice_v2(전체): ' + r.error?.message);
  const all = r.data;
  const { data: na } = await admin.from('notices').select('target_class_id').eq('id', all).single();
  ok(na?.target_class_id === null, '전체 공지는 target_class_id null');
  ok(((await admin.from('notice_targets').select('class_id').eq('notice_id', all)).data ?? []).length === 0, '전체 공지는 대상 줄 없음');
  ok((await admin.rpc('notice_class_ids', { nid: all })).data === null, '전체 공지 notice_class_ids 는 null');
  ok((await notifiedBy('notice-view:' + all)).length === 6, `전체 공지는 6명 모두에게 (got ${(await notifiedBy('notice-view:' + all)).length})`);
  ok(((await p3.from('notices').select('id').eq('id', all)).data ?? []).length === 1, '전체 공지는 모두 본다');
}

/* ── G. 강사 범위 ── */
let teacherId = null;
{
  const P_T = '0109' + num() + '3'; const tId = await mkUser('이강사', P_T); teacherId = tId;
  await admin.from('classes').update({ teacher_id: tId }).eq('id', c1.id);
  await member(tId, A, 'teacher');
  const t = await signIn(P_T);
  r = await t.rpc('create_notice_v2', { p_title: `강사 ${rnd}`, p_body: '', p_class_ids: [c1.id] });
  ok(!r.error, '강사는 담당 반에 공지: ' + r.error?.message);
  ok(!!(await t.rpc('create_notice_v2', { p_title: `강사x ${rnd}`, p_body: '', p_class_ids: [c1.id, c3.id] })).error, '강사는 담당 밖 반이 섞이면 거절');
  ok(!!(await t.rpc('create_notice_v2', { p_title: `강사x ${rnd}`, p_body: '', p_class_ids: [] })).error, '강사는 전체 공지 거절');
  ok(((await t.from('notices').select('id').eq('id', N2)).data ?? []).length === 1, '강사는 담당 반이 낀 공지를 본다');
  ok(!!(await t.rpc('notice_readers', { nid: N2 })).error, '담당 밖 반이 섞인 공지의 읽은 사람은 못 본다');
  const mine = (await t.rpc('create_notice_v2', { p_title: `강사 읽음 ${rnd}`, p_body: '', p_class_ids: [c1.id] })).data;
  ok(!(await t.rpc('notice_readers', { nid: mine })).error, '자기 반 공지의 읽은 사람은 본다');
}

/* ── H. 반을 지우려면 공지를 먼저 ── */
{
  const del = await d.from('classes').delete().eq('id', c2.id);
  ok(!!del.error, '대상으로 걸린 반은 못 지운다');
  ok(/notice_targets/.test(del.error?.message ?? ''), `막은 쪽이 notice_targets 라고 알려 준다 (got ${del.error?.message})`);
}

/* ── 뒷정리: 학원을 통째로 지우는 길이 막히지 않았는지도 여기서 본다 ── */
const delAc = await admin.from('academies').delete().eq('id', A);
ok(!delAc.error, '학원 삭제(cascade)가 대상 줄 때문에 막히지 않는다: ' + delAc.error?.message);
for (const u of [dirId, teacherId, ...pack.flatMap(x => [x.parentId, x.studentId])]) if (u) await admin.auth.admin.deleteUser(u).catch(() => {});

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: notice-targets A~H');
