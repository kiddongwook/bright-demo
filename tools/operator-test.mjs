// 0023 운영자 화면 뒷단 점검: 운영자 등록 → 학원 개설 → 초대 링크 → 목록 숫자 → 잠금 → 발신키 마스킹 → 삭제,
// 그리고 "운영자가 아닌 사람은 전부 not_operator".
//   node --env-file=../.env.local operator-test.mjs
//   OP_EDGE_DEPLOYED=1 node --env-file=../.env.local operator-test.mjs   ← Edge 재배포 뒤 (E 묶음까지 돈다)
//
// Edge 가 걸린 항목(운영자 OTP 로그인·잠긴 학원 로그인 거절·?academy= 내려받기·op-delete)은
// otp-send/otp-verify/invite-login/link-login/export-academy/op-delete 가 새로 배포된 뒤에만 뜻이 있다.
// 배포 전에는 SKIP (after deploy) 으로 찍고 넘어간다 — 옛 함수가 살아 있는 상태에서 실패로 세면 안 된다.
import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const EDGE = process.env.OP_EDGE_DEPLOYED === '1';
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const skips = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const skip = m => skips.push(m);
const rnd = Math.random().toString(36).slice(2, 8);
const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'op-' + rnd + '-' + Math.random().toString(36).slice(2);
const email = p => `${p}@auth.yeongeo.local`;
const ym = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const err = r => r.error?.message ?? '';

