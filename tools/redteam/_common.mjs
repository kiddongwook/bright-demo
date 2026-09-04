// Red-team shared helpers. Builds two isolated academies (slug prefix rt-sec-) with a full cast,
// exposes logged-in role clients, and cleans everything up. Never touches yeongeo/yeongeo-jip.
// Run any sec-*.mjs with:  node --env-file=../../.env.local tools/redteam/sec-XXX.mjs   (cwd = repo root)
import { createClient } from '@supabase/supabase-js';

export const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !ANON || !SVC) { console.error('missing env (run with --env-file=.env.local)'); process.exit(2); }
export const admin = createClient(URL, SVC, { auth: { persistSession: false } });
export const email = (p) => `${p}@auth.yeongeo.local`;
const PW = 'rt-sec-' + Math.random().toString(36).slice(2);
const tag = () => Math.random().toString(36).slice(2, 7);
let phoneSeq = Math.floor(Math.random() * 1e6);
export const nextPhone = () => '0102' + String(phoneSeq++).padStart(6, '0').slice(-6);

// findings: { held: bool, sev: '높음'|'중간'|'낮음'|'-', msg }
export const findings = [];
export function held(msg) { findings.push({ held: true, sev: '-', msg }); console.log('  HELD  ' + msg); }
export function hole(sev, msg) { findings.push({ held: false, sev, msg }); console.log(`  HOLE [${sev}] ` + msg); }
export function note(msg) { console.log('  note  ' + msg); }
// assertBlocked: pass errOrEmpty=true when a blocked PostgREST read returns [] (no error). expectBlocked true => held when blocked.
export function report() {
  const holes = findings.filter(f => !f.held);
  console.log('\n== ' + (holes.length ? `${holes.length} HOLE(S)` : 'all held') + ' ==');
  return findings;
}

const created = { uids: [], academyIds: [], phones: [] };

export async function mkUser(phone, name) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true });
  if (error) throw new Error('createUser: ' + error.message);
  await admin.from('users').insert({ id: data.user.id, name, phone });
  created.uids.push(data.user.id); created.phones.push(phone);
  return data.user.id;
}
export function anonClient() { return createClient(URL, ANON, { auth: { persistSession: false } }); }
export async function login(phone, membershipId) {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email: email(phone), password: PW });
  if (error) throw new Error('signIn ' + phone + ': ' + error.message);
  if (membershipId) { const { error: e2 } = await c.rpc('set_active_membership', { m: membershipId }); if (e2) throw new Error('set_active ' + e2.message); }
  return c;
}

