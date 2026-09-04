// 개인 초대 링크: create_invite RPC(원장만·명부만) + Edge invite-login(정식 세션·10분 재사용·만료·used).
// A~B 절(RPC)은 DB 만 있으면 돈다. C 절은 invite-login 배포가 필요하다 — 없으면 NOTE 를 남기고 건너뛴다.
// node --env-file=../.env.local invite-test.mjs
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const notes = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'invite-' + rnd;
const sha = s => createHash('sha256').update(s).digest('hex');

const P_DIR = '0109' + num() + '3', P_PAR = '0109' + num() + '1', P_TEA = '0109' + num() + '4', P_DIR2 = '0109' + num() + '5';
const madeUsers = []; const madeAcademies = [];
try {
  // ---- 준비: 학원 둘. 1번 학원에 학생 하나, 명부에 원장·학부모·강사 번호.
  const { data: ac } = await admin.from('academies').insert({ slug: `inv-${rnd}`, name: '초대 테스트' }).select().single();
  madeAcademies.push(ac.id);
  const { data: ac2 } = await admin.from('academies').insert({ slug: `inv-${rnd}b`, name: '초대 테스트 2' }).select().single();
  madeAcademies.push(ac2.id);
  const { data: st } = await admin.from('students').insert({ academy_id: ac.id, name: '한지민' }).select().single();
  await admin.from('roster_phones').insert([
    { academy_id: ac.id, phone: P_DIR, role: 'director', name: '박원장' },
    { academy_id: ac.id, phone: P_PAR, role: 'parent', name: '한지민 학부모', student_id: st.id },
    { academy_id: ac.id, phone: P_TEA, role: 'teacher', name: '이강사' },
    { academy_id: ac2.id, phone: P_DIR2, role: 'director', name: '다른 원장' },
  ]);

  async function login(phone, name, academy_id, role) {
    const { data: au, error } = await admin.auth.admin.createUser({ email: `${phone}@auth.yeongeo.local`, password: PW, email_confirm: true });
    if (error) throw error;
    madeUsers.push(au.user.id);
    await admin.from('users').insert({ id: au.user.id, name, phone });
    const { data: m } = await admin.from('memberships').insert({ user_id: au.user.id, academy_id, role }).select().single();
    await admin.from('users').update({ active_membership_id: m.id }).eq('id', au.user.id);
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error: e2 } = await c.auth.signInWithPassword({ email: `${phone}@auth.yeongeo.local`, password: PW });
    if (e2) throw e2;
    await c.rpc('set_active_membership', { m: m.id });
    return c;
  }
  const dirC = await login(P_DIR, '박원장', ac.id, 'director');
  const teaC = await login(P_TEA, '이강사', ac.id, 'teacher');
  const dir2C = await login(P_DIR2, '다른 원장', ac2.id, 'director');

  // ---- A. create_invite: 원장만, 그 학원 명부에 있는 번호만
  const { data: tok, error: tokErr } = await dirC.rpc('create_invite', { p_phone: P_PAR });
  ok(!tokErr && /^[0-9a-f]{32}$/.test(tok ?? ''), `원장이 32 hex 토큰을 받는다 (got ${tokErr?.message ?? tok})`);
  const { data: row } = await admin.from('invite_tokens').select('*').eq('token_hash', sha(tok ?? 'x')).maybeSingle();
  ok(!!row, '해시로 저장된다(원문은 저장하지 않는다)');
  ok(row?.phone === P_PAR && row?.role === 'parent' && row?.academy_id === ac.id, `토큰 행 내용 (got ${JSON.stringify(row && { phone: row.phone, role: row.role })})`);
  const days = row ? (new Date(row.expires_at) - Date.now()) / 86400e3 : 0;
  ok(days > 6.9 && days < 7.1, `만료는 7일 (got ${days.toFixed(2)}일)`);
  ok(row?.used_at === null, '아직 안 쓴 상태');

  const { error: e1 } = await dirC.rpc('create_invite', { p_phone: '01000000000' });
  ok(!!e1 && /not in roster/.test(e1.message), `명부에 없는 번호는 거절 (got ${e1?.message})`);
  const { error: e2 } = await teaC.rpc('create_invite', { p_phone: P_PAR });
  ok(!!e2 && /not allowed/.test(e2.message), `강사는 초대를 못 만든다 (got ${e2?.message})`);
  const { error: e3 } = await dir2C.rpc('create_invite', { p_phone: P_PAR });
  ok(!!e3 && /not in roster/.test(e3.message), `다른 학원 원장은 못 만든다 (got ${e3?.message})`);

  // ---- B. 새로 만들면 앞의 미사용 토큰은 만료된다
  const { data: tok2 } = await dirC.rpc('create_invite', { p_phone: P_PAR });
  const { data: old } = await admin.from('invite_tokens').select('expires_at').eq('token_hash', sha(tok)).single();
  // DB 시계와 이 컴퓨터 시계가 몇 초 어긋날 수 있어 1분 여유를 둔다 (7일 → 즉시 만료 인지가 요점)
  ok(new Date(old.expires_at) - Date.now() < 60e3, `앞 토큰은 만료 처리 (got ${old.expires_at})`);
  ok(tok2 !== tok && /^[0-9a-f]{32}$/.test(tok2 ?? ''), '새 토큰은 다른 값');

  // ---- C. invite-login (배포 필요)
  const call = body => fetch(`${URL}/functions/v1/invite-login`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }, body: JSON.stringify(body) });
  const probe = await call({ token: '0'.repeat(32) });
  const pj = await probe.json().catch(() => ({}));
  if (!(probe.status === 401 && pj.error === 'bad_token')) {
    notes.push(`C 절(invite-login) 건너뜀 — 아직 배포되지 않았습니다 (probe ${probe.status} ${JSON.stringify(pj).slice(0, 120)}). \`npx supabase functions deploy invite-login --no-verify-jwt\` 뒤 다시 실행하세요.`);
  } else {
    ok(true, '없는 토큰은 401 bad_token');
    const r1 = await call({ token: tok2, academy: `inv-${rnd}` });
    const j1 = await r1.json();
    ok(r1.status === 200 && j1.session?.access_token && j1.session?.refresh_token, `초대 로그인 200 + 세션 (got ${r1.status} ${JSON.stringify(j1).slice(0, 140)})`);
    ok(j1.academy_id === ac.id && Array.isArray(j1.memberships) && j1.memberships.length === 1 && j1.memberships[0].role === 'parent', `소속 하나(학부모) (got ${JSON.stringify(j1.memberships)})`);
    if (j1.user_id) madeUsers.push(j1.user_id);
    const { data: newUser } = await admin.from('users').select('name, phone').eq('phone', P_PAR).maybeSingle();
    ok(newUser?.name === '한지민 학부모', `명부 이름으로 users 행이 생긴다 (got ${newUser?.name})`);

    const invited = createClient(URL, ANON, { auth: { persistSession: false } });
    await invited.auth.setSession(j1.session);
    const { data: me } = await invited.auth.getUser();
    ok(me.user?.id === j1.user_id, '세션 주인이 초대받은 사람');
    const { data: kids } = await invited.from('students').select('id, name');
    ok(kids?.length === 1 && kids[0].id === st.id, `그 세션으로 자기 자녀를 본다(RLS) (got ${JSON.stringify(kids)})`);

    const r2 = await call({ token: tok2 });
    ok(r2.status === 200, `10분 안에는 다시 눌러도 열린다 (got ${r2.status})`);
    const { data: used } = await admin.from('invite_tokens').select('used_at').eq('token_hash', sha(tok2)).single();
    ok(!!used?.used_at, 'used_at 기록');

    await admin.from('invite_tokens').update({ used_at: new Date(Date.now() - 11 * 60e3).toISOString() }).eq('token_hash', sha(tok2));
    const r3 = await call({ token: tok2 });
    ok(r3.status === 401 && (await r3.json()).error === 'used', `11분 뒤에는 401 used (got ${r3.status})`);

    const { data: tok3 } = await dirC.rpc('create_invite', { p_phone: P_PAR });
    await admin.from('invite_tokens').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('token_hash', sha(tok3));
    const r4 = await call({ token: tok3 });
    ok(r4.status === 401 && (await r4.json()).error === 'expired', `만료된 토큰은 401 expired (got ${r4.status})`);

    const r5 = await call({ token: 'nope' });
    ok(r5.status === 401 && (await r5.json()).error === 'bad_token', `모양이 틀린 토큰은 401 bad_token (got ${r5.status})`);
  }
} finally {
  // ---- 정리: 학원(cascade) 먼저, 그다음 이 테스트가 만든 auth 사용자만
  const { data: leftovers } = await admin.from('users').select('id').in('phone', [P_DIR, P_PAR, P_TEA, P_DIR2]);
  for (const a of madeAcademies) { const { error } = await admin.from('academies').delete().eq('id', a); if (error) fails.push('학원 정리 실패: ' + error.message); }
  for (const u of [...new Set([...madeUsers, ...(leftovers ?? []).map(x => x.id)])]) { const { error } = await admin.auth.admin.deleteUser(u); if (error) fails.push('사용자 정리 실패: ' + error.message); }
}

for (const n of notes) console.log('NOTE: ' + n);
if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; }
else console.log(notes.length ? 'PARTIAL PASS: invite A~B (C 절은 위 NOTE 참고 — 배포 뒤 다시 실행)' : 'PASS: invite A~C');
