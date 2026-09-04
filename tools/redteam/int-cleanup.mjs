// 무결성 점검 뒷정리 — slug rt-int-* 학원과 name rtint-* 사용자만 지운다. 다른 접두어(다른 에이전트)·yeongeo 는 건드리지 않는다.
// 실행: node --env-file=.env.local tools/redteam/int-cleanup.mjs
import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const { data: acs } = await admin.from('academies').select('id, slug').like('slug', 'rt-int-%');
for (const a of acs ?? []) {
  const { error } = await admin.from('academies').delete().eq('id', a.id);
  console.log((error ? 'FAIL ' : 'del  ') + a.slug + (error ? ' — ' + error.message : ''));
}
const { data: us } = await admin.from('users').select('id, name').like('name', 'rtint-%');
let n = 0;
for (const u of us ?? []) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  const { error: e2 } = await admin.from('users').delete().eq('id', u.id);
  if (!error || !e2) n++; else console.log('FAIL user', u.name, error?.message);
}
const left = {
  academies: ((await admin.from('academies').select('id').like('slug', 'rt-int-%')).data ?? []).length,
  users: ((await admin.from('users').select('id').like('name', 'rtint-%')).data ?? []).length,
};
console.log(`정리: 학원 ${(acs ?? []).length}, 사용자 ${n} | 남은 것 ${JSON.stringify(left)}`);
