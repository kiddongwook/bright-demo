// Attack/audit: functions whose safety rests only on GRANTs (not on an in-body role/academy check):
// recalc_invoice, outbox_claim/outbox_tick, housekeeping, link_teacher_classes must be unreachable by
// authenticated/anon. Plus list_public_tables (security-definer WITHOUT set search_path) info disclosure,
// and set_active_membership ownership check.
import { admin, URL, ANON, email, seedAcademy, held, hole, note, report, cleanup } from './_common.mjs';
import { createClient } from '@supabase/supabase-js';

const A = await seedAcademy('rpc');
const PW = 'rt-rpc-' + Math.random().toString(36).slice(2);
await admin.auth.admin.updateUserById(A.par1.uid, { password: PW });
const auth = createClient(URL, ANON, { auth: { persistSession: false } });
await auth.auth.signInWithPassword({ email: email(A.par1.phone), password: PW });
await auth.rpc('set_active_membership', { m: A.par1.mid });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

// invoice to target recalc with
const { data: inv } = await admin.from('invoices').insert({ academy_id: A.ac.id, student_id: A.s1.id, period_ym: '2026-09', amount: 1000, total: 1000, due_date: '2026-09-05', status: 'issued' }).select().single();

// ---- grant-gated service_role functions must be denied to authenticated & anon ----
for (const [fn, args] of [
  ['recalc_invoice', { p_invoice: inv.id }],
  ['outbox_claim', { n: 5 }],
  ['outbox_tick', {}],
  ['housekeeping', {}],
  ['link_teacher_classes', { p_user: A.tch.uid, p_phone: A.tch.phone }],
]) {
  const ra = await auth.rpc(fn, args);
  ra.error ? held(`authenticated cannot call ${fn} (${ra.error.code ?? ''} ${(ra.error.message ?? '').slice(0, 40)})`) : hole('높음', `authenticated CALLED ${fn}!`);
  const rn = await anon.rpc(fn, args);
  rn.error ? held(`anon cannot call ${fn}`) : hole('높음', `anon CALLED ${fn}!`);
}

// ---- list_public_tables: security-definer WITHOUT set search_path; check reachability (info disclosure) ----
{
  const ra = await auth.rpc('list_public_tables');
  const rn = await anon.rpc('list_public_tables');
  if (!ra.error && (ra.data?.length ?? 0) > 0) hole('낮음', `list_public_tables callable by authenticated -> leaks ${ra.data.length} table names; and it is SECURITY DEFINER without set search_path`);
  else held('list_public_tables not callable by authenticated');
  if (!rn.error && (rn.data?.length ?? 0) > 0) hole('낮음', `list_public_tables callable by ANON -> leaks ${rn.data.length} table names`);
  else held('list_public_tables not callable by anon');
}

// ---- set_active_membership ownership ----
{
  const r = await auth.rpc('set_active_membership', { m: A.dir.mid });   // director's membership, not ours
  const { data: u } = await admin.from('users').select('active_membership_id').eq('id', A.par1.uid).single();
  (r.error && u.active_membership_id === A.par1.mid) ? held('set_active_membership rejects a membership that is not yours') : hole('높음', 'set_active_membership let a parent adopt the director membership: ' + JSON.stringify(u));
}

// ---- public_academy returns only name/brand_color/logo_path (no secrets) ----
{
  const { data: ac } = await admin.from('academies').select('slug').eq('id', A.ac.id).single();
  const r = await anon.rpc('public_academy', { p_slug: ac.slug });
  const cols = Object.keys(r.data?.[0] ?? {}).sort().join(',');
  (r.data?.length === 1 && cols === 'brand_color,logo_path,name') ? held('public_academy exposes only name/brand_color/logo_path to anon') : hole('중간', 'public_academy columns: ' + cols);
}

report();
await cleanup();
console.log('cleaned');
