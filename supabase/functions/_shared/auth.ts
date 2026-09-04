import { createClient } from 'npm:@supabase/supabase-js@2';

// otp-verify 와 invite-login 이 나눠 쓰는 "사용자 보장 + 소속 동기화 + 세션 발급".
// 두 함수의 진입 방식만 다르고(인증번호 / 초대 토큰) 그 뒤는 한 글자도 달라서는 안 된다.

export type Membership = {
  id: string; academy_id: string; role: string; student_id: string | null;
  academy_name?: string; student_name?: string;
};

/** 호출자가 그대로 응답으로 바꿀 수 있는 실패. (status, code) 는 지금 otp-verify 가 내던 것과 같다. */
export class AuthFail extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export const authEmail = (phone: string) => `${phone}@auth.yeongeo.local`;

/**
 * 명부(roster_phones)를 근거로 users 행·auth 사용자·memberships 를 보장하고 새 비밀번호를 심는다.
 * 명부에 없는 번호는 들어올 수 없다(404 not_in_roster).
 */
// deno-lint-ignore no-explicit-any
export async function ensureUser(admin: any, phone: string): Promise<{ uid: string; email: string; password: string; memberships: Membership[] }> {
  const email = authEmail(phone), password = crypto.randomUUID() + crypto.randomUUID();
  const { data: roster } = await admin.from('roster_phones').select('academy_id, role, name, student_id').eq('phone', phone);
  if (!roster?.length) throw new AuthFail(404, 'not_in_roster');
  let uid: string;
  const { data: existing } = await admin.from('users').select('id').eq('phone', phone).maybeSingle();
  if (existing) { uid = existing.id; await admin.auth.admin.updateUserById(uid, { password }); }
  else {
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new AuthFail(500, error.message);
    uid = created.user.id;
    await admin.from('users').insert({ id: uid, name: roster[0].name, phone });
  }
  // memberships 동기화: 명부 행마다 하나
  for (const r of roster) {
    await admin.from('memberships').upsert({ user_id: uid, academy_id: r.academy_id, role: r.role, student_id: r.student_id }, { onConflict: 'user_id,academy_id,role,student_id', ignoreDuplicates: true });
    if (r.role === 'parent' && r.student_id) await admin.from('guardians').upsert({ student_id: r.student_id, user_id: uid }, { onConflict: 'student_id,user_id', ignoreDuplicates: true });
    if (r.role === 'student' && r.student_id) await admin.from('students').update({ user_id: uid }).eq('id', r.student_id).is('user_id', null);
    if (r.role === 'teacher') await admin.rpc('link_teacher_classes', { p_user: uid, p_phone: phone });   // 번호로 잡아 둔 담당 반을 이어 준다
  }
  const memberships = await listMemberships(admin, uid);
  if (memberships.length === 1) await admin.from('users').update({ active_membership_id: memberships[0].id }).eq('id', uid);
  return { uid, email, password, memberships };
}

// deno-lint-ignore no-explicit-any
export async function listMemberships(admin: any, uid: string): Promise<Membership[]> {
  const { data: ms } = await admin.from('memberships').select('id, academy_id, role, student_id, academies(name), students(name)').eq('user_id', uid);
  // deno-lint-ignore no-explicit-any
  return (ms ?? []).map((m: any) => ({ id: m.id, academy_id: m.academy_id, role: m.role, student_id: m.student_id, academy_name: m.academies?.name, student_name: m.students?.name }));
}

/** ensureUser 가 심은 비밀번호로 정식 세션을 만든다. */
export async function issueSession(email: string, password: string): Promise<{ access_token: string; refresh_token: string }> {
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data: s, error: e } = await anon.auth.signInWithPassword({ email, password });
  if (e || !s.session) throw new AuthFail(500, e?.message ?? 'no_session');
  return { access_token: s.session.access_token, refresh_token: s.session.refresh_token };
}
