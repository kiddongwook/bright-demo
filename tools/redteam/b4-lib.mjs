// 4차 묶음 레드팀 공통 도구. 내가 만든 학원(slug rt-b4-*)·사용자(번호 0109…)만 만진다.
// 실행: cd tools && node --env-file=../.env.local redteam/rt-batch4-*.mjs
//
// 비용 안전장치
//  · otp-send 는 403 이 예상되는 곳(잠긴 학원)에서만 부른다 — 200 이면 실제 문자가 나간다(SOLAPI).
//  · 시험용 학부모에게는 전부 푸시 구독(.invalid 끝점)을 심는다 → 트리거가 알림톡 줄을 세우지 않는다.
//  · 알림을 만든 뒤에는 그 학원의 outbox 를 곧바로 읽고 지운다(pg_cron outbox_tick 이 1분마다 돈다).
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

export const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !ANON || !SVC) { console.error('missing env (run with --env-file=../.env.local)'); process.exit(2); }
export const admin = createClient(URL, SVC, { auth: { persistSession: false } });
export const email = p => `${p}@auth.yeongeo.local`;
export const rnd = () => Math.random().toString(36).slice(2, 8);
const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
export const phone = () => '0109' + num() + String(Math.floor(Math.random() * 10));
export const PW = 'rt-b4-' + rnd();
export const sha256 = s => createHash('sha256').update(s).digest('hex');
export const hex32 = () => randomBytes(16).toString('hex');
export const iso = ms => new Date(Date.now() + ms).toISOString();
export const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
export const err = r => r?.error?.message ?? '';
export const fn = (name, tok, body, qs = '') => fetch(`${URL}/functions/v1/${name}${qs}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON, ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
  body: JSON.stringify(body ?? {}),
});

// ---- 결과 수집 ----
export const results = [];
export function pass(msg) { results.push({ ok: true, msg }); console.log('  PASS     ' + msg); }
export function finding(id, sev, msg) { results.push({ ok: false, id, sev, msg }); console.log(`  FINDING  [${id} ${sev}] ${msg}`); }
export function note(msg) { console.log('  note     ' + msg); }
export function check(cond, passMsg, id, sev, failMsg) { cond ? pass(passMsg) : finding(id, sev, failMsg ?? passMsg); return cond; }
export function report(title) {
  const f = results.filter(r => !r.ok);
  console.log(`\n== ${title}: ${results.length - f.length} PASS · ${f.length} FINDING ==`);
  for (const x of f) console.log(`  [${x.id} ${x.sev}] ${x.msg}`);
}

// ---- 만든 것 기록 ----
export const created = { academies: [], users: [], phones: [], storage: [], linkHashes: [] };

export async function mkUser(name, ph = phone()) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(ph), password: PW, email_confirm: true });
  if (error) throw new Error('createUser ' + error.message);
  const { error: e2 } = await admin.from('users').insert({ id: data.user.id, name, phone: ph });
  if (e2) throw new Error('users insert ' + e2.message);
  created.users.push(data.user.id); created.phones.push(ph);
  return { uid: data.user.id, phone: ph };
}
export function anonClient() { return createClient(URL, ANON, { auth: { persistSession: false } }); }
export async function login(ph, membershipId) {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email: email(ph), password: PW });
  if (error) throw new Error('signIn ' + ph + ': ' + error.message);
  if (membershipId) { const r = await c.rpc('set_active_membership', { m: membershipId }); if (r.error) throw new Error('set_active ' + r.error.message); }
  return c;
}
export async function jwt(c) { return (await c.auth.getSession()).data.session?.access_token; }
export async function member(uid, A, role, studentId = null) {
  const { data, error } = await admin.from('memberships').insert({ user_id: uid, academy_id: A, role, student_id: studentId }).select().single();
  if (error) throw new Error('membership ' + error.message);
  if (role === 'parent' && studentId) await admin.from('guardians').upsert({ student_id: studentId, user_id: uid }, { onConflict: 'student_id,user_id', ignoreDuplicates: true });
  return data.id;
}
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** 진짜 P-256 공개키 모양의 푸시 구독. 끝점은 .invalid — 발송기가 붙어도 실패만 하고 비용은 없다. */
export async function pushSub(uid) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
  const { error } = await admin.from('push_subscriptions').insert({ user_id: uid, endpoint: `https://push.example.invalid/rt-b4/${rnd()}${rnd()}`, p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))), ua: 'rt-b4' });
  if (error) throw new Error('pushSub ' + error.message);
}

