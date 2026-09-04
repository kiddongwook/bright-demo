// Attack: export-academy with teacher/parent JWT (director-only), outbox-callback without the shared key,
// client_errors insert abuse (foreign user_id, cross-academy academy_id, oversized payload, no rate limit),
// and storage buckets notices/logos read+write with a parent JWT (own and cross-academy paths).
import { admin, URL, ANON, email, seedAcademy, held, hole, note, report, cleanup } from './_common.mjs';
import { createClient } from '@supabase/supabase-js';

const A = await seedAcademy('edgA');
const B = await seedAcademy('edgB');

// _common doesn't export the shared PW, so reset each user's password to a known value via admin.
const PW = 'rt-edge-' + Math.random().toString(36).slice(2);
for (const u of [A.dir, A.par1, A.tch, B.dir, B.par1]) await admin.auth.admin.updateUserById(u.uid, { password: PW });
async function tokenFor(phone, mid) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: email(phone), password: PW });
  if (error) throw new Error('signin ' + error.message);
  if (mid) await c.rpc('set_active_membership', { m: mid });
  return { c, token: data.session.access_token };
}
const exportCall = async (token) => {
  const res = await fetch(`${URL}/functions/v1/export-academy`, { headers: { Authorization: 'Bearer ' + (token ?? '') } });
  let j = null; try { j = await res.clone().json(); } catch { /* attachment */ }
  return { status: res.status, body: j };
};

// ---- export-academy ----
const dirTok = (await tokenFor(A.dir.phone, A.dir.mid)).token;
const parTok = (await tokenFor(A.par1.phone, A.par1.mid)).token;
const tchTok = (await tokenFor(A.tch.phone, A.tch.mid)).token;
let r = await exportCall(parTok); (r.status === 403) ? held('export-academy: parent JWT -> 403 director_only') : hole('높음', 'export-academy served a parent: ' + r.status);
r = await exportCall(tchTok); (r.status === 403) ? held('export-academy: teacher JWT -> 403 director_only') : hole('높음', 'export-academy served a teacher: ' + r.status);
r = await exportCall(''); (r.status === 401) ? held('export-academy: no token -> 401') : hole('중간', 'export-academy no-token: ' + r.status);
r = await exportCall('garbage.jwt.value'); (r.status === 401) ? held('export-academy: bad token -> 401') : hole('중간', 'export-academy bad-token: ' + r.status);
r = await exportCall(dirTok); (r.status === 200) ? held('control: director JWT exports (200)') : note('director export status ' + r.status);

// ---- outbox-callback without / wrong key ----
const cb = async (headers) => (await fetch(`${URL}/functions/v1/outbox-callback`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, ...headers }, body: JSON.stringify({ provider_msg_id: 'x', status: 'delivered' }) })).status;
(await cb({}) === 401) ? held('outbox-callback: no key -> 401') : hole('높음', 'outbox-callback served without key');
(await cb({ 'x-outbox-key': 'wrong' }) === 401) ? held('outbox-callback: wrong key -> 401') : hole('높음', 'outbox-callback served with wrong key');

// ---- client_errors insert abuse ----
// NOTE: client_errors has an INSERT policy but NO SELECT policy, so .insert().select() would error on the
// read-back even when the row lands. We insert WITHOUT .select() and confirm via the service-role count.
const par = (await tokenFor(A.par1.phone, A.par1.mid)).c;
// (a) foreign user_id -> RLS with-check should block
r = await par.from('client_errors').insert({ user_id: A.dir.uid, message: 'x' });
(r.error) ? held('client_errors: cannot insert with another user_id (RLS)') : hole('중간', 'client_errors accepted a foreign user_id');
// (b) own user_id but FOREIGN academy_id + oversized payload + repeated (no size/rate/academy guard)
const big = 'A'.repeat(200 * 1024);
const before = (await admin.from('client_errors').select('id', { count: 'exact', head: true }).eq('academy_id', B.ac.id)).count ?? 0;
let errs = 0;
for (let i = 0; i < 8; i++) { const rr = await par.from('client_errors').insert({ user_id: A.par1.uid, academy_id: B.ac.id, message: big, stack: big }); if (rr.error) errs++; }
const landed = ((await admin.from('client_errors').select('id', { count: 'exact', head: true }).eq('academy_id', B.ac.id)).count ?? 0) - before;
(landed === 0) ? held('client_errors oversized/cross-academy inserts rejected') : hole('낮음', `client_errors: parent landed ${landed}/8 rows of ~400KB EACH tagged with a FOREIGN academy_id (no size cap, no rate limit, academy_id unvalidated) -> log poisoning / storage bloat`);

// ---- storage buckets ----
// seed one object in each bucket under B's academy folder via admin (service role bypasses RLS)
const notceKey = `${B.ac.id}/note/secret.txt`;
await admin.storage.from('notices').upload(notceKey, new Blob(['B private notice photo']), { upsert: true, contentType: 'text/plain' });
// parent of A tries to read B's notices object
let s = await par.storage.from('notices').download(notceKey);
(s.error) ? held('storage notices: parentA cannot download B academy object') : hole('높음', 'parentA downloaded B notices object');
s = await par.storage.from('notices').list(`${B.ac.id}/note`);
((s.data?.length ?? 0) === 0 || s.error) ? held('storage notices: parentA cannot list B folder') : hole('높음', 'parentA listed B notices folder: ' + JSON.stringify(s.data?.map(x => x.name)));
// parent (non-staff) tries to WRITE into own academy notices (staff-only)
s = await par.storage.from('notices').upload(`${A.ac.id}/note/pwn-${Math.random()}.txt`, new Blob(['x']), { contentType: 'text/plain' });
(s.error) ? held('storage notices: parentA cannot write to own-academy folder (staff-only)') : hole('높음', 'parentA wrote to notices bucket');
// parent tries to write into B notices
s = await par.storage.from('notices').upload(`${B.ac.id}/note/pwn-${Math.random()}.txt`, new Blob(['x']), { contentType: 'text/plain' });
(s.error) ? held('storage notices: parentA cannot write to B folder') : hole('높음', 'parentA wrote into B notices folder');
// parent tries to write logo (director-only) in own + B academy
s = await par.storage.from('logos').upload(`${A.ac.id}/logo-${Math.random()}.png`, new Blob(['x']), { contentType: 'image/png' });
(s.error) ? held('storage logos: parentA cannot write own logo (director-only)') : hole('높음', 'parentA wrote own logo');
s = await par.storage.from('logos').upload(`${B.ac.id}/logo-${Math.random()}.png`, new Blob(['x']), { contentType: 'image/png' });
(s.error) ? held('storage logos: parentA cannot write B logo') : hole('높음', 'parentA wrote B logo');

// cleanup storage object we planted
await admin.storage.from('notices').remove([notceKey]).catch(() => {});
report();
await cleanup();
console.log('cleaned');
