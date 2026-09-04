// Attack: otp-send rate limit (3/10min) and phone-format bypass (count REAL inserts); otp-verify wrong-code
// attempts counter + lockout; dev fixed-code must NOT authenticate a phone outside DEV_OTP_PHONES
// (no brute force: we only probe a handful of codes against a phone with no live code / a planted code we own).
import { createHash } from 'node:crypto';
import { admin, URL, ANON, seedAcademy, held, hole, note, report, cleanup } from './_common.mjs';

const sha256hex = (s) => createHash('sha256').update(s).digest('hex');
const send = async (phone) => {
  const res = await fetch(`${URL}/functions/v1/otp-send`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ phone }) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const verify = async (phone, code) => {
  const res = await fetch(`${URL}/functions/v1/otp-verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ phone, code }) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const digits = (p) => p.replace(/[^0-9]/g, '');

const A = await seedAcademy('otp');
const phone = A.par1.phone;      // e.g. 0102xxxxxx, in roster
const other = A.par2.phone;      // second in-roster phone for verify tests

// ---- otp-send rate limit: 3 per 10 min, count real inserts ----
const before = (await admin.from('otp_codes').select('id', { count: 'exact', head: true }).eq('phone', phone)).count ?? 0;
const statuses = [];
for (let i = 0; i < 5; i++) statuses.push((await send(phone)).status);
const after = (await admin.from('otp_codes').select('id', { count: 'exact', head: true }).eq('phone', phone)).count ?? 0;
const inserted = after - before;
note('otp-send statuses: ' + JSON.stringify(statuses) + `  inserted=${inserted}`);
(inserted <= 3 && statuses.filter(s => s === 200).length <= 3 && statuses.includes(429)) ? held(`otp-send capped at 3 inserts (got ${inserted}), 4th=429`) : hole('중간', `otp-send rate limit off: inserted=${inserted}, statuses=${statuses}`);

// ---- format-variant bypass: dashed/spaced normalize to same bucket; +82 -> different digits, not in roster ----
const dashed = phone.slice(0, 3) + '-' + phone.slice(3, 7) + '-' + phone.slice(7);
const spaced = phone.slice(0, 3) + ' ' + phone.slice(3, 7) + ' ' + phone.slice(7);
const plus82 = '+82 ' + phone.slice(1);
const rd = await send(dashed), rs = await send(spaced), rp = await send(plus82);
const after2 = (await admin.from('otp_codes').select('id', { count: 'exact', head: true }).eq('phone', phone)).count ?? 0;
(after2 <= 3) ? held(`format variants (dash/space) still blocked, same bucket stays <=3 (now ${after2})`) : hole('중간', `format variant bypassed rate limit: bucket=${after2}`);
(digits(plus82) !== phone && rp.status === 404) ? held('+82 variant normalizes to a different, non-rostered number -> 404 (no insert)') : note(`+82 variant status=${rp.status} digits=${digits(plus82)}`);
const p82count = (await admin.from('otp_codes').select('id', { count: 'exact', head: true }).eq('phone', digits(plus82))).count ?? 0;
(p82count === 0) ? held('+82 variant created no otp_codes rows') : hole('중간', `+82 variant inserted ${p82count} rows under a different phone key`);

// ---- otp-verify: wrong-code attempts counter + lockout at 5 (planted code we own) ----
await admin.from('otp_codes').delete().eq('phone', other);
const good = '654321';
const { data: planted } = await admin.from('otp_codes').insert({ phone: other, code_hash: sha256hex(good + other), expires_at: new Date(Date.now() + 5 * 60e3).toISOString() }).select().single();
let locked = false;
for (let i = 1; i <= 6; i++) {
  const r = await verify(other, '000000');   // deliberately wrong
  const { data: row } = await admin.from('otp_codes').select('attempts').eq('id', planted.id).single();
  if (i <= 5) { if (r.body?.error !== 'wrong_code' && r.body?.error !== 'no_code') hole('중간', `verify attempt ${i} unexpected: ${JSON.stringify(r.body)}`); }
  if (i === 5 && row.attempts >= 5) locked = true;
}
{ const { data: row } = await admin.from('otp_codes').select('attempts').eq('id', planted.id).single();
  (row.attempts >= 5) ? held(`otp-verify increments attempts and caps (attempts=${row.attempts})`) : hole('중간', `attempts counter not enforced: ${row.attempts}`); }
// after lockout even the correct code is refused
{ const r = await verify(other, good);
  (r.body?.error === 'no_code') ? held('otp-verify: after 5 wrong attempts, correct code is locked out (no_code)') : hole('높음', 'otp-verify accepted code after lockout: ' + JSON.stringify(r.body)); }

// ---- dev fixed-code must not work for a non-dev phone with no live code ----
await admin.from('otp_codes').delete().eq('phone', phone);   // ensure no live code
let devHit = false;
for (const c of ['000000', '123456', '111111']) { const r = await verify(phone, c); if (r.status === 200) devHit = true; }
(!devHit) ? held('dev fixed-code does not authenticate a non-DEV_OTP phone (probed 3 codes, all rejected)') : hole('높음', 'a 6-digit code authenticated a non-dev phone -> dev code leaks to all phones');

report();
await cleanup();
console.log('cleaned');
