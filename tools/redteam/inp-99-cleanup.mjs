// inp-99 이 점검이 만든 것만 지운다 — slug 'rt-inp-%' 학원과 그 소속 auth 사용자.
import { admin } from './inp-lib.mjs';

const { data: acs } = await admin.from('academies').select('id, slug').like('slug', 'rt-inp-%');
let users = 0;
for (const a of acs ?? []) {
  const { data: ms } = await admin.from('memberships').select('user_id').eq('academy_id', a.id);
  const uids = [...new Set((ms ?? []).map((m) => m.user_id))];
  await admin.from('outbox').delete().eq('academy_id', a.id);
  const { error } = await admin.from('academies').delete().eq('id', a.id);
  if (error) console.log('academy delete failed', a.slug, error.message);
  for (const u of uids) { const { error: e } = await admin.auth.admin.deleteUser(u); if (!e) users++; }
}
// 학원 없이 남은 우리 사용자 (0109…, 명부·소속이 하나도 없는 것만)
const { data: cand } = await admin.from('users').select('id, phone').like('phone', '0109%');
const keep = new Set([
  ...((await admin.from('memberships').select('user_id')).data ?? []).map((m) => m.user_id),
  ...((await admin.from('roster_phones').select('phone')).data ?? []).map((r) => r.phone),
]);
for (const u of (cand ?? []).filter((x) => !keep.has(x.id) && !keep.has(x.phone))) {
  await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const { error } = await admin.from('users').delete().eq('id', u.id);
  if (!error) users++;
}
const { data: left } = await admin.from('academies').select('slug').like('slug', 'rt-inp-%');
console.log(`cleaned academies=${(acs ?? []).length} users=${users} · 남은 rt-inp 학원 ${left?.length ?? 0}`);