async function mkUser(name, phone) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from('users').insert({ id: data.user.id, name, phone });
  return data.user.id;
}
const signIn = async phone => {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(phone), password: PW });
  if (error) throw new Error(`signIn ${phone}: ${error.message}`);
  return c;
};
const fn = (name, tok, body, qs = '') => fetch(`${URL}/functions/v1/${name}${qs}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON, ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
  body: JSON.stringify(body ?? {}),
});

const cleanup = { academies: [], users: [], linkTokens: [] };   // 링크 토큰은 학원 cascade(0023) 로도 사라지지만, 이 점검이 심은 건 이 점검이 치운다

try {
// ---------------------------------------------------------------- A. 운영자 등록 · 운영자가 아닌 사람
const P_OP = '0109' + num() + '0';
const opId = await mkUser('BRIGHT 사장', P_OP); cleanup.users.push(opId);
await admin.from('app_operators').insert({ user_id: opId });
const o = await signIn(P_OP);

const P_X = '0109' + num() + '1';
const xId = await mkUser('남의 사람', P_X); cleanup.users.push(xId);
const x = await signIn(P_X);

ok((await o.rpc('is_operator')).data === true, 'is_operator(운영자) true');
ok((await x.rpc('is_operator')).data === false, 'is_operator(남) false');

const SLUG = `op-${rnd}`;
const P_DIR = '0109' + num() + '2';
for (const [name, call] of [
  ['op_academies', () => x.rpc('op_academies')],
  ['op_create_academy', () => x.rpc('op_create_academy', { p_slug: SLUG + '-x', p_name: '몰래', p_director_phone: P_DIR, p_director_name: '몰래' })],
  ['op_director_invite', () => x.rpc('op_director_invite', { p_academy: '00000000-0000-0000-0000-000000000000' })],
  ['op_set_lock', () => x.rpc('op_set_lock', { p_academy: '00000000-0000-0000-0000-000000000000', p_locked: true })],
  ['op_set_sms', () => x.rpc('op_set_sms', { p_academy: '00000000-0000-0000-0000-000000000000', p_provider: 'http', p_sender_key: 'k' })],
  ['op_get_sms', () => x.rpc('op_get_sms', { p_academy: '00000000-0000-0000-0000-000000000000' })],
  ['op_export_check', () => x.rpc('op_export_check', { p_academy: '00000000-0000-0000-0000-000000000000' })],
  ['op_delete_academy', () => x.rpc('op_delete_academy', { p_academy: '00000000-0000-0000-0000-000000000000', p_confirm_slug: 'x' })],
]) {
  const r = await call();
  ok(/not_operator/.test(err(r)), `${name}: 남은 not_operator (got ${err(r) || 'no error'})`);
}
// 발송기 전용 함수는 운영자에게도 안 준다 (원문 키는 어떤 화면에도 안 나간다)
ok(!!err(await o.rpc('academy_sms_key', { p_academy: '00000000-0000-0000-0000-000000000000' })), '운영자도 academy_sms_key 못 부른다');

// ---------------------------------------------------------------- B. 학원 만들기
let r = await o.rpc('op_create_academy', { p_slug: 'BAD SLUG', p_name: 'x', p_director_phone: P_DIR, p_director_name: '원장' });
ok(/bad_slug/.test(err(r)), 'slug 모양 검사: ' + err(r));
r = await o.rpc('op_create_academy', { p_slug: SLUG, p_name: 'x', p_director_phone: '0101234', p_director_name: '원장' });
ok(/bad_phone/.test(err(r)), '원장 번호 검사: ' + err(r));
r = await o.rpc('op_create_academy', { p_slug: SLUG, p_name: '테스트 학원', p_director_phone: P_DIR, p_director_name: '원장', p_brand_color: 'red' });
ok(/bad_color/.test(err(r)), '강조색 검사: ' + err(r));

r = await o.rpc('op_create_academy', { p_slug: SLUG, p_name: '테스트 학원', p_director_phone: P_DIR, p_director_name: '김원장', p_brand_color: '#112233' });
ok(!r.error, 'op_create_academy: ' + err(r));
const row = Array.isArray(r.data) ? r.data[0] : r.data;
const A = row?.academy_id; if (A) cleanup.academies.push(A);
ok(!!A, '학원 id 반환');
const inviteUrl = row?.invite_url ?? '';
ok(new RegExp(`\\?a=${SLUG}&i=[0-9a-f]{32}$`).test(inviteUrl), `초대 링크 모양 (got ${inviteUrl})`);
const tok1 = inviteUrl.slice(-32);

const ac = (await admin.from('academies').select('slug, name, brand_color, locked').eq('id', A).maybeSingle()).data;
ok(ac?.slug === SLUG && ac?.name === '테스트 학원' && ac?.brand_color === '#112233' && ac?.locked === false, `academies 행 (got ${JSON.stringify(ac)})`);
const rp = (await admin.from('roster_phones').select('phone, role, name').eq('academy_id', A)).data ?? [];
ok(rp.length === 1 && rp[0].role === 'director' && rp[0].phone === P_DIR && rp[0].name === '김원장', `원장 명부 한 줄 (got ${JSON.stringify(rp)})`);
const its = (await admin.from('invite_tokens').select('phone, role, expires_at, used_at').eq('academy_id', A)).data ?? [];
ok(its.length === 1 && its[0].role === 'director' && !its[0].used_at, `초대 토큰 한 줄 (got ${its.length})`);
ok(Date.parse(its[0]?.expires_at) - Date.now() > 6 * 86400e3, '초대 토큰 7일');

r = await o.rpc('op_create_academy', { p_slug: SLUG, p_name: '또', p_director_phone: P_DIR, p_director_name: '김원장' });
ok(/slug_taken/.test(err(r)), '같은 slug 거절: ' + err(r));

// 재발급: 새 링크가 나오고 옛 토큰은 죽는다
r = await o.rpc('op_director_invite', { p_academy: A });
ok(!r.error && typeof r.data === 'string' && r.data.includes(`?a=${SLUG}&i=`), 'op_director_invite: ' + err(r));
const tok2 = String(r.data ?? '').slice(-32);
ok(tok2 !== tok1, '재발급하면 다른 토큰');
const live = (await admin.from('invite_tokens').select('token_hash, expires_at').eq('academy_id', A)).data ?? [];
ok(live.filter(t => Date.parse(t.expires_at) > Date.now()).length === 1, `살아 있는 초대 토큰은 하나 (got ${live.length}줄)`);

// ---------------------------------------------------------------- C. 목록 숫자
const P_MOM = '0109' + num() + '3', P_ST = '0109' + num() + '4', P_NEW = '0109' + num() + '5';
const { data: cls } = await admin.from('classes').insert({ academy_id: A, name: '고1 A' }).select().single();
const { data: st } = await admin.from('students').insert({ academy_id: A, name: '박지훈' }).select().single();
const { data: st2 } = await admin.from('students').insert({ academy_id: A, name: '나간 학생', status: 'left' }).select().single();
await admin.from('enrollments').insert({ student_id: st.id, class_id: cls.id });
await admin.from('roster_phones').insert([
  { academy_id: A, phone: P_MOM, role: 'parent', name: '박지훈 학부모', student_id: st.id },
  { academy_id: A, phone: P_NEW, role: 'parent', name: '안 들어온 학부모', student_id: st.id },
  { academy_id: A, phone: P_ST, role: 'student', name: '박지훈', student_id: st.id },
]);
const momId = await mkUser('박지훈 학부모', P_MOM); cleanup.users.push(momId);
const stId = await mkUser('박지훈', P_ST); cleanup.users.push(stId);

const list = async () => {
  const q = await o.rpc('op_academies');
  ok(!q.error, 'op_academies: ' + err(q));
  return (q.data ?? []).find(a => a.slug === SLUG);
};
let a1 = await list();
ok(!!a1, '목록에 우리 학원이 있다');
ok(a1?.students === 1, `students=1 (퇴원 제외) (got ${a1?.students})`);
ok(a1?.parents_total === 2, `parents_total=2 (got ${a1?.parents_total})`);
ok(a1?.parents_entered === 1, `parents_entered=1 (got ${a1?.parents_entered})`);
ok(a1?.no_push === 2, `no_push=2 (들어온 학부모1+학생1, 구독 없음) (got ${a1?.no_push})`);
ok(a1?.sms_provider === 'console', `sms_provider=console (got ${a1?.sms_provider})`);
ok(a1?.locked === false, 'locked=false');
ok(a1?.invoices_month === 0 && a1?.paid_month === 0, `이번 달 청구 0 (got ${a1?.invoices_month}/${a1?.paid_month})`);

// 푸시 구독이 하나 붙으면 no_push 가 준다 (0020 roster_entry_status 와 같은 판정)
await admin.from('push_subscriptions').insert({ user_id: momId, endpoint: `https://example.test/${rnd}-1`, p256dh: 'p', auth: 'a' });
// 죽은 구독(실패가 마지막 성공보다 뒤)은 없는 셈이다
await admin.from('push_subscriptions').insert({ user_id: stId, endpoint: `https://example.test/${rnd}-2`, p256dh: 'p', auth: 'a', failed_at: new Date().toISOString() });
a1 = await list();
ok(a1?.no_push === 1, `구독 하나 붙으면 no_push=1 (죽은 구독은 안 센다) (got ${a1?.no_push})`);

await admin.from('invoices').insert([
  { academy_id: A, student_id: st.id, period_ym: ym, amount: 100000, total: 100000, due_date: kst(5), status: 'issued' },
  { academy_id: A, student_id: st2.id, period_ym: ym, amount: 100000, total: 100000, due_date: kst(5), status: 'paid' },
]);
a1 = await list();
ok(a1?.invoices_month === 2 && a1?.paid_month === 1, `이번 달 청구 2 · 납부 1 (got ${a1?.invoices_month}/${a1?.paid_month})`);
await admin.from('invoices').update({ status: 'void' }).eq('academy_id', A).eq('student_id', st.id);
a1 = await list();
ok(a1?.invoices_month === 1, `면제(void)는 안 센다 (got ${a1?.invoices_month})`);

// ---------------------------------------------------------------- D. 잠금 · 발신키 · 삭제 확인 문구
r = await o.rpc('op_set_lock', { p_academy: A, p_locked: true });
ok(!r.error && r.data === true, 'op_set_lock(true): ' + err(r));
ok((await admin.from('academies').select('locked').eq('id', A).single()).data?.locked === true, 'academies.locked true');
ok((await list())?.locked === true, '목록에 잠금 표시');

const KEY = 'sk-live-' + rnd + '1234';
r = await o.rpc('op_set_sms', { p_academy: A, p_provider: 'nope', p_sender_key: KEY });
ok(/bad_provider/.test(err(r)), '발신 모드 검사: ' + err(r));
r = await o.rpc('op_set_sms', { p_academy: A, p_provider: 'http', p_sender_key: KEY });
ok(!r.error, 'op_set_sms: ' + err(r));
r = await o.rpc('op_get_sms', { p_academy: A });
let sms = Array.isArray(r.data) ? r.data[0] : r.data;
ok(!r.error && sms?.sms_provider === 'http' && sms?.sender_key_masked === '****1234', `op_get_sms 마스킹 (got ${JSON.stringify(sms)})`);
ok(!JSON.stringify(sms ?? {}).includes(KEY), '마스킹 값에 원문이 없다');
ok((await list())?.sms_provider === 'http', '목록의 sms_provider 가 바뀐다');
// 발송기(service_role)만 원문을 본다
const full = await admin.rpc('academy_sms_key', { p_academy: A });
const fullRow = Array.isArray(full.data) ? full.data[0] : full.data;
ok(!full.error && fullRow?.sender_key === KEY && fullRow?.sms_provider === 'http', `academy_sms_key(service_role) 원문: ${err(full)}`);
// 모드만 바꾸면 키는 남는다 (null = 안 건드림)
r = await o.rpc('op_set_sms', { p_academy: A, p_provider: 'console', p_sender_key: null });
ok(!r.error, 'op_set_sms(모드만): ' + err(r));
ok((await admin.rpc('academy_sms_key', { p_academy: A })).data?.[0]?.sender_key === KEY, '모드만 바꾸면 키는 그대로');
// 빈 문자열 = 지우기
r = await o.rpc('op_set_sms', { p_academy: A, p_provider: 'console', p_sender_key: '' });
ok(!r.error, 'op_set_sms(키 지우기): ' + err(r));
ok((await admin.rpc('academy_sms_key', { p_academy: A })).data?.[0]?.sender_key === null, '빈 문자열은 키를 지운다');
r = await o.rpc('op_get_sms', { p_academy: A });
sms = Array.isArray(r.data) ? r.data[0] : r.data;
ok(sms?.sender_key_masked === null, `키가 없으면 마스킹도 null (got ${JSON.stringify(sms)})`);

ok((await o.rpc('op_export_check', { p_academy: A })).data === true, 'op_export_check true');

// ---------------------------------------------------------------- E. Edge (재배포 뒤에만)
if (EDGE) {
  // 잠긴 학원: 초대 링크도 인증번호도 막힌다
  let res = await fn('invite-login', null, { token: tok2 });
  ok(res.status === 403 && (await res.json()).error === 'academy_locked', `잠긴 학원 invite-login 403 (got ${res.status})`);
  // 4차 T1: 인증번호도 보내기 단계에서 막힌다 (문자가 안 나간다). 명부는 있으니 404 가 아니라 403.
  res = await fn('otp-send', null, { phone: P_DIR });
  ok(res.status === 403 && (await res.json()).error === 'academy_locked', `잠긴 학원 원장 otp-send 403 academy_locked (got ${res.status})`);
  res = await fn('otp-send', null, { phone: P_MOM });
  ok(res.status === 403 && (await res.json()).error === 'academy_locked', `잠긴 학원 학부모 otp-send 403 (got ${res.status})`);
  // 4차 T1: 알림톡 버튼(link_tokens) 으로도 못 들어온다 — 세션 발급도, 이미 들어온 기기의 resolve 도 403
  const LINK = randomBytes(16).toString('hex');
  const linkHash = createHash('sha256').update(LINK).digest('hex');
  cleanup.linkTokens.push(linkHash);
  const { error: ltErr } = await admin.from('link_tokens').insert({ academy_id: A, user_id: momId, view: 'child', ref_id: null, token_hash: linkHash, expires_at: new Date(Date.now() + 10 * 60e3).toISOString() });
  ok(!ltErr, 'link_tokens 심기: ' + (ltErr?.message ?? ''));
  res = await fn('link-login', null, { token: LINK });
  ok(res.status === 403 && (await res.json()).error === 'academy_locked', `잠긴 학원 link-login 403 academy_locked (got ${res.status})`);
  res = await fn('link-login', null, { token: LINK, resolve: true });
  ok(res.status === 403 && (await res.json()).error === 'academy_locked', `잠긴 학원 link-login(resolve) 도 403 (got ${res.status})`);
  ok(!(await admin.from('link_tokens').select('used_at').eq('token_hash', linkHash).single()).data?.used_at, '거절된 링크는 used_at 이 안 찍힌다');
  // 점검용 토큰은 바로 치운다 (학원 삭제 cascade 에 기대지 않는다)
  await admin.from('link_tokens').delete().eq('token_hash', linkHash);

  // 운영자는 명부에 없어도 인증번호가 나간다
  res = await fn('otp-send', null, { phone: P_OP });
  ok(res.status === 200, `운영자 otp-send 200 (got ${res.status})`);
  // 그 인증번호로 들어오면 memberships 는 비고 operator 가 true
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code + P_OP)))].map(b => b.toString(16).padStart(2, '0')).join('');
  await admin.from('otp_codes').insert({ phone: P_OP, code_hash: h, expires_at: new Date(Date.now() + 5 * 60e3).toISOString() });
  res = await fn('otp-verify', null, { phone: P_OP, code });
  const vj = await res.json();
  ok(res.status === 200 && vj.operator === true && Array.isArray(vj.memberships) && vj.memberships.length === 0,
    `운영자 otp-verify: operator true · memberships [] (got ${res.status} ${JSON.stringify(vj).slice(0, 200)})`);
  const opTok = vj.session?.access_token;

  // 잠금을 풀고 원장이 들어오면 operator 는 false
  await o.rpc('op_set_lock', { p_academy: A, p_locked: false });
  res = await fn('invite-login', null, { token: tok2 });
  const ij = await res.json();
  ok(res.status === 200 && ij.operator === false && ij.memberships?.some(m => m.role === 'director'),
    `잠금 풀면 원장 초대 링크 200 · operator false (got ${res.status} ${JSON.stringify(ij).slice(0, 200)})`);
  if (ij.user_id) cleanup.users.push(ij.user_id);
  await o.rpc('op_set_lock', { p_academy: A, p_locked: true });
  // 잠근 뒤 그 원장의 인증번호 로그인도 막힌다
  const code2 = String(Math.floor(100000 + Math.random() * 900000));
  const h2 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code2 + P_DIR)))].map(b => b.toString(16).padStart(2, '0')).join('');
  await admin.from('otp_codes').insert({ phone: P_DIR, code_hash: h2, expires_at: new Date(Date.now() + 5 * 60e3).toISOString() });
  res = await fn('otp-verify', null, { phone: P_DIR, code: code2 });
  ok(res.status === 403 && (await res.json()).error === 'academy_locked', `잠긴 학원 원장 otp-verify 403 (got ${res.status})`);

  // 운영자 JWT 로 학원 데이터 내려받기
  res = await fn('export-academy', opTok, null, `?academy=${A}`);
  ok(res.status === 200, `운영자 export-academy?academy= 200 (got ${res.status})`);
  const ex = await res.json().catch(() => ({}));
  ok(ex.academy?.slug === SLUG && Array.isArray(ex.tables?.students), '내려받은 JSON 에 우리 학원');
  res = await fn('export-academy', opTok, null);
  ok(res.status === 403, `운영자도 ?academy= 없이는 403 (소속이 없다) (got ${res.status})`);
  const xTok = (await x.auth.getSession()).data.session?.access_token;
  res = await fn('export-academy', xTok, null, `?academy=${A}`);
  ok(res.status === 403, `남이 ?academy= 를 붙이면 403 (got ${res.status})`);

  // 삭제: 확인 문구가 틀리면 안 지운다
  res = await fn('op-delete', opTok, { academy_id: A, confirm_slug: 'wrong-slug' });
  ok(res.status === 400, `op-delete 확인 문구 틀림 400 (got ${res.status})`);
  ok(!!(await admin.from('academies').select('id').eq('id', A).maybeSingle()).data, '틀린 확인 문구로는 안 지워졌다');
  res = await fn('op-delete', xTok, { academy_id: A, confirm_slug: SLUG });
  ok(res.status === 403, `남은 op-delete 403 (got ${res.status})`);
  res = await fn('op-delete', opTok, { academy_id: A, confirm_slug: SLUG });
  ok(res.status === 200, `op-delete 200 (got ${res.status} ${await res.text().catch(() => '')})`);
  ok(!(await admin.from('academies').select('id').eq('id', A).maybeSingle()).data, 'op-delete 로 학원이 사라진다');
} else {
  skip('잠긴 학원 invite-login 403 academy_locked');
  skip('잠긴 학원 otp-send 403 academy_locked (원장·학부모)');
  skip('잠긴 학원 link-login 403 academy_locked (세션·resolve)');
  skip('운영자 otp-send 200 · otp-verify operator:true memberships:[]');
  skip('잠긴 학원 원장 otp-verify 403 academy_locked');
  skip('운영자 export-academy?academy=<id> 200 · 남은 403');
  skip('op-delete: 확인 문구·권한·저장소 비우기');
}

