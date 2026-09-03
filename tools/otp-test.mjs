import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const call = (fn, body) => fetch(`${URL}/functions/v1/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }, body: JSON.stringify(body) });

const tag = Date.now().toString(36);
const { data: A } = await admin.from('academies').insert({ name: 'OTP테스트', slug: 'otp-' + tag }).select().single();
const { data: st } = await admin.from('students').insert({ academy_id: A.id, name: '테스트학생' }).select().single();
const phone = '0109' + Date.now().toString().slice(-7);   // 숫자만 — 함수가 정규화하므로 글자가 섞이면 안 된다
await admin.from('roster_phones').insert([
  { academy_id: A.id, phone, role: 'parent', name: '테스트 어머님', student_id: st.id },
  { academy_id: A.id, phone, role: 'student', name: '테스트학생', student_id: st.id }]);   // 번호 하나에 역할 둘

let r = await call('otp-send', { phone: '010-0000-0000' }); ok(r.status === 404, 'unknown phone status=' + r.status);
r = await call('otp-send', { phone: phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') }); ok(r.status === 200, 'send status=' + r.status);
// console 모드: 코드가 otp_codes 에 해시로만 있으므로 테스트는 서비스 키로 코드를 심는다
const code = '135790';
const hash = await (async () => { const b = new TextEncoder().encode(code + phone); const h = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); })();
await admin.from('otp_codes').insert({ phone, code_hash: hash, expires_at: new Date(Date.now() + 5 * 60e3).toISOString() });
r = await call('otp-verify', { phone, code: '000000' }); ok(r.status === 401, 'wrong code status=' + r.status);
r = await call('otp-verify', { phone, code }); ok(r.status === 200, 'verify status=' + r.status);
const j = await r.json();
ok(j.session?.access_token && j.memberships?.length === 2, 'session/memberships: ' + JSON.stringify(j).slice(0, 120));
const c = createClient(URL, ANON, { auth: { persistSession: false } });
await c.auth.setSession(j.session);
const { data: u } = await c.auth.getUser(); ok(!!u.user, 'session unusable');
await c.rpc('set_active_membership', { m: j.memberships.find(m => m.role === 'parent').id });
const { data: kids } = await c.from('students').select('id'); ok(kids?.length === 1, 'parent sees child after selecting membership');

const { data: urow } = await admin.from('users').select('id').eq('phone', phone).single();
if (urow) await admin.auth.admin.deleteUser(urow.id);
await admin.from('academies').delete().eq('id', A.id);
console.log(fails.length ? 'FAIL:\n - ' + fails.join('\n - ') : 'PASS: otp send/verify + memberships');
process.exit(fails.length ? 1 : 0);
