import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendSms, normalizePhone, sha256, json, cors } from '../_shared/sms.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors();
  const { phone: raw } = await req.json().catch(() => ({}));
  const phone = normalizePhone(raw);
  if (phone.length < 10) return json(400, { error: 'bad_phone' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // 이름은 DB 에서만 온다 — 번호가 여러 학원에 있으면 첫 학원 (문자 앞머리 [학원])
  const { data: roster } = await admin.from('roster_phones').select('academy_id, academies(name)').eq('phone', phone);
  if (!roster?.length) return json(404, { error: 'not_in_roster' });
  const academyName = (roster[0] as { academies?: { name?: string } }).academies?.name ?? '학원';
  const { count: recent } = await admin.from('otp_codes').select('id', { count: 'exact', head: true }).eq('phone', phone).gt('created_at', new Date(Date.now() - 10 * 60e3).toISOString());
  if ((recent ?? 0) >= 3) return json(429, { error: 'too_many' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await admin.from('otp_codes').insert({ phone, code_hash: await sha256(code + phone), expires_at: new Date(Date.now() + 5 * 60e3).toISOString() });
  await sendSms(phone, `[${academyName}] 인증번호 ${code} (5분 안에 입력)`);
  return json(200, { ok: true });
});