// ---------------------------------------------------------------- F. 삭제 (RPC 직접 — E 에서 이미 지웠으면 건너뛴다)
if ((await admin.from('academies').select('id').eq('id', A).maybeSingle()).data) {
  r = await o.rpc('op_delete_academy', { p_academy: A, p_confirm_slug: SLUG + '-nope' });
  ok(/slug_mismatch/.test(err(r)), '확인 slug 가 다르면 거절: ' + err(r));
  ok(!!(await admin.from('academies').select('id').eq('id', A).maybeSingle()).data, '거절됐으면 학원은 그대로');
  r = await o.rpc('op_delete_academy', { p_academy: A, p_confirm_slug: SLUG });
  ok(!r.error && r.data === '테스트 학원', 'op_delete_academy: ' + (err(r) || r.data));
  ok(!(await admin.from('academies').select('id').eq('id', A).maybeSingle()).data, '학원 삭제됨');
  ok(((await admin.from('students').select('id').eq('academy_id', A)).data ?? []).length === 0, '학생도 cascade 로 사라진다');
  ok(((await admin.from('roster_phones').select('id').eq('academy_id', A)).data ?? []).length === 0, '명부도 사라진다');
  ok(((await admin.from('invite_tokens').select('id').eq('academy_id', A)).data ?? []).length === 0, '초대 토큰도 사라진다');
  ok(((await admin.from('academy_settings').select('academy_id').eq('academy_id', A)).data ?? []).length === 0, '학원 설정도 사라진다');
}
r = await o.rpc('op_delete_academy', { p_academy: A, p_confirm_slug: SLUG });
ok(/not_found/.test(err(r)), '없는 학원은 not_found: ' + err(r));

} finally {
  // 이 점검이 만든 것은 이 점검이 치운다. cleanup-test-data 는 운영자를 지키므로(고아로 안 본다)
  // 여기서 안 지우면 app_operators 에 시험용 운영자가 쌓인다.
  for (const h of cleanup.linkTokens) await admin.from('link_tokens').delete().eq('token_hash', h);
  for (const id of cleanup.academies) await admin.from('academies').delete().eq('id', id);
  for (const id of cleanup.users) await admin.auth.admin.deleteUser(id).catch(() => {});
}

for (const s of skips) console.log(`SKIP (after deploy): ${s}`);
if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; }
else console.log(`PASS: operator A~F${EDGE ? ' (Edge 포함)' : ` — Edge ${skips.length}건은 배포 뒤 OP_EDGE_DEPLOYED=1 로 다시`}`);
