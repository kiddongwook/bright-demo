// 주간 요약(0029) 테스트: 출결·숙제를 심고 weekly_summary_for 를 부르면 학부모 알림 본문의 숫자가 맞고,
// outbox 는 push 줄(WEEKLY)만 생기며(알림톡 없음), 같은 주에 다시 불러도 늘지 않고, prefs.weekly=false 면 학부모에게 안 간다.
// node --env-file=../.env.local weekly-test.mjs      (접두어 wk- · cleanup-test-data.mjs 가 치운다)
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const kstDow = new Date(Date.now() + 9 * 3600e3).getUTCDay();          // 0=일
const MONDAY = kst(-((kstDow + 6) % 7));                                  // 이번 주 월요일(KST)
const NEXT_MONDAY = kst(7 - ((kstDow + 6) % 7));
const PW = 'wk-' + rnd; const email = p => `${p}@auth.yeongeo.local`;

// ---- 준비: 학원·반(월·수 19:00)·학생 하나·원장·학부모
const { data: ac, error: acErr } = await admin.from('academies').insert({ slug: `wk-${rnd}`, name: '주간 요약 테스트' }).select().single();
if (acErr) throw acErr;
const A = ac.id;
ok(ac.weekly_summary === true && ac.weekly_dow === 5 && ac.weekly_hour === 18, `학원 기본 설정은 금 18:00 (got ${JSON.stringify([ac.weekly_summary, ac.weekly_dow, ac.weekly_hour])})`);
const { data: cls } = await admin.from('classes').insert({ academy_id: A, name: '고1 A', schedule: [{ dow: 1, start: '19:00', end: '21:00' }, { dow: 3, start: '19:00', end: '21:00' }] }).select().single();
async function person(role, name, phone, student_id = null) {
  const { data: au, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from('users').insert({ id: au.user.id, name, phone });
  const { data: m } = await admin.from('memberships').insert({ user_id: au.user.id, academy_id: A, role, student_id }).select().single();
  await admin.from('users').update({ active_membership_id: m.id }).eq('id', au.user.id);
  if (role === 'parent') await admin.from('guardians').insert({ student_id, user_id: au.user.id });
  return au.user.id;
}
const { data: st } = await admin.from('students').insert({ academy_id: A, name: '박지훈' }).select().single();
{ const { error } = await admin.from('enrollments').insert({ student_id: st.id, class_id: cls.id }); if (error) throw error; }
const P_DIR = '0109' + num() + '3'; const dir = await person('director', '김지영', P_DIR);
const P_MOM = '0109' + num() + '1'; const mom = await person('parent', '박지훈 어머님', P_MOM, st.id);

// 학부모 푸시 구독 — 진짜 P-256 공개키 모양(push-test.mjs 와 같은 꼴). 이게 있어야 트리거가 push 줄을 세운다.
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
{
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
  const { error } = await admin.from('push_subscriptions').insert({ user_id: mom, endpoint: `https://fcm.example.invalid/push/wk-${rnd}`, p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))), ua: 'test' });
  ok(!error, '학부모 푸시 구독 심기: ' + error?.message);
}

// ---- 이번 주 데이터: 출석 2 · 지각 1 (월·화·수), 숙제 3개 마감 이번 주 · 그중 1개 함
{
  const rows = [
    { academy_id: A, class_id: cls.id, student_id: st.id, date: kst(-((kstDow + 6) % 7) + 0), status: 'present', marked_by: dir },
    { academy_id: A, class_id: cls.id, student_id: st.id, date: kst(-((kstDow + 6) % 7) + 1), status: 'present', marked_by: dir },
    { academy_id: A, class_id: cls.id, student_id: st.id, date: kst(-((kstDow + 6) % 7) + 2), status: 'late', marked_by: dir },
  ];
  const { error } = await admin.from('attendance').insert(rows); ok(!error, '출결 심기: ' + error?.message);
  const { data: todos, error: tErr } = await admin.from('todos').insert([
    { academy_id: A, class_id: cls.id, kind: 'homework', title: '단어 1', due_date: MONDAY },
    { academy_id: A, class_id: cls.id, kind: 'homework', title: '단어 2', due_date: kst(-((kstDow + 6) % 7) + 3) },
    { academy_id: A, class_id: cls.id, kind: 'homework', title: '단어 3', due_date: kst(-((kstDow + 6) % 7) + 6) },
    { academy_id: A, class_id: cls.id, kind: 'exam', title: '시험 (숙제 아님)', due_date: kst(-((kstDow + 6) % 7) + 4) },
    { academy_id: A, class_id: cls.id, kind: 'homework', title: '다음 주 숙제 (이번 주 아님)', due_date: NEXT_MONDAY },
  ]).select('id, title');
  ok(!tErr, '숙제 심기: ' + tErr?.message);
  const first = (todos ?? []).find(t => t.title === '단어 1');
  if (first) { const { error: dErr } = await admin.from('todo_done').insert({ todo_id: first.id, student_id: st.id }); ok(!dErr, '숙제 완료 심기: ' + dErr?.message); }
}

