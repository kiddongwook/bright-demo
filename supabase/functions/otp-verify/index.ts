import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizePhone, sha256, json } from '../_shared/sms.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(204, {});
  const { phone: raw, code } = await req.json().catch(() => ({}));
  const phone = normalizePhone(raw);
  if (!phone || !/^\d{6}$/.test(code ?? '')) return json(400, { error: 'bad_input' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: rows } = await admin.from('otp_codes').select('*').eq('phone', phone).is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1);
  const otp = rows?.[0];
  if (!otp || otp.attempts >= 5) return json(401, { error: 'no_code' });
  if (otp.code_hash !== await sha256(code + phone)) { await admin.from('otp_codes').update({ attempts: otp.attempts + 1 }).eq('id', otp.id); return json(401, { error: 'wrong_code' }); }
  await admin.from('otp_codes').update({ used_at: new Date().toISOString() }).eq('id', otp.id);

  // auth 사용자 보장 (이메일 프로바이더로 전화번호 사용자 관리)
  const email = `${phone}@auth.yeongeo.local`, password = crypto.randomUUID() + crypto.randomUUID();
  const { data: roster } = await admin.from('roster_phones').select('academy_id, role, name, student_id').eq('phone', phone);
  if (!roster?.length) return json(404, { error: 'not_in_roster' });
  let uid: string;
  const { data: existing } = await admin.from('users').select('id').eq('phone', phone).maybeSingle();
  if (existing) { uid = existing.id; await admin.auth.admin.updateUserById(uid, { password }); }
  else {
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return json(500, { error: error.message });
    uid = created.user.id;
    await admin.from('users').insert({ id: uid, name: roster[0].name, phone });
  }
  // memberships 동기화: 명부 행마다 하나
  for (const r of roster) {
    await admin.from('memberships').upsert({ user_id: uid, academy_id: r.academy_id, role: r.role, student_id: r.student_id }, { onConflict: 'user_id,academy_id,role,student_id', ignoreDuplicates: true });
    if (r.role === 'parent' && r.student_id) await admin.from('guardians').upsert({ student_id: r.student_id, user_id: uid }, { onConflict: 'student_id,user_id', ignoreDuplicates: true });
    if (r.role === 'student' && r.student_id) await admin.from('students').update({ user_id: uid }).eq('id', r.student_id).is('user_id', null);
  }
  const { data: ms } = await admin.from('memberships').select('id, academy_id, role, student_id, academies(name), students(name)').eq('user_id', uid);
  const memberships = (ms ?? []).map((m: any) => ({ id: m.id, academy_id: m.academy_id, role: m.role, student_id: m.student_id, academy_name: m.academies?.name, student_name: m.students?.name }));
  if (memberships.length === 1) await admin.from('users').update({ active_membership_id: memberships[0].id }).eq('id', uid);

  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data: s, error: e } = await anon.auth.signInWithPassword({ email, password });
  if (e || !s.session) return json(500, { error: e?.message ?? 'no_session' });
  return json(200, { session: { access_token: s.session.access_token, refresh_token: s.session.refresh_token }, memberships });
});
