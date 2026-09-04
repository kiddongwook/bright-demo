// inp-04 전화번호 모양 — normalizePhone/isValidMobile(사본), otp-send, roster_save_student, create_invite
// 주의: 아래 VARIANTS 의 '010 1234 5678'·'010-12345678' 은 정규화하면 01012345678 이고,
//       그 번호가 실제 어느 학원 명부에 있어 otp-send 가 200 을 준다(문자 발송 + 10분 3건 상한 소모).
//       다시 돌리기 전에 명부에 확실히 없는 번호로 바꿀 것.
import { admin, setup, teardown, F, held, report, normalizePhone, isValidMobile, URL_, ANON } from './inp-lib.mjs';

const ctx = await setup('phone');
console.log('academy', ctx.slug);
const otpSend = (phone) => fetch(`${URL_}/functions/v1/otp-send`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ phone }) });

const REAL = ctx.P_MOM; // 명부에 있는 진짜 번호 (01099xxxx2)
const VARIANTS = [
  ['+82 10-1234-5678', '국가번호'],
  ['010 1234 5678', '띄어쓰기'],
  ['０１０１２３４５６７８', '전각 숫자'],
  ['010-12345678', '대시 하나'],
  ['0101234567', '9자리(짧음)'],
  ['', '빈 문자열'],
  ['010-1234-5678\n010-9999-9999', '줄바꿈 두 줄'],
  ['abc', '문자만'],
];

console.log('--- 순수 함수 ---');
const pure = VARIANTS.map(([v, why]) => ({ why, in: v, norm: normalizePhone(v), len: normalizePhone(v).length, valid: isValidMobile(v) }));
for (const r of pure) console.log(JSON.stringify(r));

console.log('--- otp-send (명부에 없는 모양) ---');
for (const [v, why] of VARIANTS) {
  const r = await otpSend(v);
  const b = await r.json().catch(() => ({}));
  console.log(JSON.stringify({ why, in: v, status: r.status, body: b }));
  const n = normalizePhone(v);
  if (n.length >= 10 && !isValidMobile(v) && r.status === 404) {
    F('INP-30', '중간', `otp-send 는 자릿수만 본다(length<10) — 휴대폰 모양이 아닌 번호(${why}: ${JSON.stringify(v)} → ${n})가 400 bad_phone 이 아니라 404 not_in_roster 로 떨어진다. 사용자는 "명부에 없다"는 틀린 안내를 받는다`,
      'tools/redteam/inp-04-phones.mjs (otp-send 반복)', `${JSON.stringify(v)} → normalizePhone ${n}(${n.length}자리) → HTTP ${r.status} ${JSON.stringify(b)}; isValidMobile=false`);
  }
}

console.log('--- 명부 저장(roster_save_student): 서버가 모양을 보나 ---');
{
  const bad = '+82 10-1234-5678';
  const r = await ctx.d.rpc('roster_save_student', { sid: ctx.student.id, p_name: '박지훈', p_class_ids: [ctx.cls.id], p_student_phone: bad, p_parent_phones: [ctx.P_MOM] });
  if (r.error) held('roster_save_student 가 이상한 번호를 거절', r.error.message.slice(0, 100));
  else {
    const { data: rp } = await admin.from('roster_phones').select('phone, role').eq('student_id', ctx.student.id);
    const stored = rp.find(x => x.role === 'student')?.phone;
    F('INP-31', '중간', 'roster_save_student 는 normalize_phone 만 하고 휴대폰 모양을 보지 않는다 — 화면(Roster.tsx isValidMobile) 밖(CSV 적용·API·다른 클라이언트)에서 온 값은 그대로 명부에 앉는다. 그 사람은 자기 번호를 눌러도 영영 못 들어온다',
      'tools/redteam/inp-04-phones.mjs (roster_save_student)',
      `p_student_phone=${JSON.stringify(bad)} → roster_phones.phone='${stored}' (isValidMobile=false). 0007_manage.sql 22~48줄에 모양 검사 없음`);
    // 원상 복구
    await ctx.d.rpc('roster_save_student', { sid: ctx.student.id, p_name: '박지훈', p_class_ids: [ctx.cls.id], p_student_phone: ctx.P_ST, p_parent_phones: [ctx.P_MOM] });
  }
}

console.log('--- create_invite: 대시가 든 번호 ---');
{
  const dashed = REAL.slice(0, 3) + '-' + REAL.slice(3, 7) + '-' + REAL.slice(7);
  const r = await ctx.d.rpc('create_invite', { p_phone: dashed });
  if (!r.error && /^[0-9a-f]{32}$/.test(r.data)) held('create_invite 가 대시 든 번호를 normalize_phone 으로 받아 준다', `${dashed} → 토큰 32hex 발급`);
  else F('INP-32', '중간', 'create_invite 가 대시 든 번호를 못 받는다', 'tools/redteam/inp-04-phones.mjs', r.error?.message ?? String(r.data));

  const r2 = await ctx.d.rpc('create_invite', { p_phone: '+82 10-1234-5678' });
  if (r2.error) held('create_invite 는 명부에 없는 번호를 거절', r2.error.message.slice(0, 60));
  else F('INP-33', '중간', 'create_invite 가 명부에 없는 번호로 토큰을 준다', 'tools/redteam/inp-04-phones.mjs', String(r2.data));

  const r3 = await ctx.d.rpc('create_invite', { p_phone: '   ' });
  if (r3.error) held('create_invite 빈 번호 거절', r3.error.message.slice(0, 60));
  else F('INP-34', '중간', 'create_invite 가 빈 번호를 받는다', 'tools/redteam/inp-04-phones.mjs', String(r3.data));
}

console.log('--- invite-login: 토큰 모양 ---');
for (const t of ['', 'x', 'A'.repeat(32), '0'.repeat(31), '0'.repeat(33), null, 12345, { a: 1 }]) {
  const r = await fetch(`${URL_}/functions/v1/invite-login`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ token: t }) });
  const b = await r.json().catch(() => ({}));
  if (r.status !== 401) F('INP-35', '높음', 'invite-login 이 이상한 토큰에 401 이 아닌 응답을 준다', 'tools/redteam/inp-04-phones.mjs', `${JSON.stringify(t)} → ${r.status} ${JSON.stringify(b)}`);
}
held('invite-login 은 /^[0-9a-f]{32}$/ 밖의 모든 토큰(빈값·대문자·길이 어긋남·숫자·객체)에 401 bad_token', '8가지 시도 모두 401');

report('inp-04 전화번호·토큰 모양');
await teardown(ctx);
