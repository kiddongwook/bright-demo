// 웹 푸시: 알림 → outbox 채널 push 매핑(트리거) + 구독 RLS + (배포 뒤) PUSH_DRY_RUN 발송.
// A~G 절은 DB 만 있으면 돈다 — Edge 배포 전에도 PASS 해야 한다. H 절(발송)은 새 outbox-send 배포 + PUSH_DRY_RUN=1 이 있어야 돈다.
// node --env-file=../.env.local push-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY, KEY = process.env.OUTBOX_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const notes = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const PW = 'push-' + rnd;

// 도는 동안 1분 틱이 끼어들지 않게 (틱이 줄을 잡아 상태를 바꾸면 매핑을 확인할 수 없다)
const { data: tickUrl } = await admin.from('app_settings').select('value').eq('key', 'outbox_url').maybeSingle();
if (tickUrl) await admin.from('app_settings').delete().eq('key', 'outbox_url');
let A = null; const made = [];
try {
  const { data: ac } = await admin.from('academies').insert({ slug: `push-${rnd}`, name: '푸시 테스트' }).select().single();
  A = ac.id;
  const { data: cls } = await admin.from('classes').insert({ academy_id: A, name: '고2 A', schedule: [{ dow: 2, start: '19:00', end: '21:00' }] }).select().single();
  const { data: st } = await admin.from('students').insert({ academy_id: A, name: '이서준' }).select().single();
  { const { error } = await admin.from('enrollments').insert({ student_id: st.id, class_id: cls.id }); if (error) throw error; }
  async function person(role, name, phone, student_id = null) {
    const { data: au, error } = await admin.auth.admin.createUser({ email: `${phone}@auth.yeongeo.local`, password: PW, email_confirm: true });
    if (error) throw error;
    await admin.from('users').insert({ id: au.user.id, name, phone });
    const { data: m } = await admin.from('memberships').insert({ user_id: au.user.id, academy_id: A, role, student_id }).select().single();
    await admin.from('users').update({ active_membership_id: m.id }).eq('id', au.user.id);
    if (role === 'parent') await admin.from('guardians').insert({ student_id, user_id: au.user.id });
    if (role === 'student') await admin.from('students').update({ user_id: au.user.id }).eq('id', student_id);
    made.push(au.user.id);
    return au.user.id;
  }
  const P_DIR = '0109' + num() + '3', P_PAR = '0109' + num() + '1', P_STU = '0109' + num() + '2';
  const dir = await person('director', '최원장', P_DIR);
  const par = await person('parent', '이서준 어머님', P_PAR, st.id);
  const stu = await person('student', '이서준', P_STU, st.id);

  const sub = (uid, tag) => admin.from('push_subscriptions').insert({
    user_id: uid, endpoint: `https://fcm.example.invalid/push/${rnd}-${tag}`,
    p256dh: 'BJxc' + 'A'.repeat(83), auth: 'Zm9vYmFyYmF6cXV4MTIz', ua: 'test',
  }).select().single();

  const all = async () => (await admin.from('outbox').select('*').eq('academy_id', A)).data ?? [];
  const pick = (rows, channel, user, code) => rows.filter(o => o.channel === channel && o.to_user_id === user && o.template_code === code);
  const notif = async (user, kind) => (await admin.from('notifications').select('*').eq('user_id', user).eq('kind', kind).order('created_at', { ascending: false })).data ?? [];

  // ---- A. 구독이 있으면 푸시로, 없으면 카톡으로
  await sub(par, 'par');
  const { data: n1 } = await admin.from('notices').insert({ academy_id: A, author_id: dir, title: '겨울 특강', body: '본문', target_class_id: cls.id }).select().single();
  let ob = await all();
  const pPush = pick(ob, 'push', par, 'NOTICE_NEW');
  ok(pPush.length === 1, `구독한 학부모 → push 행 1건 (got ${pPush.length})`);
  ok(pick(ob, 'alimtalk', par, 'NOTICE_NEW').length === 0, '구독한 학부모에게는 카톡 행을 넣지 않는다(kakao_also 없음)');
  ok(pick(ob, 'push', stu, 'NOTICE_NEW').length === 0, '구독 없는 학생에게는 push 행이 없다');
  ok(pick(ob, 'alimtalk', stu, 'NOTICE_NEW').length === 1, '구독 없는 학생은 지금처럼 카톡 행');
  const nRow = (await notif(par, 'notice'))[0];
  ok(pPush[0]?.idempotency_key === 'push:' + nRow?.id, `idempotency_key = push:<알림 id> (got ${pPush[0]?.idempotency_key})`);
  ok(pPush[0]?.link_view === 'notice-view' && pPush[0]?.link_ref === n1.id, 'push 행 링크(view·ref)');
  ok(pPush[0]?.params['학원'] === '푸시 테스트' && pPush[0]?.params['제목'] === '겨울 특강', `push 행 params (got ${JSON.stringify(pPush[0]?.params)})`);
  ok(pPush[0]?.params['알림'] === nRow?.title, `push 행 params['알림'] = 알림 제목 (got ${pPush[0]?.params['알림']})`);
  ok(pPush[0]?.status === 'queued', 'push 행은 queued 로 선다');

  // ---- B. '카톡도 같이 받기' 를 켜면 둘 다
  await admin.from('users').update({ prefs: { kakao_also: true } }).eq('id', par);
  await admin.from('notices').insert({ academy_id: A, author_id: dir, title: '2차 공지', body: '', target_class_id: cls.id });
  ob = await all();
  ok(pick(ob, 'push', par, 'NOTICE_NEW').length === 2, `kakao_also=true → push 행도 그대로 (got ${pick(ob, 'push', par, 'NOTICE_NEW').length})`);
  ok(pick(ob, 'alimtalk', par, 'NOTICE_NEW').length === 1, `kakao_also=true → 카톡 행도 선다 (got ${pick(ob, 'alimtalk', par, 'NOTICE_NEW').length})`);

  // ---- C. 그 카톡 종류를 끈 사람은 kakao_also 여도 카톡이 안 간다 (푸시는 간다)
  await admin.from('users').update({ prefs: { kakao_also: true, kakao_notice: false } }).eq('id', par);
  await admin.from('notices').insert({ academy_id: A, author_id: dir, title: '3차 공지', body: '', target_class_id: cls.id });
  ob = await all();
  ok(pick(ob, 'push', par, 'NOTICE_NEW').length === 3, 'kakao_notice=false 여도 푸시는 간다');
  ok(pick(ob, 'alimtalk', par, 'NOTICE_NEW').length === 1, 'kakao_notice=false 면 카톡 행은 안 는다');
  await admin.from('users').update({ prefs: {} }).eq('id', par);

  // ---- D. 원장 대상 알림도 푸시로 간다 (카톡에는 원래 안 가던 종류)
  await sub(dir, 'dir');
  const { data: q } = await admin.from('inquiries').insert({ academy_id: A, student_id: st.id, asked_by: par, topic: '보강 문의', body: '본문' }).select().single();
  ob = await all();
  const dPush = pick(ob, 'push', dir, 'INQUIRY_NEW');
  ok(dPush.length === 1 && dPush[0].link_view === 'inbox' && dPush[0].link_ref === q.id, `원장 문의 접수 → push INQUIRY_NEW (got ${dPush.length})`);
  ok(dPush[0]?.params['알림']?.includes('문의'), `푸시 전용 문구는 알림 제목에서 온다 (got ${dPush[0]?.params['알림']})`);
  ok(ob.filter(o => o.channel === 'alimtalk' && o.to_user_id === dir).length === 0, '원장에게 카톡 행은 여전히 안 선다');

  const { data: ab } = await admin.from('absence_requests').insert({ academy_id: A, student_id: st.id, requested_by: par, date: kst(3), reason: '병원' }).select().single();
  ob = await all();
  const aPush = pick(ob, 'push', dir, 'ABSENCE_REQUESTED');
  ok(aPush.length === 1 && aPush[0].link_view === 'today' && aPush[0].link_ref === ab.id, `원장 결석 신청 → push ABSENCE_REQUESTED (got ${aPush.length})`);

  // ---- E. 학생 본인 출결도 푸시로 (카톡에는 안 가던 종류)
  await sub(stu, 'stu');
  await admin.from('attendance').insert({ academy_id: A, student_id: st.id, class_id: cls.id, date: kst(0), status: 'late', marked_by: dir });
  ob = await all();
  ok(pick(ob, 'push', stu, 'ATTENDANCE_SELF').length === 1, `학생 본인 출결 → push ATTENDANCE_SELF (got ${pick(ob, 'push', stu, 'ATTENDANCE_SELF').length})`);
  ok(pick(ob, 'push', par, 'ATTENDANCE').length === 1, '보호자 출결 → push ATTENDANCE');
  ok(pick(ob, 'alimtalk', par, 'ATTENDANCE').length === 0, '보호자는 푸시로 받았으니 카톡 행은 없다');
  ok(pick(ob, 'alimtalk', stu, 'ATTENDANCE_SELF').length === 0, '학생 본인 출결은 카톡 행이 없다(원래 없던 종류)');

  // ---- F. 구독 RLS: 본인 행만 보고·넣고·지운다
  const asParent = createClient(URL, ANON, { auth: { persistSession: false } });
  { const { error } = await asParent.auth.signInWithPassword({ email: `${P_PAR}@auth.yeongeo.local`, password: PW }); ok(!error, '학부모 로그인: ' + error?.message); }
  const { data: mine } = await asParent.from('push_subscriptions').select('id, user_id');
  ok(mine?.length === 1 && mine[0].user_id === par, `학부모는 자기 구독만 본다 (got ${mine?.length})`);
  const { error: insErr } = await asParent.from('push_subscriptions').insert({ user_id: dir, endpoint: 'https://x.invalid/' + rnd, p256dh: 'x', auth: 'y' });
  ok(!!insErr, '남의 user_id 로는 구독을 못 넣는다');
  const { data: mySub } = await asParent.from('push_subscriptions').insert({ user_id: par, endpoint: `https://fcm.example.invalid/push/${rnd}-par2`, p256dh: 'p', auth: 'a' }).select().single();
  ok(!!mySub, '본인 구독은 넣을 수 있다');
  if (mySub) { await asParent.from('push_subscriptions').delete().eq('id', mySub.id);
    const { count } = await admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('id', mySub.id);
    ok(count === 0, '본인 구독은 지울 수 있다'); }

  // ---- G. 이미 만들어진 push 행은 다시 안 만든다 (같은 알림 → 같은 idempotency_key)
  const before = (await all()).length;
  await admin.from('notifications').insert({ academy_id: A, user_id: par, kind: 'notice', title: '직접 넣은 알림', body: '', link: 'notice-view:' + n1.id });
  ok((await all()).length === before + 1, '알림 하나당 push 행 하나');

  // ---- H. 발송 (새 outbox-send 배포 + PUSH_DRY_RUN=1 필요)
  const phones = [P_DIR, P_PAR, P_STU];
  let sendChecked = false;
  try {
    const r = await fetch(`${URL}/functions/v1/outbox-send`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Outbox-Key': KEY }, body: '{}' });
    if (!r.ok) notes.push(`발송 절 건너뜀 — outbox-send ${r.status}. 배포 뒤 다시 실행하세요.`);
    else {
      const b = await r.json();
      const mineDebug = (b.debug ?? []).filter(d => phones.includes(d.to) && d.channel === 'push');
      const { data: after } = await admin.from('outbox').select('*').eq('academy_id', A).eq('channel', 'push');
      const stuck = after.filter(o => o.status !== 'sent');
      // 비밀값이 없어 막힌 것만 "건너뜀" 이다. 다른 last_error 는 진짜 실패라 FAIL 로 낸다 —
      // 예전에는 이것까지 "옛 함수가 깔려 있다" 로 읽어 배포 담당이 엉뚱한 곳을 뒤졌다.
      const vapid = stuck.filter(o => (o.last_error ?? '').includes('vapid_not_configured'));
      const other = stuck.filter(o => !(o.last_error ?? '').includes('vapid_not_configured'));
      if (other.length) {
        ok(false, `push 발송 실패 ${other.length}건: ${other.map(o => o.last_error ?? `status=${o.status} (last_error 없음)`).join(' | ').slice(0, 400)}`);
      } else if (vapid.length) {
        notes.push('발송 절 건너뜀 — PUSH_DRY_RUN=1 (또는 VAPID 비밀값) 이 없습니다: npx supabase secrets set PUSH_DRY_RUN=1');
      } else if (!mineDebug.length || mineDebug[0].title === undefined) {
        notes.push('발송 절 건너뜀 — 배포된 outbox-send 가 아직 채널 push 를 모릅니다. `npx supabase functions deploy outbox-send --no-verify-jwt` 뒤 다시 실행하세요.');
      } else {
        sendChecked = true;
        ok(stuck.length === 0, `push 행이 모두 sent (막힌 것 ${stuck.length}건: ${stuck.map(o => o.last_error).join(' | ').slice(0, 200)})`);
        ok(mineDebug.every(d => d.title === '푸시 테스트' && typeof d.body === 'string' && d.body.length > 0), `푸시 페이로드 제목=학원 이름·본문 있음 (got ${JSON.stringify(mineDebug[0]).slice(0, 160)})`);
        const noticePush = mineDebug.find(d => d.template_code === 'NOTICE_NEW');
        ok(!noticePush || !noticePush.body.startsWith('['), `본문에서 앞머리 [학원] 은 뗀다 (got ${noticePush?.body})`);
        const { data: subsNow } = await admin.from('push_subscriptions').select('last_ok_at').eq('user_id', par);
        ok(subsNow?.every(s => !!s.last_ok_at), '성공하면 구독에 last_ok_at');
      }
    }
  } catch (e) { notes.push('발송 절 건너뜀 — ' + e.message); }
  if (!sendChecked) notes.push('(H 절은 배포 뒤 `node --env-file=../.env.local push-test.mjs` 로 다시 확인하세요)');

} finally {
  // 학원(cascade) 먼저 — 공지·문의가 users 를 참조하고 있어 사용자를 먼저 지우면 FK 로 막힌다
  if (A) { const { error } = await admin.from('academies').delete().eq('id', A); if (error) fails.push('학원 정리 실패: ' + error.message); }
  for (const u of made) { const { error } = await admin.auth.admin.deleteUser(u); if (error) fails.push('사용자 정리 실패: ' + error.message); }
  if (tickUrl) await admin.from('app_settings').upsert({ key: 'outbox_url', value: tickUrl.value });
}

for (const n of notes) console.log('NOTE: ' + n);
if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; }
else console.log('PASS: push A~G' + (notes.length ? ' (H 절은 위 NOTE 참고)' : ' + H'));