// Build one academy with: director, teacher assigned to c1, parent+student of S1(in c1), parent+student of S2(in c2).
export async function seedAcademy(label) {
  const t = tag();
  const { data: ac, error: ae } = await admin.from('academies').insert({ slug: `rt-sec-${label}-${t}`, name: `RT ${label}` }).select().single();
  if (ae) throw new Error('academy: ' + ae.message);
  created.academyIds.push(ac.id);
  const { data: c1 } = await admin.from('classes').insert({ academy_id: ac.id, name: 'C1' }).select().single();
  const { data: c2 } = await admin.from('classes').insert({ academy_id: ac.id, name: 'C2' }).select().single();
  const { data: s1 } = await admin.from('students').insert({ academy_id: ac.id, name: `${label}-S1` }).select().single();
  const { data: s2 } = await admin.from('students').insert({ academy_id: ac.id, name: `${label}-S2` }).select().single();
  await admin.from('enrollments').insert([{ student_id: s1.id, class_id: c1.id }, { student_id: s2.id, class_id: c2.id }]);

  const pDir = nextPhone(), pTch = nextPhone(), pPar1 = nextPhone(), pStu1 = nextPhone(), pPar2 = nextPhone();
  const dirU = await mkUser(pDir, `${label}원장`);
  const tchU = await mkUser(pTch, `${label}강사`);
  const par1U = await mkUser(pPar1, `${label}학부모1`);
  const stu1U = await mkUser(pStu1, `${label}학생1`);
  const par2U = await mkUser(pPar2, `${label}학부모2`);
  // roster rows (for otp/invite/entry-status tests)
  await admin.from('roster_phones').insert([
    { academy_id: ac.id, phone: pDir, role: 'director', name: `${label}원장` },
    { academy_id: ac.id, phone: pTch, role: 'teacher', name: `${label}강사` },
    { academy_id: ac.id, phone: pPar1, role: 'parent', name: `${label}-S1 학부모`, student_id: s1.id },
    { academy_id: ac.id, phone: pStu1, role: 'student', name: `${label}-S1`, student_id: s1.id },
    { academy_id: ac.id, phone: pPar2, role: 'parent', name: `${label}-S2 학부모`, student_id: s2.id },
  ]);
  const { data: mDir } = await admin.from('memberships').insert({ user_id: dirU, academy_id: ac.id, role: 'director' }).select().single();
  const { data: mTch } = await admin.from('memberships').insert({ user_id: tchU, academy_id: ac.id, role: 'teacher' }).select().single();
  const { data: mPar1 } = await admin.from('memberships').insert({ user_id: par1U, academy_id: ac.id, role: 'parent', student_id: s1.id }).select().single();
  const { data: mStu1 } = await admin.from('memberships').insert({ user_id: stu1U, academy_id: ac.id, role: 'student', student_id: s1.id }).select().single();
  const { data: mPar2 } = await admin.from('memberships').insert({ user_id: par2U, academy_id: ac.id, role: 'parent', student_id: s2.id }).select().single();
  await admin.from('guardians').insert([{ student_id: s1.id, user_id: par1U }, { student_id: s2.id, user_id: par2U }]);
  await admin.from('students').update({ user_id: stu1U }).eq('id', s1.id);
  // teacher assigned to c1 only
  await admin.from('classes').update({ teacher_id: tchU, teacher_phone: pTch }).eq('id', c1.id);

  return {
    ac, c1, c2, s1, s2,
    dir: { uid: dirU, phone: pDir, mid: mDir.id },
    tch: { uid: tchU, phone: pTch, mid: mTch.id },
    par1: { uid: par1U, phone: pPar1, mid: mPar1.id },
    stu1: { uid: stu1U, phone: pStu1, mid: mStu1.id },
    par2: { uid: par2U, phone: pPar2, mid: mPar2.id },
  };
}

const swallow = async (p) => { try { await p; } catch { /* ignore */ } };
export async function cleanup() {
  // 1) business rows that reference users/students/classes without cascade, by academy_id
  const byAcademy = ['payments', 'invoices', 'todos', 'notices', 'attendance', 'absence_requests', 'notes', 'inquiries', 'faqs', 'calendar', 'roster_phones', 'invite_tokens', 'link_tokens', 'outbox', 'notifications', 'audit_log', 'client_errors', 'billing_rules', 'fee_plans'];
  for (const aid of created.academyIds) for (const t of byAcademy) await swallow(admin.from(t).delete().eq('academy_id', aid));
  // 2) null out student/class -> user refs so users can be deleted
  for (const aid of created.academyIds) {
    await swallow(admin.from('students').update({ user_id: null }).eq('academy_id', aid));
    await swallow(admin.from('classes').update({ teacher_id: null }).eq('academy_id', aid));
  }
  // 3) delete users (cascades memberships/guardians/push_subscriptions)
  for (const uid of created.uids) { await admin.auth.admin.deleteUser(uid).catch(() => {}); await swallow(admin.from('users').delete().eq('id', uid)); }
  for (const ph of created.phones) await swallow(admin.from('otp_codes').delete().eq('phone', ph));
  // 4) students/classes then academy
  for (const aid of created.academyIds) {
    await swallow(admin.from('students').delete().eq('academy_id', aid));
    await swallow(admin.from('classes').delete().eq('academy_id', aid));
    const { error } = await admin.from('academies').delete().eq('id', aid);
    if (error) console.log('academy del', error.message);
  }
}
