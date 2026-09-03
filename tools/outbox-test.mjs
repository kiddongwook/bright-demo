// 3주차 통합 테스트: 알림 → 카톡 줄(outbox) 매핑. (B~E 절은 뒤 Task 에서 덧붙인다)
// node --env-file=../.env.local outbox-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY, KEY = process.env.OUTBOX_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);

// 테스트 동안 1분 틱이 끼어들지 않게 outbox_url 을 잠시 뺀다 (outbox_tick 은 url 이 없으면 아무것도 안 한다)
const { data: tickUrl } = await admin.from('app_settings').select('value').eq('key', 'outbox_url').maybeSingle();
if (tickUrl) await admin.from('app_settings').delete().eq('key', 'outbox_url');
try {
  // ---- 준비: 학원 하나, 반 하나, 학생 하나, 원장·학부모·학생 사용자 (전화번호는 0109… — cleanup 이 지운다)
  const { data: ac } = await admin.from('academies').insert({ slug: `outbox-${rnd}`, name: '아웃박스 테스트' }).select().single();
  const A = ac.id;
  const { data: cls } = await admin.from('classes').insert({ academy_id: A, name: '고1 A', schedule: [{ dow: 1, start: '19:00', end: '21:00' }] }).select().single();
  const { data: st } = await admin.from('students').insert({ academy_id: A, name: '박지훈' }).select().single();
  { const { error } = await admin.from('enrollments').insert({ student_id: st.id, class_id: cls.id }); if (error) throw error; }
  async function person(role, name, phone, student_id = null) {
    const { data: au, error } = await admin.auth.admin.createUser({ email: `${phone}@auth.yeongeo.local`, password: 'outbox-' + rnd, email_confirm: true });
    if (error) throw error;
    await admin.from('users').insert({ id: au.user.id, name, phone });
    const { data: m } = await admin.from('memberships').insert({ user_id: au.user.id, academy_id: A, role, student_id }).select().single();
    await admin.from('users').update({ active_membership_id: m.id }).eq('id', au.user.id);
    if (role === 'parent') await admin.from('guardians').insert({ student_id, user_id: au.user.id });
    if (role === 'student') await admin.from('students').update({ user_id: au.user.id }).eq('id', student_id);
    return au.user.id;
  }
  const P_PARENT = '0109' + num() + '1', P_STUDENT = '0109' + num() + '2', P_DIR = '0109' + num() + '3';
  const dir = await person('director', '김지영', P_DIR);
  const parent = await person('parent', '박지훈 어머님', P_PARENT, st.id);
  const student = await person('student', '박지훈', P_STUDENT, st.id);

  // ---- A. 알림 5종 → outbox 매핑
  const { data: n1 } = await admin.from('notices').insert({ academy_id: A, author_id: dir, title: '모의고사 특강', body: '본문', target_class_id: cls.id }).select().single();
  const { data: q } = await admin.from('inquiries').insert({ academy_id: A, student_id: st.id, asked_by: parent, topic: '질문', body: '질문 본문' }).select().single();
  await admin.from('inquiries').update({ answer: '답', answered_by: dir, answered_at: new Date().toISOString() }).eq('id', q.id);
  const { data: ab } = await admin.from('absence_requests').insert({ academy_id: A, student_id: st.id, requested_by: parent, date: kst(3), reason: '병원' }).select().single();
  await admin.from('absence_requests').update({ status: 'confirmed', makeup_kind: 'saturday', makeup_at: kst(5) + 'T12:00:00+09:00', decided_by: dir }).eq('id', ab.id);
  await admin.from('attendance').insert({ academy_id: A, student_id: st.id, class_id: cls.id, date: kst(0), status: 'late', marked_by: dir });

  const { data: ob } = await admin.from('outbox').select('*').eq('academy_id', A).order('created_at');
  const by = code => ob.filter(o => o.template_code === code);
  ok(by('NOTICE_NEW').length === 2, `NOTICE_NEW 는 학부모·학생 2건 (got ${by('NOTICE_NEW').length})`);
  ok(by('NOTICE_NEW').every(o => o.params['제목'] === '모의고사 특강' && o.link_view === 'notice-view' && o.link_ref === n1.id), 'NOTICE_NEW 파라미터·링크');
  ok(by('INQUIRY_ANSWERED').length === 1 && by('INQUIRY_ANSWERED')[0].to_user_id === parent && by('INQUIRY_ANSWERED')[0].link_view === 'ask-mine', 'INQUIRY_ANSWERED 질문자 1건');
  ok(by('MAKEUP_CONFIRMED').length === 1 && by('MAKEUP_CONFIRMED')[0].params['보강']?.includes('12:00') && by('MAKEUP_CONFIRMED')[0].link_view === 'child', 'MAKEUP_CONFIRMED 1건 + 보강 시각');
  ok(by('ATTENDANCE').length === 1 && by('ATTENDANCE')[0].to_user_id === parent && by('ATTENDANCE')[0].params['학생'] === '박지훈' && by('ATTENDANCE')[0].params['상태'] === '지각', 'ATTENDANCE 보호자 1건');
  ok(ob.every(o => o.status === 'queued' && o.channel === 'alimtalk' && o.idempotency_key.startsWith('n:')), '모두 queued/alimtalk/idem');
  ok(ob.length === 5, `원장 대상 알림(문의 접수·결석 신청)은 줄에 서지 않는다 (got ${ob.length})`);

  // ---- B. 발송 (console 어댑터): 5건 sent, 토큰 5개, debug 에 URL
  const send = () => fetch(`${URL}/functions/v1/outbox-send`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Outbox-Key': KEY }, body: '{}' }).then(r => r.json());
  const noKey = await fetch(`${URL}/functions/v1/outbox-send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ok(noKey.status === 401, `키 없이 401 (got ${noKey.status})`);
  const b = await send();
  ok(b.sent === 5 && b.failed === 0, `5건 발송 (got ${JSON.stringify(b)})`);
  ok(Array.isArray(b.debug) && b.debug.length === 5 && b.debug.every(d => /\?l=[0-9a-f]{32}$/.test(d.url)), 'debug 에 토큰 URL');
  const { data: ob2 } = await admin.from('outbox').select('*').eq('academy_id', A);
  ok(ob2.every(o => o.status === 'sent' && o.provider_msg_id && o.sent_at && o.link_token_id && o.attempts === 1), '모두 sent + provider_msg_id + 토큰');
  const { count: tk } = await admin.from('link_tokens').select('id', { count: 'exact', head: true }).eq('academy_id', A);
  ok(tk === 5, `토큰 5개 (got ${tk})`);
  const again = await send();
  ok(again.claimed === 0, '보낸 건 다시 잡지 않는다');
  const TOKEN = b.debug?.find(d => d.template_code === 'INQUIRY_ANSWERED')?.url.split('?l=')[1];

  // ---- C. 콜백 실패 → 문자 줄 → 발송
  const failedId = ob2.find(o => o.template_code === 'ATTENDANCE').provider_msg_id;
  const cb = await fetch(`${URL}/functions/v1/outbox-callback`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Outbox-Key': KEY }, body: JSON.stringify({ provider_msg_id: failedId, status: 'failed', reason: 'not_kakao_user' }) }).then(r => r.json());
  ok(cb.ok && cb.fallback, `콜백이 문자 행을 만든다 (got ${JSON.stringify(cb)})`);
  const { data: smsRow } = await admin.from('outbox').select('*').eq('id', cb.fallback).single();
  ok(smsRow.channel === 'sms' && smsRow.status === 'queued' && smsRow.template_code === 'ATTENDANCE' && smsRow.idempotency_key.endsWith(':sms'), '문자 행 모양');
  const { data: origRow } = await admin.from('outbox').select('status,last_error').eq('provider_msg_id', failedId).single();
  ok(origRow.status === 'failed' && origRow.last_error === 'not_kakao_user', '원래 행은 failed + 사유');
  const cbOk = await fetch(`${URL}/functions/v1/outbox-callback`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Outbox-Key': KEY }, body: JSON.stringify({ provider_msg_id: ob2.find(o => o.template_code === 'INQUIRY_ANSWERED').provider_msg_id, status: 'delivered' }) }).then(r => r.json());
  ok(cbOk.ok && !cbOk.fallback, 'delivered 콜백은 문자 행을 만들지 않는다');
  const c = await send();
  ok(c.sent === 1 && c.debug?.[0]?.channel === 'sms' && /\?l=[0-9a-f]{32}$/.test(c.debug[0].url), `문자 1건 발송 + 새 토큰 (got ${JSON.stringify(c)})`);
  // 콜백으로 failed 가 된 알림톡 행은 재시도하지 않는다 (attempts 를 5로 올려 둔다)
  const { data: origAfter } = await admin.from('outbox').select('status,attempts').eq('provider_msg_id', failedId).single();
  ok(origAfter.status === 'failed' && origAfter.attempts === 5, '콜백 실패 행은 dead 취급(attempts 5)');

  // ---- D. 발송 실패 5회 → dead → 문자 줄 (콘솔 어댑터는 9999 로 끝나는 번호에 일부러 실패한다)
  const P_BAD = '0109' + num().slice(0, 2) + '9999';
  const bad = await person('parent', '실패 어머님', P_BAD, st.id);
  await admin.from('notices').insert({ academy_id: A, author_id: dir, title: '실패 테스트', body: '', target_class_id: null });
  for (let i = 0; i < 5; i++) { await admin.from('outbox').update({ next_attempt_at: null }).eq('to_user_id', bad).eq('channel', 'alimtalk'); await send(); }
  const { data: deadRow } = await admin.from('outbox').select('*').eq('to_user_id', bad).eq('channel', 'alimtalk').single();
  ok(deadRow.status === 'dead' && deadRow.attempts === 5 && deadRow.last_error, `5회 실패 → dead (got ${deadRow.status}/${deadRow.attempts})`);
  await send(); // dead 가 만든 문자 행은 다음 틱에 나간다
  const { data: deadSms } = await admin.from('outbox').select('*').eq('to_user_id', bad).eq('channel', 'sms').maybeSingle();
  ok(deadSms && deadSms.status === 'sent', `dead 면 문자 줄에 넣고 다음 틱에 보낸다 (got ${deadSms?.status})`);

  // ---- E. 링크 로그인: 토큰 → 그 사람 세션 + 열 화면. 만료·엉뚱한 토큰은 401. 기존 세션(설치된 앱)은 끊기지 않는다.
  const ll = (token) => fetch(`${URL}/functions/v1/link-login`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ token }) });
  const installed = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: pwErr } = await installed.auth.signInWithPassword({ email: `${P_PARENT}@auth.yeongeo.local`, password: 'outbox-' + rnd });
  ok(!pwErr, '학부모가 미리 로그인(설치된 앱 흉내)');
  const e1 = await ll(TOKEN); const j1 = await e1.json();
  ok(e1.status === 200 && j1.session?.access_token && j1.view === 'ask-mine' && j1.ref_id === q.id && j1.academy_id === A, `링크 로그인 200 + 화면 (got ${e1.status} ${JSON.stringify(j1).slice(0, 120)})`);
  const asParent = createClient(URL, ANON, { auth: { persistSession: false } });
  await asParent.auth.setSession(j1.session);
  const { data: me } = await asParent.auth.getUser();
  ok(me.user?.id === parent, '세션 주인은 질문한 학부모');
  const { data: myInq } = await asParent.from('inquiries').select('id').eq('id', q.id);
  ok(myInq?.length === 1, '그 세션으로 자기 문의를 읽는다(RLS)');
  const { data: still, error: stillErr } = await installed.auth.refreshSession();
  ok(!stillErr && still.session?.user?.id === parent, `링크 로그인 뒤에도 기존 세션의 리프레시가 산다 (${stillErr?.message ?? 'ok'})`);
  const { data: used } = await admin.from('link_tokens').select('used_at').eq('token_hash', (await import('node:crypto')).createHash('sha256').update(TOKEN).digest('hex')).single();
  ok(!!used?.used_at, 'used_at 기록');
  const e2 = await ll(TOKEN); ok(e2.status === 200, '만료 전엔 다시 써도 열린다');
  const e3 = await ll('0'.repeat(32)); ok(e3.status === 401, `없는 토큰 401 (got ${e3.status})`);
  await admin.from('link_tokens').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('user_id', parent);
  const e4 = await ll(TOKEN); ok(e4.status === 401 && (await e4.json()).error === 'expired', `만료 401 expired (got ${e4.status})`);

  // ---- 결과
  if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; }
  else console.log('PASS: outbox A~E');
} finally {
  if (tickUrl) await admin.from('app_settings').upsert({ key: 'outbox_url', value: tickUrl.value });
}
