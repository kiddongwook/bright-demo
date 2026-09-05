import { createClient } from 'npm:@supabase/supabase-js@2';
import { sha256, json, cors } from '../_shared/sms.ts';
import { AuthFail, ensureUser, issueSession } from '../_shared/auth.ts';

// 개인 초대 링크로 처음 들어오기. https://<앱>/?a=<slug>&i=<token>
// link-login 과 다른 점: link-login 은 "이미 사용자인 사람" 의 제한 세션이고, 여기는 명부만 있는 사람에게
// users 행·소속을 만들어 주는 정식 세션이다. 그래서 otp-verify 와 같은 _shared/auth.ts 를 쓴다.
// 카톡에서 링크를 두 번 누르는 일이 흔해 이미 쓴 토큰도 10분 안에는 다시 통한다.
const REUSE_MS = 10 * 60e3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors();
  const { token } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f]{32}$/.test(token ?? '')) return json(401, { error: 'bad_token' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: it } = await admin.from('invite_tokens').select('*').eq('token_hash', await sha256(token)).maybeSingle();
  if (!it) return json(401, { error: 'bad_token' });
  if (new Date(it.expires_at) < new Date()) return json(401, { error: 'expired' });
  if (it.used_at && Date.now() - new Date(it.used_at).getTime() > REUSE_MS) return json(401, { error: 'used' });
  // 이 학원이 잠겼으면(0023 op_set_lock) 링크도 열리지 않는다. ensureUser 도 잠긴 학원을 빼지만,
  // 그 번호가 다른 학원에도 있으면 통과해 버려 여기서 'not_in_roster' 라는 틀린 안내가 나간다 — 먼저 본다.
  const { data: lock } = await admin.from('academies').select('locked').eq('id', it.academy_id).maybeSingle();
  if (lock?.locked) return json(403, { error: 'academy_locked' });

  try {
    const { uid, email, password, memberships, operator } = await ensureUser(admin, it.phone);
    // 이 학원의 소속으로 화면을 연다 (자녀·본인 우선). 명부에서 빠졌으면 초대는 더 이상 유효하지 않다.
    const inAcademy = memberships.filter((m) => m.academy_id === it.academy_id);
    if (!inAcademy.length) return json(404, { error: 'not_in_roster' });
    const { data: u } = await admin.from('users').select('active_membership_id').eq('id', uid).maybeSingle();
    if (!inAcademy.some((m) => m.id === u?.active_membership_id)) {
      const pick = inAcademy.find((m) => m.role === 'parent' || m.role === 'student') ?? inAcademy[0];
      await admin.from('users').update({ active_membership_id: pick.id }).eq('id', uid);
    }
    if (!it.used_at) await admin.from('invite_tokens').update({ used_at: new Date().toISOString() }).eq('id', it.id);
    const { data: ac } = await admin.from('academies').select('slug, name').eq('id', it.academy_id).maybeSingle();
    const session = await issueSession(email, password);
    return json(200, { user_id: uid, session, memberships, operator, academy_id: it.academy_id, academy_slug: ac?.slug, academy_name: ac?.name });
  } catch (e) {
    if (e instanceof AuthFail) return json(e.status, { error: e.code });
    throw e;
  }
});
