// Attack: cross-academy director + parent against management RPCs (create_invite, assign_class_teacher,
// roster_save_student, roster_save_teacher, roster_remove_teacher, student_leave, makeup_attended,
// roster_entry_status, list_teachers, student_timeline, link_teacher_classes), direct reads of
// roster_phones/link_tokens/otp_codes/invite_tokens, and users column-level grants (phone/active_membership_id).
import { admin, seedAcademy, login, held, hole, note, report, cleanup } from './_common.mjs';

const A = await seedAcademy('mgA');
const B = await seedAcademy('mgB');
// a confirmed absence for makeup_attended attacks
const { data: absB } = await admin.from('absence_requests').insert({ academy_id: B.ac.id, student_id: B.s1.id, requested_by: B.par1.uid, date: '2026-09-01', reason: 'x', status: 'confirmed', makeup_kind: 'material' }).select().single();
const { data: absA } = await admin.from('absence_requests').insert({ academy_id: A.ac.id, student_id: A.s1.id, requested_by: A.par1.uid, date: '2026-09-01', reason: 'x', status: 'confirmed', makeup_kind: 'material' }).select().single();
// a link_token + invite_token to try to read directly
const { data: lt } = await admin.from('link_tokens').insert({ academy_id: A.ac.id, user_id: A.par1.uid, view: 'child', token_hash: 'rt' + Math.random().toString(16).slice(2), expires_at: '2030-01-01' }).select().single();
await admin.from('otp_codes').insert({ phone: A.par1.phone, code_hash: 'rt', expires_at: '2030-01-01' });

const dirA = await login(A.dir.phone, A.dir.mid);
const parA1 = await login(A.par1.phone, A.par1.mid);

// ---- cross-academy director dirA reaching into B's ids ----
let r = await dirA.rpc('roster_save_student', { sid: B.s1.id, p_name: 'HACK', p_class_ids: [B.c1.id], p_student_phone: '', p_parent_phones: [] });
r.error ? held('dirA roster_save_student(B student) rejected: ' + r.error.message) : hole('높음', 'dirA edited B student');
r = await dirA.rpc('student_leave', { sid: B.s1.id }); r.error ? held('dirA student_leave(B) rejected') : hole('높음', 'dirA expelled B student');
r = await dirA.rpc('makeup_attended', { aid: absB.id }); r.error ? held('dirA makeup_attended(B absence) rejected') : hole('높음', 'dirA completed B makeup');
r = await dirA.rpc('assign_class_teacher', { p_class: B.c1.id, p_phone: B.tch.phone }); r.error ? held('dirA assign_class_teacher(B class) rejected') : hole('높음', 'dirA assigned teacher in B');
r = await dirA.rpc('create_invite', { p_phone: B.par1.phone }); r.error ? held('dirA create_invite(B phone) rejected: ' + r.error.message) : hole('높음', 'dirA minted invite for B phone -> ' + JSON.stringify(r.data)?.slice(0, 12));
r = await dirA.rpc('student_timeline', { sid: B.s1.id, lim: 10 }); (r.error || (r.data?.length ?? 0) === 0) ? held('dirA student_timeline(B) blocked/empty') : hole('높음', 'dirA read B timeline');
r = await dirA.rpc('roster_of_student', { sid: B.s1.id }); (r.error || (r.data?.length ?? 0) === 0) ? held('dirA roster_of_student(B) empty') : hole('높음', 'dirA read B roster phones');
r = await dirA.rpc('month_attendance', { sid: B.s1.id, ym: '2026-09' }); (r.error || (r.data?.length ?? 0) === 0) ? held('dirA month_attendance(B) empty') : hole('중간', 'dirA read B attendance via RPC');
// confirm B student intact
const { data: bS } = await admin.from('students').select('name,status').eq('id', B.s1.id).single();
(bS.name === B.s1.name && bS.status === 'active') ? held('B student intact after dirA attacks') : hole('높음', 'B student mutated: ' + JSON.stringify(bS));

// ---- parent calling director/staff RPCs ----
for (const [fn, args] of [
  ['roster_save_student', { sid: A.s1.id, p_name: 'x', p_class_ids: [], p_student_phone: '', p_parent_phones: [] }],
  ['roster_save_teacher', { p_name: 'x', p_phone: '01099998888' }],
  ['roster_remove_teacher', { p_phone: A.tch.phone }],
  ['student_leave', { sid: A.s1.id }],
  ['assign_class_teacher', { p_class: A.c1.id, p_phone: A.tch.phone }],
  ['create_invite', { p_phone: A.par1.phone }],
  ['roster_entry_status', {}],
  ['list_teachers', {}],
  ['roster_of_student', { sid: A.s1.id }],
  ['student_timeline', { sid: A.s1.id, lim: 10 }],
  ['makeup_attended', { aid: absA.id }],
]) {
  r = await parA1.rpc(fn, args);
  const blocked = r.error || (Array.isArray(r.data) && r.data.length === 0);
  blocked ? held(`parent ${fn} blocked/empty`) : hole('높음', `parent ${fn} succeeded: ` + JSON.stringify(r.data)?.slice(0, 40));
}
// link_teacher_classes is service_role only
r = await parA1.rpc('link_teacher_classes', { p_user: A.tch.uid, p_phone: A.tch.phone });
r.error ? held('parent link_teacher_classes rejected (service_role only)') : hole('높음', 'parent called link_teacher_classes');
r = await dirA.rpc('link_teacher_classes', { p_user: A.tch.uid, p_phone: A.tch.phone });
r.error ? held('director link_teacher_classes rejected (service_role only)') : hole('중간', 'director called link_teacher_classes');

// ---- direct reads of secret tables (anon + authenticated) ----
for (const tbl of ['roster_phones', 'link_tokens', 'otp_codes', 'invite_tokens', 'outbox', 'audit_log']) {
  const g = await parA1.from(tbl).select('*').limit(5);
  ((g.data?.length ?? 0) === 0) ? held(`parent read ${tbl} -> empty/blocked`) : hole('높음', `parent read ${tbl}: ${g.data.length} rows`);
}

// ---- users column-level grants: can parent change phone / active_membership_id ? ----
r = await parA1.from('users').update({ phone: '01000000000' }).eq('id', A.par1.uid).select();
{ const { data: u } = await admin.from('users').select('phone').eq('id', A.par1.uid).single();
  (u.phone === A.par1.phone) ? held('parent cannot change own users.phone (column grant)') : hole('높음', 'parent changed own phone to ' + u.phone); }
r = await parA1.from('users').update({ active_membership_id: A.dir.mid }).eq('id', A.par1.uid).select();
{ const { data: u } = await admin.from('users').select('active_membership_id').eq('id', A.par1.uid).single();
  (u.active_membership_id !== A.dir.mid) ? held('parent cannot set active_membership_id to director (column grant)') : hole('높음', 'parent escalated via active_membership_id!'); }
// name/prefs are allowed (control)
r = await parA1.from('users').update({ name: 'renamed', prefs: { kakao_notice: false } }).eq('id', A.par1.uid).select();
!r.error ? held('control: parent can update own name/prefs') : note('parent name/prefs update failed: ' + r.error.message);
// can parent update ANOTHER user's row?
r = await parA1.from('users').update({ name: 'pwn' }).eq('id', A.dir.uid).select();
((r.data?.length ?? 0) === 0) ? held("parent update of director's users row affects 0 rows (RLS)") : hole('높음', 'parent updated director row');

report();
await cleanup();
console.log('cleaned');
