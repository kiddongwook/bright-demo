// 데이터 무결성 적대적 점검 — 공통 도구. 내가 만든 학원(slug rt-int-*)·사용자(name rtint-*)만 만진다.
// 실행: node --env-file=.env.local tools/redteam/int-*.mjs
import { createClient } from '@supabase/supabase-js';

export const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
export const admin = createClient(URL, SVC, { auth: { persistSession: false } });

export const rnd = () => Math.random().toString(36).slice(2, 8);
export const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
export const phone = () => '0109' + num() + String(Math.floor(Math.random() * 10));
export const email = p => `${p}@auth.yeongeo.local`;
export const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
export const ym = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() + off); return d.toISOString().slice(0, 7); };

export const PW = 'rtint-' + rnd();
const created = { academies: [], users: [] };

export async function mkUser(label, ph) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(ph), password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from('users').insert({ id: data.user.id, name: `rtint-${label}`, phone: ph });
  created.users.push(data.user.id);
  return data.user.id;
}

/** 학원 + 반 + 원장(로그인된 anon 클라이언트) */
export async function setup(tag) {
  const r = rnd();
  const { data: ac, error } = await admin.from('academies').insert({ slug: `rt-int-${tag}-${r}`, name: `무결성 점검 ${tag}` }).select().single();
  if (error) throw error;
  created.academies.push(ac.id);
  const { data: c1 } = await admin.from('classes').insert({ academy_id: ac.id, name: '반 A', schedule: [{ dow: 1, start: '19:00', end: '21:00' }, { dow: 3, start: '19:00', end: '21:00' }] }).select().single();
  const { data: c2 } = await admin.from('classes').insert({ academy_id: ac.id, name: '반 B', schedule: [{ dow: 2, start: '20:00', end: '22:00' }] }).select().single();
  const dp = phone(); const dirId = await mkUser('dir-' + r, dp);
  const { data: dm } = await admin.from('memberships').insert({ user_id: dirId, academy_id: ac.id, role: 'director' }).select().single();
  await admin.from('users').update({ active_membership_id: dm.id }).eq('id', dirId);
  const d = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: se } = await d.auth.signInWithPassword({ email: email(dp), password: PW });
  if (se) throw se;
  return { A: ac.id, c1, c2, dirId, dirPhone: dp, d };
}

/** 사용자 하나를 만들고 그 학원 소속으로 로그인시킨다 */
export async function mkClient(A, role, opts = {}) {
  const ph = opts.phone ?? phone();
  const uid = opts.userId ?? await mkUser(`${role}-${rnd()}`, ph);
  const { data: m, error } = await admin.from('memberships').insert({ user_id: uid, academy_id: A, role, student_id: opts.studentId ?? null }).select().single();
  if (error) throw error;
  await admin.from('users').update({ active_membership_id: m.id }).eq('id', uid);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email: email(ph), password: PW });
  return { uid, phone: ph, membershipId: m.id, c };
}

export const findings = [];
export function F(id, sev, what, evidence) { findings.push({ id, sev, what, evidence }); }

/** Promise.all 결과를 { ok, code, msg } 로 */
export const outcome = r => r.error ? { ok: false, code: r.error.code ?? '', msg: (r.error.message ?? '').slice(0, 90) } : { ok: true, data: r.data };
export const codes = rs => rs.map(x => x.ok ? 'OK' : (x.code || x.msg)).join(' | ');

export async function report(title) {
  console.log(`\n===== ${title}: 발견 ${findings.length}건 =====`);
  for (const f of findings) console.log(`[${f.sev}] ${f.id} — ${f.what}\n      ${f.evidence}`);
}

export async function cleanup() {
  for (const id of created.academies) { const { error } = await admin.from('academies').delete().eq('id', id); if (error) console.log('  ! academy delete', id, error.message); }
  for (const id of created.users) { await admin.auth.admin.deleteUser(id).catch(() => {}); await admin.from('users').delete().eq('id', id); }
  console.log(`\n정리: 학원 ${created.academies.length}, 사용자 ${created.users.length}`);
}
