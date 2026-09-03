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

  // ---- 결과
  if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; }
  else console.log('PASS: outbox A(트리거 매핑)');
} finally {
  if (tickUrl) await admin.from('app_settings').upsert({ key: 'outbox_url', value: tickUrl.value });
}
