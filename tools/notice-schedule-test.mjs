// 4차 묶음 T4: 공지 예약 발송 (0027_notice_schedule)
// 원장이 1시간 뒤로 예약 → 학부모는 못 보고 알림도 없다 → 크론 함수(publish_due_notices)는 0 →
// 시각을 과거로 돌리고 다시 부르면 1 → 학부모가 보고 알림 딱 1건 → 한 번 더 불러도 0·알림 그대로 →
// reschedule_notice(null) 은 바로 뿌린다 → 학부모는 reschedule_notice 를 못 부른다.
// node --env-file=../.env.local notice-schedule-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8);
const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'sched-' + rnd; const email = p => `${p}@auth.yeongeo.local`;

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
const notifiedBy = async (A, link) => {
  const { data } = await admin.from('notifications').select('user_id, kind').eq('academy_id', A).eq('link', link);
  return data ?? [];
};
const iso = ms => new Date(Date.now() + ms).toISOString();

/* ── 판 깔기: 학원 · 반 1 · 원장 · 학생(로그인 없음) 1 · 학부모 1 ── */
// 학생 로그인 사용자는 만들지 않는다 — notice_audience 가 student 소속에도 알림을 주므로 "알림 딱 1건" 을 세려면 학부모만 있어야 한다.
const { data: ac } = await admin.from('academies').insert({ slug: `sched-${rnd}`, name: '공지 예약 점검' }).select().single();
const A = ac.id;
const users = [];
try {
  const { data: c1 } = await admin.from('classes').insert({ academy_id: A, name: '고1 A', schedule: [{ dow: 1, start: '19:00', end: '21:00' }] }).select().single();
  const P_DIR = '0109' + num() + '0'; const dirId = await mkUser('원장', P_DIR); users.push(dirId);
  await member(dirId, A, 'director');
  const d = await signIn(P_DIR);
  const { data: st } = await admin.from('students').insert({ academy_id: A, name: '학생1' }).select().single();
  await admin.from('enrollments').insert({ student_id: st.id, class_id: c1.id });
  const P_PAR = '0109' + num() + '1'; const parentId = await mkUser('학부모1', P_PAR); users.push(parentId);
  await member(parentId, A, 'parent', st.id);
  await admin.from('guardians').insert({ student_id: st.id, user_id: parentId });
  const p = await signIn(P_PAR);

  /* ── A. 1시간 뒤로 예약 ── */
  let r = await d.rpc('create_notice_v2', { p_title: `예약 ${rnd}`, p_body: '본문', p_class_ids: [c1.id], p_publish_at: iso(3600e3) });
  ok(!r.error, 'create_notice_v2(예약): ' + r.error?.message);
  const N = r.data;
  {
    const { data: n } = await admin.from('notices').select('publish_at, fanned_at').eq('id', N).single();
    ok(n && n.fanned_at === null, `예약 공지는 fanned_at 이 없다 (got ${JSON.stringify(n)})`);
    ok(n && new Date(n.publish_at).getTime() > Date.now() + 3000e3, 'publish_at 이 1시간 뒤');
    /* 3 인자 옛 호출도 그대로 통한다(기본값) → 바로 나간다 */
    const old = await d.rpc('create_notice_v2', { p_title: `옛 호출 ${rnd}`, p_body: '', p_class_ids: [c1.id] });
    ok(!old.error, '3인자 create_notice_v2 도 통한다: ' + old.error?.message);
    const { data: on } = await admin.from('notices').select('fanned_at').eq('id', old.data).single();
    ok(!!on?.fanned_at, '시각을 안 주면 바로 나간다(fanned_at 찍힘)');
    ok((await notifiedBy(A, 'notice-view:' + old.data)).length === 1, '바로 나간 공지는 알림 1건');
    /* 90일 넘게는 거절 */
    const far = await d.rpc('create_notice_v2', { p_title: `너무 멂 ${rnd}`, p_body: '', p_class_ids: [c1.id], p_publish_at: iso(91 * 86400e3) });
    ok(/bad_time/.test(far.error?.message ?? ''), `90일 넘는 예약은 bad_time (got ${far.error?.message})`);
  }

  /* ── B. 학부모는 못 보고, 알림도 없다 ── */
  {
    const a = await p.from('notices').select('id').eq('id', N);
    ok((a.data ?? []).length === 0, `학부모는 예약 공지를 못 본다 (got ${JSON.stringify(a.data)})`);
    const t = await p.from('notice_targets').select('class_id').eq('notice_id', N);
    ok((t.data ?? []).length === 0, '학부모는 예약 공지의 대상 줄도 못 본다');
    const rd = await p.from('notice_reads').insert({ notice_id: N, user_id: parentId });
    ok(!!rd.error, '학부모는 예약 공지에 읽음 표시를 못 한다');
    ok((await notifiedBy(A, 'notice-view:' + N)).length === 0, '예약 공지는 알림이 아직 없다');
    ok(((await d.from('notices').select('id').eq('id', N)).data ?? []).length === 1, '원장은 예약 공지를 본다');
    ok((await admin.rpc('notice_visible_to', { nid: N, uid: parentId })).data === false, 'notice_visible_to 학부모 false(아직 안 나감)');
    ok((await admin.rpc('notice_visible_to', { nid: N, uid: dirId })).data === true, 'notice_visible_to 원장 true');
    const rr = await d.rpc('notice_readers', { nid: N });
    ok(/not_published/.test(rr.error?.message ?? ''), `안 나간 공지의 읽은 사람은 not_published (got ${rr.error?.message})`);
    const rm = await d.rpc('remind_notice', { nid: N });
    ok(/not_published/.test(rm.error?.message ?? ''), `안 나간 공지는 다시 알리기도 not_published (got ${rm.error?.message})`);
  }

  /* ── C. 크론 함수: 때가 안 됐으면 0 ── */
  {
    r = await admin.rpc('publish_due_notices');
    ok(!r.error && r.data === 0, `publish_due_notices 0 (got ${r.error?.message ?? r.data})`);
    ok(!!(await d.rpc('publish_due_notices')).error, '원장(authenticated)은 publish_due_notices 를 못 부른다');
    ok(!!(await d.rpc('notice_fanout', { nid: N })).error, '원장(authenticated)은 notice_fanout 을 못 부른다');
  }

  /* ── D. 시각을 과거로 돌리면 1건 뿌리고, 학부모가 보고, 알림 딱 1건 ── */
  {
    await admin.from('notices').update({ publish_at: iso(-60e3) }).eq('id', N);
    r = await admin.rpc('publish_due_notices');
    ok(!r.error && r.data === 1, `publish_due_notices 1 (got ${r.error?.message ?? r.data})`);
    const { data: n } = await admin.from('notices').select('fanned_at').eq('id', N).single();
    ok(!!n?.fanned_at, '뿌린 뒤 fanned_at 찍힘');
    ok(((await p.from('notices').select('id').eq('id', N)).data ?? []).length === 1, '학부모가 이제 본다');
    ok(((await p.from('notice_targets').select('class_id').eq('notice_id', N)).data ?? []).length === 1, '대상 줄도 본다');
    const got = await notifiedBy(A, 'notice-view:' + N);
    ok(got.length === 1 && got[0].user_id === parentId && got[0].kind === 'notice', `알림 딱 1건(학부모) (got ${JSON.stringify(got)})`);
    /* 한 번 더 불러도 아무 일 없다 */
    r = await admin.rpc('publish_due_notices');
    ok(!r.error && r.data === 0, `다시 불러도 0 (got ${r.error?.message ?? r.data})`);
    ok((await notifiedBy(A, 'notice-view:' + N)).length === 1, '알림은 여전히 1건');
    /* 이미 나간 것은 시각을 못 바꾼다 */
    const again = await d.rpc('reschedule_notice', { p_notice: N, p_publish_at: iso(3600e3) });
    ok(/already_published/.test(again.error?.message ?? ''), `나간 공지 reschedule 은 already_published (got ${again.error?.message})`);
    ok(!(await d.rpc('notice_readers', { nid: N })).error, '나간 뒤에는 읽은 사람을 본다');
  }

  /* ── E. reschedule_notice: 시각 바꾸기 · 지금 보내기 ── */
  {
    r = await d.rpc('create_notice_v2', { p_title: `예약2 ${rnd}`, p_body: '', p_class_ids: [c1.id], p_publish_at: iso(3600e3) });
    ok(!r.error, 'create_notice_v2(예약2): ' + r.error?.message);
    const N2 = r.data;
    const t2 = iso(7200e3);
    r = await d.rpc('reschedule_notice', { p_notice: N2, p_publish_at: t2 });
    ok(!r.error, 'reschedule_notice(시각 바꾸기): ' + r.error?.message);
    const { data: n2 } = await admin.from('notices').select('publish_at, fanned_at').eq('id', N2).single();
    ok(n2 && Math.abs(new Date(n2.publish_at).getTime() - new Date(t2).getTime()) < 1000 && n2.fanned_at === null, `시각이 바뀌고 아직 안 나감 (got ${JSON.stringify(n2)})`);
    ok((await notifiedBy(A, 'notice-view:' + N2)).length === 0, '시각만 바꾸면 알림 없음');
    const far = await d.rpc('reschedule_notice', { p_notice: N2, p_publish_at: iso(91 * 86400e3) });
    ok(/bad_time/.test(far.error?.message ?? ''), `90일 넘게 미루기는 bad_time (got ${far.error?.message})`);
    /* 학부모는 못 부른다 */
    const pp = await p.rpc('reschedule_notice', { p_notice: N2, p_publish_at: null });
    ok(!!pp.error, '학부모는 reschedule_notice 를 못 부른다');
    ok((await notifiedBy(A, 'notice-view:' + N2)).length === 0, '학부모 호출로는 아무것도 안 나갔다');
    /* 지금 보내기 */
    r = await d.rpc('reschedule_notice', { p_notice: N2, p_publish_at: null });
    ok(!r.error, 'reschedule_notice(null = 지금 보내기): ' + r.error?.message);
    const { data: n2b } = await admin.from('notices').select('fanned_at').eq('id', N2).single();
    ok(!!n2b?.fanned_at, '지금 보내기 뒤 fanned_at 찍힘');
    ok((await notifiedBy(A, 'notice-view:' + N2)).length === 1, '지금 보내기 알림 1건');
    ok(((await p.from('notices').select('id').eq('id', N2)).data ?? []).length === 1, '학부모가 바로 본다');
    r = await admin.rpc('publish_due_notices');
    ok(!r.error && r.data === 0, '크론이 뒤따라 돌아도 0');
    ok((await notifiedBy(A, 'notice-view:' + N2)).length === 1, '크론 뒤에도 알림 1건');
  }

  /* ── F. 예약 공지 지우기 — 원장은 지울 수 있고 흔적이 없다 ── */
  {
    r = await d.rpc('create_notice_v2', { p_title: `예약3 ${rnd}`, p_body: '', p_class_ids: [c1.id], p_publish_at: iso(3600e3) });
    const N3 = r.data;
    const del = await d.from('notices').delete().eq('id', N3);
    ok(!del.error, '원장이 예약 공지를 지운다: ' + del.error?.message);
    ok(((await admin.from('notices').select('id').eq('id', N3)).data ?? []).length === 0, '지워졌다');
    ok((await admin.rpc('publish_due_notices')).data === 0, '지운 예약은 크론이 뿌리지 않는다');
  }
} finally {
  /* ── 뒷정리 ── */
  const delAc = await admin.from('academies').delete().eq('id', A);
  ok(!delAc.error, '학원 삭제(cascade): ' + delAc.error?.message);
  for (const u of users) await admin.auth.admin.deleteUser(u).catch(() => {});
}

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: notice-schedule A~F');
