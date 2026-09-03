// 살림 cron 이 부르는 housekeeping(): 옛 것만 지우고, 안 읽은 알림·queued outbox·최근 행은 남긴다. client_errors 정책.
// node --env-file=../.env.local housekeeping-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'hk-' + rnd; const email = p => `${p}@auth.yeongeo.local`;
const ago = days => new Date(Date.now() - days * 86400e3).toISOString();
async function mkUser(name, phone) { const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true }); if (error) throw error; await admin.from('users').insert({ id: data.user.id, name, phone }); return data.user.id; }

const { data: ac } = await admin.from('academies').insert({ slug: `hk-${rnd}`, name: '살림 테스트' }).select().single(); const A = ac.id;
const P_DIR = '0109' + num() + '3', P_PAR = '0109' + num() + '2';
const dirId = await mkUser('원장', P_DIR); const parId = await mkUser('학부모', P_PAR);
const { data: dm } = await admin.from('memberships').insert({ user_id: dirId, academy_id: A, role: 'director' }).select().single();
const { data: pm } = await admin.from('memberships').insert({ user_id: parId, academy_id: A, role: 'parent' }).select().single();
await admin.from('users').update({ active_membership_id: dm.id }).eq('id', dirId); await admin.from('users').update({ active_membership_id: pm.id }).eq('id', parId);

// 옛 행 + 최근 행. 알림은 kind 'test'·link 'noti:' 로 넣어 outbox 트리거가 무시하게 한다.
const ins = (t, rows) => admin.from(t).insert(rows).then(r => { if (r.error) throw new Error(t + ': ' + r.error.message); });
await ins('otp_codes', [{ phone: P_PAR, code_hash: 'x', expires_at: ago(2), created_at: ago(2) }, { phone: P_PAR, code_hash: 'y', expires_at: ago(-1), created_at: ago(0) }]);
await ins('link_tokens', [{ academy_id: A, user_id: parId, view: 'child', token_hash: 'old-' + rnd, expires_at: ago(8) }, { academy_id: A, user_id: parId, view: 'child', token_hash: 'new-' + rnd, expires_at: ago(-7) }]);
await ins('notifications', [
  { academy_id: A, user_id: parId, kind: 'test', title: '읽은 옛 알림', link: 'noti:', read_at: ago(95), created_at: ago(100) },
  { academy_id: A, user_id: parId, kind: 'test', title: '안 읽은 옛 알림', link: 'noti:', created_at: ago(100) },
  { academy_id: A, user_id: parId, kind: 'test', title: '읽은 최근 알림', link: 'noti:', read_at: ago(1), created_at: ago(2) }]);
const { data: oldTok } = await admin.from('link_tokens').select('id').eq('token_hash', 'old-' + rnd).single();
await ins('outbox', [
  { academy_id: A, to_user_id: parId, template_code: 'NOTICE_NEW', status: 'sent', idempotency_key: 'hk-sent-' + rnd, created_at: ago(100), link_token_id: oldTok.id },
  { academy_id: A, to_user_id: parId, template_code: 'NOTICE_NEW', status: 'queued', idempotency_key: 'hk-queued-' + rnd, created_at: ago(100), next_attempt_at: ago(-365) },
  { academy_id: A, to_user_id: parId, template_code: 'NOTICE_NEW', status: 'delivered', idempotency_key: 'hk-recent-' + rnd, created_at: ago(3) }]);
await ins('client_errors', [{ academy_id: A, user_id: parId, at: ago(40), message: '옛 오류' }, { academy_id: A, user_id: parId, at: ago(1), message: '최근 오류' }]);
ok(((await admin.from('outbox').select('id').eq('academy_id', A)).data ?? []).length === 3, '알림 트리거가 outbox 를 만들지 않았다(kind test)');

const { data: res, error } = await admin.rpc('housekeeping');
ok(!error, 'housekeeping rpc: ' + error?.message);
const n = Object.fromEntries((res ?? []).map(r => [r.what, r.n]));
ok(n.otp_codes >= 1 && n.link_tokens >= 1 && n.notifications >= 1 && n.outbox >= 1 && n.client_errors >= 1, `각 표에서 1건 이상 지움 (got ${JSON.stringify(n)})`);
const left = async (t, f) => ((await f(admin.from(t).select('*'))).data ?? []);
ok((await left('otp_codes', q => q.eq('phone', P_PAR))).length === 1, '최근 otp 만 남음');
ok((await left('link_tokens', q => q.eq('academy_id', A))).length === 1, '만료 안 된 토큰만 남음');
const notis = await left('notifications', q => q.eq('academy_id', A));
ok(notis.length === 2 && notis.every(x => x.title !== '읽은 옛 알림'), `안 읽은 옛 알림·최근 알림은 남음 (got ${notis.map(x => x.title).join('/')})`);
const ob = await left('outbox', q => q.eq('academy_id', A));
ok(ob.length === 2 && !ob.some(x => x.idempotency_key.startsWith('hk-sent')), 'queued·최근 outbox 는 남음 (sent 옛 것만 지움)');
ok((await left('client_errors', q => q.eq('academy_id', A))).length === 1, '최근 오류만 남음');

// client_errors 정책: 로그인한 본인만 insert, anon 은 거절, select 는 0행
const p = createClient(URL, ANON, { auth: { persistSession: false } }); await p.auth.signInWithPassword({ email: email(P_PAR), password: PW });
ok(!(await p.from('client_errors').insert({ academy_id: A, user_id: parId, message: '내 오류', version: 't' })).error, '본인 insert OK');
ok(!!(await p.from('client_errors').insert({ academy_id: A, user_id: dirId, message: '남의 오류' })).error, '남의 user_id 는 거절');
ok(((await p.from('client_errors').select('id')).data ?? []).length === 0, '학부모는 오류 표를 못 읽는다');
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
ok(!!(await anon.from('client_errors').insert({ message: '익명' })).error, '로그인 없이는 insert 거절');
const { data: jobs } = await admin.rpc('housekeeping'); ok(Array.isArray(jobs), '두 번째 호출도 OK(지울 게 없어도)');

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: housekeeping + client_errors');
