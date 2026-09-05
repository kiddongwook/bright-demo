import { createClient } from 'npm:@supabase/supabase-js@2';
import { sha256, json, cors } from '../_shared/sms.ts';
import { listMemberships } from '../_shared/auth.ts';
// 알림톡 버튼의 토큰 하나로 그 사용자 세션을 만든다. 토큰은 해시만 저장돼 있다. 만료 전엔 다시 눌러도 열린다(카톡에서 여러 번 누른다).
// 세션은 매직링크 검증으로 만든다 — 비밀번호를 갈지 않으므로 설치된 앱의 기존 세션이 끊기지 않는다.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors();
  // resolve: true — 이미 들어와 있는 기기에서 누른 경우. 세션은 만들지 않고 어느 화면인지만 알려준다.
  const { token, resolve } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f]{32}$/.test(token ?? '')) return json(401, { error: 'bad_token' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: lt } = await admin.from('link_tokens').select('*').eq('token_hash', await sha256(token)).maybeSingle();
  if (!lt) return json(401, { error: 'bad_token' });
  if (new Date(lt.expires_at) < new Date()) return json(401, { error: 'expired' });
  // 잠긴 학원(운영자가 이용 정지, 0023)의 링크는 열지 않는다 — resolve 든 세션 발급이든 여기서 끝. otp-verify·invite-login 과 같은 403.
  const { data: ac } = await admin.from('academies').select('locked').eq('id', lt.academy_id).maybeSingle();
  if (ac?.locked === true) return json(403, { error: 'academy_locked' });
  const { data: u } = await admin.from('users').select('id, phone, active_membership_id').eq('id', lt.user_id).single();
  if (!u) return json(401, { error: 'bad_token' });
  // 소속은 otp-verify·invite-login 과 같은 한 곳(listMemberships)에서 — 잠긴 학원(0023) 소속은 빠진다. 응답 모양은 그대로. (B4-L7)
  const memberships = await listMemberships(admin, u.id);
  // 활성 역할이 이 학원 것이 아니면 이 학원의 첫 소속으로 (학부모·학생 우선)
  const inAcademy = memberships.filter(m => m.academy_id === lt.academy_id);
  if (!inAcademy.length) return json(401, { error: 'bad_token' });
  // 자녀가 둘인 학부모: 링크가 가리키는 결석·출결 행의 자녀 소속을 활성으로 (그 자녀 화면이 열리게)
  let wantStudent: string | null = null;
  if (lt.view === 'child' && lt.ref_id) {
    const { data: ab } = await admin.from('absence_requests').select('student_id').eq('id', lt.ref_id).maybeSingle();
    const { data: at } = ab ? { data: null } : await admin.from('attendance').select('student_id').eq('id', lt.ref_id).maybeSingle();
    wantStudent = ab?.student_id ?? at?.student_id ?? null;
  }
  const byStudent = wantStudent ? inAcademy.find(m => m.student_id === wantStudent) : null;
  if (byStudent && byStudent.id !== u.active_membership_id) await admin.from('users').update({ active_membership_id: byStudent.id }).eq('id', u.id);
  else if (!inAcademy.some(m => m.id === u.active_membership_id)) {
    const pick = inAcademy.find(m => m.role === 'parent' || m.role === 'student') ?? inAcademy[0];
    await admin.from('users').update({ active_membership_id: pick.id }).eq('id', u.id);
  }
  if (!lt.used_at) await admin.from('link_tokens').update({ used_at: new Date().toISOString() }).eq('id', lt.id);
  if (resolve === true) return json(200, { user_id: u.id, memberships, academy_id: lt.academy_id, view: lt.view, ref_id: lt.ref_id });
  const email = `${u.phone}@auth.yeongeo.local`;
  const { data: gl, error: ge } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (ge || !gl?.properties?.hashed_token) return json(500, { error: ge?.message ?? 'no_link' });
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data: s, error: e } = await anon.auth.verifyOtp({ token_hash: gl.properties.hashed_token, type: 'magiclink' });
  if (e || !s.session) return json(500, { error: e?.message ?? 'no_session' });
  return json(200, { user_id: u.id, session: { access_token: s.session.access_token, refresh_token: s.session.refresh_token }, memberships, academy_id: lt.academy_id, view: lt.view, ref_id: lt.ref_id });
});