const weeklyNotis = async () => (await admin.from('notifications').select('user_id, kind, title, body, link, created_at').eq('academy_id', A).eq('kind', 'weekly')).data ?? [];
const weeklyOutbox = async () => (await admin.from('outbox').select('to_user_id, channel, template_code, params, link_view').eq('academy_id', A).eq('template_code', 'WEEKLY')).data ?? [];

// ---- A. 이번 주 요약을 만든다 (service role)
const r1 = await admin.rpc('weekly_summary_for', { p_academy: A, p_week_start: MONDAY });
ok(!r1.error, 'weekly_summary_for 호출: ' + r1.error?.message);
ok(r1.data === 2, `학부모 1 + 원장 1 = 2 건 (got ${r1.data})`);
let notis = await weeklyNotis();
const pn = notis.find(n => n.user_id === mom), dn = notis.find(n => n.user_id === dir);
ok(!!pn, '학부모 주간 요약 알림이 있다');
ok(pn?.title === '이번 주 박지훈 요약', `제목은 이름이 들어간 한 줄 (got ${pn?.title})`);
ok(pn?.body?.includes('출석 2'), `본문에 출석 2 (got ${pn?.body})`);
ok(pn?.body?.includes('지각 1'), `본문에 지각 1 (got ${pn?.body})`);
ok(pn?.body?.includes('결석 0'), `본문에 결석 0 (got ${pn?.body})`);
ok(pn?.body?.includes('숙제 1/3'), `숙제는 이번 주 homework 만 — 1/3 (got ${pn?.body})`);
ok(pn?.body?.includes('다음 수업'), `다음 수업이 붙는다 (got ${pn?.body})`);
ok(/다음 수업 [월수] 19:00/.test(pn?.body ?? ''), `다음 수업은 시간표(월·수 19:00)에서 (got ${pn?.body})`);
ok((pn?.body?.length ?? 999) <= 120, `본문 120자 안 (got ${pn?.body?.length})`);
ok(pn?.link === `child:${st.id}`, `링크는 우리 아이 화면 'child:<student_id>' (0030 B4-W4 — dedupe 키) (got ${pn?.link})`);
ok(!!dn, '원장 주간 요약 알림이 있다');
ok(dn?.body?.includes('출석률 100%'), `원장 본문에 출석률 100% — 출석 2·지각 1·결석 0 (got ${dn?.body})`);
ok(dn?.body?.includes('미납 0건'), `원장 본문에 미납 0건 (got ${dn?.body})`);
ok(dn?.link === 'today:', `원장 링크는 오늘 화면 (got ${dn?.link})`);

// ---- B. outbox: 학부모(구독 있음) push 줄 WEEKLY 하나 · 원장(구독 없음) 없음 · 알림톡 줄은 하나도 없다
const ob = await weeklyOutbox();
const momPush = ob.filter(o => o.to_user_id === mom && o.channel === 'push');
ok(momPush.length === 1, `학부모 push 줄 WEEKLY 1건 (got ${momPush.length})`);
ok(momPush[0]?.params?.['요약'] === pn?.body, `push params['요약'] 가 본문과 같다 (got ${momPush[0]?.params?.['요약']})`);
ok(momPush[0]?.params?.['알림'] === pn?.title, `push params['알림'] 가 제목 (got ${momPush[0]?.params?.['알림']})`);
ok(momPush[0]?.link_view === 'child', `push 링크 view 는 child (got ${momPush[0]?.link_view})`);
ok(ob.filter(o => o.to_user_id === dir).length === 0, '구독 없는 원장에게는 outbox 줄이 없다');
ok(ob.filter(o => o.channel === 'alimtalk').length === 0, '알림톡 줄은 없다 (비용 0)');
const { data: anyAlim } = await admin.from('outbox').select('template_code').eq('academy_id', A).eq('channel', 'alimtalk').eq('to_user_id', mom);
ok((anyAlim ?? []).every(o => o.template_code !== 'WEEKLY'), '학부모의 알림톡 줄 가운데 WEEKLY 는 없다');

