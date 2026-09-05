import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizePhone, sha256, json, cors } from '../_shared/sms.ts';
import { AuthFail, ensureUser, issueSession } from '../_shared/auth.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors();
  const { phone: raw, code } = await req.json().catch(() => ({}));
  const phone = normalizePhone(raw);
  if (!phone || !/^\d{6}$/.test(code ?? '')) return json(400, { error: 'bad_input' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // 개발용 고정 인증번호: 문자 대행사가 붙기 전(콘솔 모드)에만, DEV_OTP_PHONES 에 적힌 번호에만 통한다. 대행사를 켜면(SMS_PROVIDER≠console) 자동으로 꺼진다.
  const devCode = Deno.env.get('DEV_OTP_CODE');
  const devPhones = (Deno.env.get('DEV_OTP_PHONES') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const devOk = (Deno.env.get('SMS_PROVIDER') ?? 'console') === 'console' && !!devCode && devPhones.includes(phone) && code === devCode;
  if (!devOk) {
    const { data: rows } = await admin.from('otp_codes').select('*').eq('phone', phone).is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1);
    const otp = rows?.[0];
    if (!otp || otp.attempts >= 5) return json(401, { error: 'no_code' });
    if (otp.code_hash !== await sha256(code + phone)) { await admin.from('otp_codes').update({ attempts: otp.attempts + 1 }).eq('id', otp.id); return json(401, { error: 'wrong_code' }); }
    await admin.from('otp_codes').update({ used_at: new Date().toISOString() }).eq('id', otp.id);
  }

  // auth 사용자 보장 + 소속 동기화 + 세션 발급 — invite-login 과 같은 코드 (_shared/auth.ts)
  try {
    // operator: BRIGHT 운영자다. 소속이 없어도(memberships: []) 세션이 나온다 — 앱은 곧장 운영 홈으로 간다 (0023).
    const { email, password, memberships, operator } = await ensureUser(admin, phone);
    const session = await issueSession(email, password);
    return json(200, { session, memberships, operator });
  } catch (e) {
    if (e instanceof AuthFail) return json(e.status, { error: e.code });
    throw e;
  }
});
