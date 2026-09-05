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

/** 이 번호가 BRIGHT 운영자인가. app_operators 는 user_id 로만 잡으므로 users 행이 먼저 있어야 한다
 *  (운영자 등록은 tools/set-operator.mjs 가 users 행까지 만든다). 운영자는 어느 학원의 소속도 아니다. */
// deno-lint-ignore no-explicit-any
export async function operatorIdByPhone(admin: any, phone: string): Promise<string | null> {
  const { data: u } = await admin.from('users').select('id').eq('phone', phone).maybeSingle();
  if (!u) return null;
  const { data: op } = await admin.from('app_operators').select('user_id').eq('user_id', u.id).maybeSingle();
  return op ? u.id : null;
}

/**
 * 명부(roster_phones)를 근거로 users 행·auth 사용자·memberships 를 보장하고 새 비밀번호를 심는다.
 * 명부에 없는 번호는 들어올 수 없다(404 not_in_roster).
 *
 * 두 가지 예외가 붙었다 (0023 운영자 화면):
 *  · 잠긴 학원(academies.locked)의 명부 행은 없는 셈 친다. 번호가 학원 여럿에 있으면 잠긴 쪽만 빠지고,
 *    남는 학원이 하나도 없으면 403 academy_locked 로 거절한다(명부 자체가 없으면 예전처럼 404).
 *  · app_operators 에 있는 번호는 명부가 없어도 들어온다 — memberships 는 빈 배열, operator: true.
 *    사장님처럼 운영자이면서 어느 학원의 원장이기도 하면 둘 다 온다(memberships 도 차고 operator 도 true).
 */
// deno-lint-ignore no-explicit-any
export async function ensureUser(admin: any, phone: string): Promise<{ uid: string; email: string; password: string; memberships: Membership[]; operator: boolean }> {
  const email = authEmail(phone), password = crypto.randomUUID() + crypto.randomUUID();
  const { data: rosterAll } = await admin.from('roster_phones').select('academy_id, role, name, student_id, academies(locked)').eq('phone', phone);
  // deno-lint-ignore no-explicit-any
  const roster = (rosterAll ?? []).filter((r: any) => r.academies?.locked !== true);
  const opId = await operatorIdByPhone(admin, phone);
  if (!roster.length && !opId) throw new AuthFail(rosterAll?.length ? 403 : 404, rosterAll?.length ? 'academy_locked' : 'not_in_roster');

  let uid: string;
  const { data: existing } = await admin.from('users').select('id').eq('phone', phone).maybeSingle();
  if (existing) { uid = existing.id; await admin.auth.admin.updateUserById(uid, { password }); }
  else {
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new AuthFail(500, error.message);
    uid = created.user.id;
    await admin.from('users').insert({ id: uid, name: roster[0]?.name ?? 'BRIGHT', phone });
  }
  // memberships 동기화: (잠기지 않은) 명부 행마다 하나
  for (const r of roster) {
    await admin.from('memberships').upsert({ user_id: uid, academy_id: r.academy_id, role: r.role, student_id: r.student_id }, { onConflict: 'user_id,academy_id,role,student_id', ignoreDuplicates: true });
    if (r.role === 'parent' && r.student_id) await admin.from('guardians').upsert({ student_id: r.student_id, user_id: uid }, { onConflict: 'student_id,user_id', ignoreDuplicates: true });
    if (r.role === 'student' && r.student_id) await admin.from('students').update({ user_id: uid }).eq('id', r.student_id).is('user_id', null);
    if (r.role === 'teacher') await admin.rpc('link_teacher_classes', { p_user: uid, p_phone: phone });   // 번호로 잡아 둔 담당 반을 이어 준다
  }
  const memberships = await listMemberships(admin, uid);
  // 잠긴 학원을 가리키던 활성 소속은 풀어 준다 — 지난 로그인의 memberships 행은 그대로 남아 있다.
  const { data: urow } = await admin.from('users').select('active_membership_id').eq('id', uid).maybeSingle();
  if (!memberships.some((m) => m.id === urow?.active_membership_id)) {
    const next = memberships.length === 1 ? memberships[0].id : null;
    if ((urow?.active_membership_id ?? null) !== next) await admin.from('users').update({ active_membership_id: next }).eq('id', uid);
  }
  return { uid, email, password, memberships, operator: !!opId };
}

/** 그 사람의 소속. 잠긴 학원은 빼고 준다 — 앱은 여기 온 것만 고를 수 있다. */
// deno-lint-ignore no-explicit-any
export async function listMemberships(admin: any, uid: string): Promise<Membership[]> {
  const { data: ms } = await admin.from('memberships').select('id, academy_id, role, student_id, academies(name, locked), students(name)').eq('user_id', uid);
  // deno-lint-ignore no-explicit-any
  return (ms ?? []).filter((m: any) => m.academies?.locked !== true)
    // deno-lint-ignore no-explicit-any
    .map((m: any) => ({ id: m.id, academy_id: m.academy_id, role: m.role, student_id: m.student_id, academy_name: m.academies?.name, student_name: m.students?.name }));
}

/** ensureUser 가 심은 비밀번호로 정식 세션을 만든다. */
export async function issueSession(email: string, password: string): Promise<{ access_token: string; refresh_token: string }> {
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data: s, error: e } = await anon.auth.signInWithPassword({ email, password });
  if (e || !s.session) throw new AuthFail(500, e?.message ?? 'no_session');
  return { access_token: s.session.access_token, refresh_token: s.session.refresh_token };
}