// ---- C. 같은 주에 다시 불러도 늘지 않는다
const r2 = await admin.rpc('weekly_summary_for', { p_academy: A, p_week_start: MONDAY });
ok(!r2.error && r2.data === 0, `같은 주 재호출은 0 건 (got ${r2.data} ${r2.error?.message ?? ''})`);
ok((await weeklyNotis()).length === 2, '알림은 그대로 2 건');

// ---- D. 학부모가 껐으면(prefs.weekly=false) 새 주에도 학부모에게는 안 간다 — 원장은 받는다
await admin.from('users').update({ prefs: { weekly: false } }).eq('id', mom);
const r3 = await admin.rpc('weekly_summary_for', { p_academy: A, p_week_start: NEXT_MONDAY });
ok(!r3.error, '다음 주 호출: ' + r3.error?.message);
notis = await weeklyNotis();
ok(notis.filter(n => n.user_id === mom).length === 1, `끈 학부모에게는 새 알림이 없다 (got ${notis.filter(n => n.user_id === mom).length})`);
ok(notis.filter(n => n.user_id === dir).length === 2, `원장은 새 주 요약을 받는다 (got ${notis.filter(n => n.user_id === dir).length})`);
await admin.from('users').update({ prefs: {} }).eq('id', mom);

// ---- E. 퇴원생의 학부모에게는 안 간다 · 학원 설정을 끄면 tick 대상이 아니다(설정 열만 확인)
await admin.from('students').update({ status: 'left', left_at: new Date().toISOString() }).eq('id', st.id);
const r4 = await admin.rpc('weekly_summary_for', { p_academy: A, p_week_start: kst(14 - ((kstDow + 6) % 7)) });
ok(!r4.error && r4.data === 1, `퇴원생 학부모는 빠지고 원장만 (got ${r4.data})`);
await admin.from('students').update({ status: 'active', left_at: null }).eq('id', st.id);
{ const { error } = await admin.from('academies').update({ weekly_summary: false, weekly_dow: 1, weekly_hour: 9 }).eq('id', A); ok(!error, '학원 설정 고치기: ' + error?.message); }
{ const { error } = await admin.from('academies').update({ weekly_hour: 23 }).eq('id', A); ok(!!error, '23시는 check 에 걸린다'); }
{ const { error } = await admin.from('academies').update({ weekly_dow: 7 }).eq('id', A); ok(!!error, '요일 7 은 check 에 걸린다'); }

// ---- F. 로그인한 사용자(원장)는 weekly_summary_for 를 직접 못 부른다 · academies 의 weekly_* 는 고칠 수 있다
const d = createClient(URL, ANON, { auth: { persistSession: false } });
ok(!(await d.auth.signInWithPassword({ email: email(P_DIR), password: PW })).error, '원장 로그인');
const r5 = await d.rpc('weekly_summary_for', { p_academy: A, p_week_start: MONDAY });
ok(!!r5.error, `authenticated 는 weekly_summary_for 를 못 부른다 (got ${JSON.stringify(r5.data)})`);
const r6 = await d.rpc('weekly_summary_tick');
ok(!!r6.error, 'authenticated 는 weekly_summary_tick 도 못 부른다');
const r7 = await d.from('academies').update({ weekly_summary: true, weekly_dow: 5, weekly_hour: 18 }).eq('id', A).select('weekly_summary, weekly_dow, weekly_hour').single();
ok(!r7.error && r7.data?.weekly_dow === 5 && r7.data?.weekly_hour === 18, `원장은 academies_write 로 주간 요약 설정을 고친다 (${r7.error?.message ?? JSON.stringify(r7.data)})`);
const r8 = await d.from('academies').select('weekly_summary, weekly_dow, weekly_hour').eq('id', A).single();
ok(!r8.error && r8.data?.weekly_summary === true, '원장은 설정을 읽는다 (lib/weekly.ts 의 getWeeklySettings 와 같은 select)');

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: weekly summary A~F');
