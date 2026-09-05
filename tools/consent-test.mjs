// 약관·개인정보 동의 (0026): accept_terms · my_consent · consents RLS.
// anon 은 accept_terms 를 못 부른다 / 사용자가 동의하면 my_consent 가 판을 돌려준다 / 다시 동의하면 upsert / 남의 행은 못 읽는다.
// node --env-file=../.env.local consent-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'consent-' + rnd;

const P_A = '0109' + num() + '7', P_B = '0109' + num() + '8';
const madeUsers = []; const madeAcademies = [];
try {
  // ---- 준비: 학원 하나, 학부모 둘(A·B). 동의 표는 소속과 무관하지만 로그인 흐름을 그대로 따른다.
  const { data: ac } = await admin.from('academies').insert({ slug: `consent-${rnd}`, name: 'consent-테스트' }).select().single();
  madeAcademies.push(ac.id);
  const { data: st } = await admin.from('students').insert({ academy_id: ac.id, name: 'consent-학생' }).select().single();
  await admin.from('roster_phones').insert([
    { academy_id: ac.id, phone: P_A, role: 'parent', name: 'consent-학부모A', student_id: st.id },
    { academy_id: ac.id, phone: P_B, role: 'parent', name: 'consent-학부모B', student_id: st.id },
  ]);

  async function login(phone, name) {
    const { data: au, error } = await admin.auth.admin.createUser({ email: `${phone}@auth.yeongeo.local`, password: PW, email_confirm: true });
    if (error) throw error;
    madeUsers.push(au.user.id);
    await admin.from('users').insert({ id: au.user.id, name, phone });
    const { data: m } = await admin.from('memberships').insert({ user_id: au.user.id, academy_id: ac.id, role: 'parent', student_id: st.id }).select().single();
    await admin.from('users').update({ active_membership_id: m.id }).eq('id', au.user.id);
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error: e2 } = await c.auth.signInWithPassword({ email: `${phone}@auth.yeongeo.local`, password: PW });
    if (e2) throw e2;
    await c.rpc('set_active_membership', { m: m.id });
    return { c, id: au.user.id };
  }
  const A = await login(P_A, 'consent-학부모A');
  const B = await login(P_B, 'consent-학부모B');

  // ---- A. anon 은 못 부른다 (execute 를 revoke 했으니 함수 안 검사가 아니라 권한 거절이어야 한다)
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: a1 } = await anon.rpc('accept_terms', { p_terms: '2026-09-05', p_privacy: '2026-09-05' });
  ok(!!a1 && /permission denied|42501/i.test(a1.message + ' ' + (a1.code ?? '')), `anon 은 accept_terms 권한 거절 (got ${a1?.code} ${a1?.message})`);
  const { error: a2 } = await anon.rpc('my_consent');
  ok(!!a2, `anon 은 my_consent 도 못 부른다 (got ${a2?.message ?? 'no error'})`);
  const { data: a3 } = await anon.from('consents').select('*');
  ok(!a3 || a3.length === 0, `anon 은 consents 표를 못 본다 (got ${JSON.stringify(a3)})`);

  // ---- B. 동의 전에는 비어 있다
  const { data: b0, error: b0e } = await A.c.rpc('my_consent');
  ok(!b0e && Array.isArray(b0) && b0.length === 0, `동의 전 my_consent 는 빈 배열 (got ${b0e?.message ?? JSON.stringify(b0)})`);

  // ---- C. 판 모양이 틀리면 거절
  const { error: c1 } = await A.c.rpc('accept_terms', { p_terms: 'v1', p_privacy: '2026-09-05' });
  ok(!!c1 && /bad_version/.test(c1.message), `판 모양이 틀리면 bad_version (got ${c1?.message})`);
  const { error: c2 } = await A.c.rpc('accept_terms', { p_terms: '2026-09-05', p_privacy: null });
  ok(!!c2 && /bad_version/.test(c2.message), `null 판도 bad_version (got ${c2?.message})`);

  // ---- D. 동의하면 my_consent 가 판을 돌려준다
  const { error: d0 } = await A.c.rpc('accept_terms', { p_terms: '2026-09-05', p_privacy: '2026-09-05' });
  ok(!d0, `동의 성공 (got ${d0?.message})`);
  const { data: d1 } = await A.c.rpc('my_consent');
  ok(d1?.length === 1 && d1[0].terms_version === '2026-09-05' && d1[0].privacy_version === '2026-09-05' && !!d1[0].agreed_at, `my_consent 가 판·시각을 돌려준다 (got ${JSON.stringify(d1)})`);
  const { data: d2 } = await A.c.from('consents').select('*');
  ok(d2?.length === 1 && d2[0].user_id === A.id, `RLS 로 자기 행 하나만 보인다 (got ${JSON.stringify(d2)})`);
  const firstAt = d1?.[0]?.agreed_at;

  // ---- E. 다시 동의하면 upsert — 행은 하나, 판·시각이 바뀐다
  await new Promise(r => setTimeout(r, 1100));
  const { error: e0 } = await A.c.rpc('accept_terms', { p_terms: '2026-12-01', p_privacy: '2026-12-01' });
  ok(!e0, `재동의 성공 (got ${e0?.message})`);
  const { data: e1 } = await admin.from('consents').select('*').eq('user_id', A.id);
  ok(e1?.length === 1 && e1[0].terms_version === '2026-12-01' && e1[0].privacy_version === '2026-12-01', `행은 하나, 새 판으로 바뀐다 (got ${JSON.stringify(e1)})`);
  ok(!!firstAt && new Date(e1?.[0]?.agreed_at) > new Date(firstAt), `agreed_at 이 새로 찍힌다 (got ${firstAt} → ${e1?.[0]?.agreed_at})`);

  // ---- F. 남의 행은 못 읽는다 — B 는 아직 동의하지 않았으니 B 눈에는 아무것도 없어야 한다
  const { data: f1 } = await B.c.rpc('my_consent');
  ok(Array.isArray(f1) && f1.length === 0, `B 의 my_consent 는 비어 있다 (got ${JSON.stringify(f1)})`);
  const { data: f2 } = await B.c.from('consents').select('*');
  ok(!f2 || f2.length === 0, `B 는 consents 표에서 A 행을 못 본다 (got ${JSON.stringify(f2)})`);
  const { data: f3 } = await B.c.from('consents').select('*').eq('user_id', A.id);
  ok(!f3 || f3.length === 0, `user_id 로 찍어도 안 보인다 (got ${JSON.stringify(f3)})`);
  // 표에 직접 쓰는 길은 없다 (insert/update 정책 없음)
  const { error: f4 } = await B.c.from('consents').insert({ user_id: B.id, terms_version: '2026-09-05', privacy_version: '2026-09-05' });
  ok(!!f4, `표에 직접 insert 는 거절 (got ${f4?.message ?? 'no error'})`);
  const { error: f5 } = await B.c.from('consents').update({ terms_version: '1999-01-01' }).eq('user_id', A.id);
  const { data: f6 } = await admin.from('consents').select('terms_version').eq('user_id', A.id).single();
  ok(f6?.terms_version === '2026-12-01', `남의 행 update 는 아무 효과가 없다 (error=${f5?.message ?? 'none'}, terms=${f6?.terms_version})`);

  // ---- G. 사용자를 지우면 행도 같이 간다 (cascade)
  await admin.auth.admin.deleteUser(A.id);
  madeUsers.splice(madeUsers.indexOf(A.id), 1);
  const { data: g1 } = await admin.from('consents').select('*').eq('user_id', A.id);
  ok(!g1 || g1.length === 0, `사용자 삭제 → consents 행도 삭제 (got ${JSON.stringify(g1)})`);
} finally {
  // ---- 정리: 학원(cascade) 먼저, 그다음 이 테스트가 만든 auth 사용자만
  const { data: leftovers } = await admin.from('users').select('id').in('phone', [P_A, P_B]);
  for (const a of madeAcademies) { const { error } = await admin.from('academies').delete().eq('id', a); if (error) fails.push('학원 정리 실패: ' + error.message); }
  for (const u of [...new Set([...madeUsers, ...(leftovers ?? []).map(x => x.id)])]) { const { error } = await admin.auth.admin.deleteUser(u); if (error) fails.push('사용자 정리 실패: ' + error.message); }
}

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; }
else console.log('PASS: consent A~G');
