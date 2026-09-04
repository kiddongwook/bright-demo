// 테스트가 남긴 학원(slug a-*, b-*, otp-*, … 적대적 점검의 rt-*)과 그 auth 사용자를 지운다. 씨앗 학원(yeongeo)은 건드리지 않는다.
// 접두어를 새로 쓰는 점검을 만들면 여기 목록에 같이 넣는다 — 뒷정리를 스크립트마다 따로 만들지 않게.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const { data: acs } = await admin.from('academies').select('id, slug').or('slug.like.a-%,slug.like.b-%,slug.like.otp-%,slug.like.flow-%,slug.like.outbox-%,slug.like.manage-%,slug.like.export-%,slug.like.hk-%,slug.like.onb-%,slug.like.files-%,slug.like.push-%,slug.like.inv-%,slug.like.bill-%,slug.like.seam-%,slug.like.hard-%,slug.like.rt-%,slug.like.ns-%,slug.like.attnote-%,slug.like.nt-%');
let users = 0;
for (const a of acs ?? []) {
  const { data: ms } = await admin.from('memberships').select('user_id').eq('academy_id', a.id);
  for (const m of ms ?? []) { const { error } = await admin.auth.admin.deleteUser(m.user_id); if (!error) users++; }
  const { error } = await admin.from('academies').delete().eq('id', a.id);
  if (error) console.log('academy delete failed', a.slug, error.message);
}
// 학원 없이 남은 테스트 사용자 (전화 0101*/0109*). 씨앗 학원 사용자(소속·명부가 있는 사람)는 절대 건드리지 않는다.
const { data: cand } = await admin.from('users').select('id, phone').or('phone.like.0101%,phone.like.0109%');
const keep = new Set([
  ...((await admin.from('memberships').select('user_id')).data ?? []).map(m => m.user_id),
  ...((await admin.from('roster_phones').select('phone')).data ?? []).map(r => r.phone),
]);
const orphans = (cand ?? []).filter(u => !keep.has(u.id) && !keep.has(u.phone));
for (const u of orphans) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) console.log('auth delete', u.phone.slice(0, 3) + '****', error.message);
  // auth 쪽이 이미 없거나 cascade 가 안 왔으면 public.users 를 직접 지운다
  const { error: e2 } = await admin.from('users').delete().eq('id', u.id);
  if (!e2) users++;
}
console.log(`cleaned academies=${(acs ?? []).length} users=${users}`);
