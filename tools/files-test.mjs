// 8주차 파일 테스트: 공지 사진(비공개 notices)·학원 로고(공개 logos) 버킷의 Storage 정책.
// 같은 학원만 읽고 staff 만 쓴다 / 로고는 원장만 쓴다 / 다른 학원 경로는 서명 URL 도 안 나온다.
// node --env-file=../.env.local files-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'files-' + rnd; const email = p => `${p}@auth.yeongeo.local`;
// 진짜 JPEG/PNG 머리·꼬리 몇 바이트. Blob 의 type 이 그대로 multipart 에 실려 버킷의 allowed_mime_types 를 통과한다.
const jpg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' });

const academies = []; const userIds = []; const madeNotices = []; const madeLogos = [];
async function academy(suffix, name) {
  const { data, error } = await admin.from('academies').insert({ slug: `files-${rnd}-${suffix}`, name }).select().single();
  if (error) throw error; academies.push(data); return data;
}
// 로그인 세션이 정책을 통과하려면 users.active_membership_id 가 반드시 채워져 있어야 한다
// (current_academy_id() 가 그 열을 본다 — 비어 있으면 어떤 업로드도 거절된다).
async function person(A, role, name, phone, student_id = null) {
  const { data: au, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true });
  if (error) throw error;
  userIds.push(au.user.id);
  await admin.from('users').insert({ id: au.user.id, name, phone });
  const { data: m, error: me } = await admin.from('memberships').insert({ user_id: au.user.id, academy_id: A, role, student_id }).select().single();
  if (me) throw me;
  await admin.from('users').update({ active_membership_id: m.id }).eq('id', au.user.id);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: se } = await c.auth.signInWithPassword({ email: email(phone), password: PW });
  ok(!se, `${name} 로그인: ${se?.message}`);
  return c;
}

try {
  // ---- 준비: 학원 둘, 원장 둘, 학원 a 의 학부모 하나
  const acA = await academy('a', '파일 테스트 A'), acB = await academy('b', '파일 테스트 B');
  const A = acA.id, B = acB.id;
  const { data: st, error: ste } = await admin.from('students').insert({ academy_id: A, name: '박지훈' }).select().single();
  if (ste) throw ste;
  const dA = await person(A, 'director', '김지영', '0109' + num() + '3');
  const dB = await person(B, 'director', '이원장', '0109' + num() + '4');
  const pA = await person(A, 'parent', '박지훈 어머님', '0109' + num() + '2', st.id);

  // ---- 1. 공지 사진: 원장 a 가 자기 학원 경로에 올린다
  const noticeId = crypto.randomUUID();
  const photo = `${A}/${noticeId}/1.jpg`;
  let r = await dA.storage.from('notices').upload(photo, jpg(), { contentType: 'image/jpeg' });
  ok(!r.error, `원장 a 공지 사진 업로드: ${r.error?.message}`);
  if (!r.error) madeNotices.push(photo);

  // ---- 2. 학부모는 못 올린다 (같은 학원이어도 staff 아님)
  const badPath = `${A}/${crypto.randomUUID()}/1.jpg`;
  r = await pA.storage.from('notices').upload(badPath, jpg(), { contentType: 'image/jpeg' });
  ok(!!r.error, '학부모 공지 사진 업로드는 거절');
  if (!r.error) madeNotices.push(badPath);

  // ---- 3. 같은 학원 학부모는 서명 URL 을 받는다
  r = await pA.storage.from('notices').createSignedUrl(photo, 3600);
  ok(!r.error && typeof r.data?.signedUrl === 'string', `학부모 서명 URL: ${r.error?.message}`);

  // ---- 4. 다른 학원 원장은 서명 URL 도 내려받기도 못 한다
  r = await dB.storage.from('notices').createSignedUrl(photo, 3600);
  ok(!!r.error || !r.data?.signedUrl, '다른 학원 원장 서명 URL 거절');
  r = await dB.storage.from('notices').download(photo);
  ok(!!r.error || !r.data, '다른 학원 원장 내려받기 거절');

  // ---- 5. 로고: 원장만 올린다
  const logo = `${A}/logo.png`;
  r = await dA.storage.from('logos').upload(logo, png(), { contentType: 'image/png', upsert: true });
  ok(!r.error, `원장 a 로고 업로드: ${r.error?.message}`);
  if (!r.error) madeLogos.push(logo);
  const badLogo = `${A}/logo-${rnd}.png`;
  r = await pA.storage.from('logos').upload(badLogo, png(), { contentType: 'image/png' });
  ok(!!r.error, '학부모 로고 업로드는 거절');
  if (!r.error) madeLogos.push(badLogo);
  r = await dB.storage.from('logos').upload(`${A}/logo-b.png`, png(), { contentType: 'image/png' });
  ok(!!r.error, '다른 학원 원장은 남의 학원 로고를 못 올린다');
  if (!r.error) madeLogos.push(`${A}/logo-b.png`);

  // ---- 6. 문 화면(로그인 전)이 logo_path 까지 받아 온다
  await admin.from('academies').update({ logo_path: logo }).eq('id', A);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  r = await anon.rpc('public_academy', { p_slug: acA.slug });
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  ok(!r.error && !!row && 'logo_path' in row, `public_academy logo_path 열: ${r.error?.message ?? JSON.stringify(row)}`);
  ok(row?.logo_path === logo && row?.name === '파일 테스트 A', `public_academy 값: ${JSON.stringify(row)}`);
} catch (e) {
  fails.push('예외: ' + (e?.message ?? e));
}

// ---- 정리: 학원을 지워도 Storage 파일은 안 지워진다 → 먼저 파일부터 (서비스 키는 정책을 지나친다)
try { if (madeNotices.length) await admin.storage.from('notices').remove(madeNotices); } catch { /* ignore */ }
try { if (madeLogos.length) await admin.storage.from('logos').remove(madeLogos); } catch { /* ignore */ }
for (const u of userIds) { try { await admin.auth.admin.deleteUser(u); } catch { /* ignore */ } }
for (const a of academies) { try { await admin.from('academies').delete().eq('id', a.id); } catch { /* ignore */ } }

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: files');