/** 학원 하나: 반 c1(강사 담당)·c2, 학생 s1(c1)·s2(c2), 원장·강사·학부모1(s1)·학부모2(s2). 학생 로그인은 없다(알림 수를 세기 쉽게). */
export async function seedAcademy(label, extra = {}) {
  const t = rnd();
  const { data: ac, error } = await admin.from('academies').insert({ slug: `rt-b4-${label}-${t}`, name: `RT4 ${label}`, ...extra }).select().single();
  if (error) throw new Error('academy ' + error.message);
  created.academies.push(ac.id);
  const A = ac.id;
  const { data: c1 } = await admin.from('classes').insert({ academy_id: A, name: 'C1', schedule: [{ dow: 1, start: '19:00', end: '21:00' }, { dow: 3, start: '19:00', end: '21:00' }] }).select().single();
  const { data: c2 } = await admin.from('classes').insert({ academy_id: A, name: 'C2', schedule: [{ dow: 2, start: '20:00', end: '22:00' }] }).select().single();
  const { data: s1 } = await admin.from('students').insert({ academy_id: A, name: `${label}S1` }).select().single();
  const { data: s2 } = await admin.from('students').insert({ academy_id: A, name: `${label}S2` }).select().single();
  await admin.from('enrollments').insert([{ student_id: s1.id, class_id: c1.id }, { student_id: s2.id, class_id: c2.id }]);
  const dir = await mkUser(`${label}원장`), tch = await mkUser(`${label}강사`), par1 = await mkUser(`${label}학부모1`), par2 = await mkUser(`${label}학부모2`);
  await admin.from('roster_phones').insert([
    { academy_id: A, phone: dir.phone, role: 'director', name: `${label}원장` },
    { academy_id: A, phone: tch.phone, role: 'teacher', name: `${label}강사` },
    { academy_id: A, phone: par1.phone, role: 'parent', name: `${label}학부모1`, student_id: s1.id },
    { academy_id: A, phone: par2.phone, role: 'parent', name: `${label}학부모2`, student_id: s2.id },
  ]);
  dir.mid = await member(dir.uid, A, 'director');
  tch.mid = await member(tch.uid, A, 'teacher');
  par1.mid = await member(par1.uid, A, 'parent', s1.id);
  par2.mid = await member(par2.uid, A, 'parent', s2.id);
  await admin.from('classes').update({ teacher_id: tch.uid, teacher_phone: tch.phone }).eq('id', c1.id);
  await pushSub(par1.uid); await pushSub(par2.uid); await pushSub(dir.uid);
  return { ac, A, c1, c2, s1, s2, dir, tch, par1, par2 };
}

export const notisFor = async (A, link) => (await admin.from('notifications').select('id, user_id, kind, title, body').eq('academy_id', A).eq('link', link)).data ?? [];
export const outboxFor = async A => (await admin.from('outbox').select('id, to_user_id, channel, template_code, link_ref, status').eq('academy_id', A)).data ?? [];
/** outbox 를 읽고 곧바로 비운다 — 크론 발송기가 시험 줄을 집어 가지 않게. */
export async function drainOutbox(A) {
  const rows = await outboxFor(A);
  if (rows.length) await admin.from('outbox').delete().eq('academy_id', A);
  return rows;
}

const swallow = async p => { try { await p; } catch { /* ignore */ } };
export async function cleanup() {
  for (const p of created.storage) await swallow(admin.storage.from(p.bucket).remove([p.path]));
  for (const h of created.linkHashes) await swallow(admin.from('link_tokens').delete().eq('token_hash', h));
  for (const aid of created.academies) {
    await swallow(admin.from('outbox').delete().eq('academy_id', aid));
    await swallow(admin.from('link_tokens').delete().eq('academy_id', aid));
    const { error } = await admin.from('academies').delete().eq('id', aid);
    if (error) console.log('  ! academy delete', aid, error.message);
  }
  for (const uid of created.users) {
    await swallow(admin.from('app_operators').delete().eq('user_id', uid));
    await swallow(admin.from('consents').delete().eq('user_id', uid));
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    await swallow(admin.from('users').delete().eq('id', uid));
  }
  for (const ph of created.phones) await swallow(admin.from('otp_codes').delete().eq('phone', ph));
  console.log(`\n정리: 학원 ${created.academies.length} · 사용자 ${created.users.length} · 저장소 ${created.storage.length}`);
}
