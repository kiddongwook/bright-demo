// Attack: invite-login and link-login edge functions — malformed/short/uppercase tokens, replay after the
// 10-min reuse window (simulated by backdating used_at), token for a phone removed from the roster,
// and link-login resolve:true membership disclosure.
import { createHash } from 'node:crypto';
import { admin, URL, ANON, seedAcademy, login, held, hole, note, report, cleanup } from './_common.mjs';

const sha256hex = (s) => createHash('sha256').update(s).digest('hex');
const call = async (fn, body) => {
  const res = await fetch(`${URL}/functions/v1/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }, body: JSON.stringify(body) });
  let j = null; try { j = await res.json(); } catch { /* */ }
  return { status: res.status, body: j };
};

const A = await seedAcademy('tokA');
const dirA = await login(A.dir.phone, A.dir.mid);

// ---- invite-login: malformed tokens ----
for (const [label, tok] of [['empty', ''], ['short', 'abc'], ['31hex', '0'.repeat(31)], ['33hex', '0'.repeat(33)], ['uppercase', 'A'.repeat(32)], ['nonhex', 'g'.repeat(32)], ['sql', "' or '1'='1"]]) {
  const r = await call('invite-login', { token: tok });
  (r.status === 401) ? held(`invite-login rejects ${label} token (401 ${r.body?.error})`) : hole('높음', `invite-login accepted ${label} token: ${r.status} ${JSON.stringify(r.body)}`);
}
// random well-formed but unknown token
{ const r = await call('invite-login', { token: Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32) });
  (r.status === 401) ? held('invite-login rejects unknown 32-hex token') : hole('높음', 'invite-login accepted unknown token: ' + JSON.stringify(r.body)); }

// ---- invite-login: valid token, reuse window, then replay after 10 min ----
let tok = (await dirA.rpc('create_invite', { p_phone: A.par1.phone })).data;
let r = await call('invite-login', { token: tok });
(r.status === 200 && r.body?.session) ? held('invite-login: fresh valid token issues session') : hole('중간', 'valid invite token failed: ' + JSON.stringify(r.body));
r = await call('invite-login', { token: tok });
(r.status === 200) ? held('invite-login: reuse within 10 min still works (double-tap)') : note('reuse-within-window failed: ' + JSON.stringify(r.body));
// backdate used_at 11 min
await admin.from('invite_tokens').update({ used_at: new Date(Date.now() - 11 * 60e3).toISOString() }).eq('token_hash', sha256hex(tok));
r = await call('invite-login', { token: tok });
(r.status === 401 && r.body?.error === 'used') ? held('invite-login: replay after 10 min rejected (used)') : hole('높음', 'invite-login replayed after window: ' + JSON.stringify(r.body));

// ---- invite-login: token for a phone removed from the roster ----
tok = (await dirA.rpc('create_invite', { p_phone: A.par2.phone })).data;
await admin.from('roster_phones').delete().eq('academy_id', A.ac.id).eq('phone', A.par2.phone);
r = await call('invite-login', { token: tok });
(r.status === 404 || r.body?.error === 'not_in_roster') ? held('invite-login: removed-from-roster phone rejected (404 not_in_roster)') : hole('높음', 'invite-login honored token for de-rostered phone: ' + JSON.stringify(r.body));

// ---- invite-login: expired token ----
tok = (await dirA.rpc('create_invite', { p_phone: A.par1.phone })).data;
await admin.from('invite_tokens').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('token_hash', sha256hex(tok));
r = await call('invite-login', { token: tok });
(r.status === 401 && r.body?.error === 'expired') ? held('invite-login: expired token rejected') : hole('중간', 'invite-login accepted expired token: ' + JSON.stringify(r.body));

// ---- link-login: malformed + resolve disclosure ----
for (const [label, tok2] of [['short', 'abc'], ['uppercase', 'A'.repeat(32)]]) {
  const rr = await call('link-login', { token: tok2, resolve: true });
  (rr.status === 401) ? held(`link-login rejects ${label} token`) : hole('높음', `link-login accepted ${label} token`);
}
// make a real link_token for par1 (academy A) and resolve it
const raw = Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32);
await admin.from('link_tokens').insert({ academy_id: A.ac.id, user_id: A.par1.uid, view: 'child', token_hash: sha256hex(raw), expires_at: new Date(Date.now() + 3600e3).toISOString() });
r = await call('link-login', { token: raw, resolve: true });
if (r.status === 200) {
  const ms = r.body?.memberships ?? [];
  const foreign = ms.filter(m => m.academy_id !== A.ac.id);
  foreign.length === 0 ? held(`link-login resolve returns only token-owner memberships in-academy (${ms.length})`) : hole('중간', 'link-login resolve leaked other-academy memberships: ' + JSON.stringify(foreign));
  (r.body?.user_id === A.par1.uid) ? held('link-login resolve maps only to token owner') : hole('높음', 'link-login resolve returned wrong user');
} else note('link-login resolve failed: ' + JSON.stringify(r.body));

report();
await cleanup();
console.log('cleaned');
