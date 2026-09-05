// 4차 레드팀 4·7·8 — 동의(0026) · 잠금 세 경로(T1) · 워드마크 칸(0025)
// cd tools && node --env-file=../.env.local redteam/rt-batch4-locks-consent-wordmark.mjs
// otp-send 는 403 이 예상되는 번호에만 부른다(200 이면 실제 문자). 로그인은 otp_codes 를 직접 심어 otp-verify 로.
import { admin, URL, seedAcademy, mkUser, member, login, jwt, anonClient, check, pass, finding, note, report, cleanup, created, sha256, hex32, fn, phone, err } from './b4-lib.mjs';

const L = await seedAcademy('lock');
const U = await seedAcademy('open');
const O = await seedAcademy('wm2');       // 워드마크 대조용 다른 학원
try {
  // ---- 운영자(시험용) ----
  const op = await mkUser('rt-b4 운영자');
  { const { error } = await admin.from('app_operators').insert({ user_id: op.uid }); if (error) throw new Error('app_operators ' + error.message); }
  const o = await login(op.phone);
  check((await o.rpc('is_operator')).data === true, '시험용 운영자 등록', 'B4-L0', '낮음');

  // P = L 의 학부모1, U 에도 자녀(U.s1) 학부모로 명부·소속이 있다
  const P = L.par1;
  await admin.from('roster_phones').insert({ academy_id: U.A, phone: P.phone, role: 'parent', name: 'P(U)', student_id: U.s1.id });
  P.midU = await member(P.uid, U.A, 'parent', U.s1.id);
  // 잠그기 전에 원장·강사·학부모 세션을 열어 둔다 (0030 부터는 잠긴 뒤 set_active_membership 이 academy_locked 라 미리 열어야 한다)
  const dL = await login(L.dir.phone, L.dir.mid);
  const tL = await login(L.tch.phone, L.tch.mid);
  const pOnlyL = await login(L.par2.phone, L.par2.mid);

  console.log('\n[7] 잠금');
  let r = await o.rpc('op_set_lock', { p_academy: L.A, p_locked: true });
  check(!r.error && r.data === true, 'op_set_lock(true)', 'B4-L0', '높음', err(r));
  const plantOtp = async ph => { const code = String(Math.floor(100000 + Math.random() * 900000)); await admin.from('otp_codes').insert({ phone: ph, code_hash: sha256(code + ph), expires_at: new Date(Date.now() + 5 * 60e3).toISOString() }); return code; };
  const plantLink = async (A, uid) => { const tok = hex32(); const h = sha256(tok); created.linkHashes.push(h); await admin.from('link_tokens').insert({ academy_id: A, user_id: uid, view: 'child', ref_id: null, token_hash: h, expires_at: new Date(Date.now() + 10 * 60e3).toISOString() }); return tok; };
  const plantInvite = async (A, ph, role) => { const tok = hex32(); await admin.from('invite_tokens').insert({ academy_id: A, phone: ph, role, token_hash: sha256(tok), expires_at: new Date(Date.now() + 86400e3).toISOString() }); return tok; };
  const codeOf = async res => { try { return (await res.json()); } catch { return {}; } };

  // otp-send (403 이어야 하고, 문자가 안 나간다 = otp_codes 행이 안 생긴다)
  for (const [who, ph] of [['잠긴 학원 원장', L.dir.phone], ['잠긴 학원만의 학부모', L.par2.phone]]) {
    const before = ((await admin.from('otp_codes').select('id').eq('phone', ph)).data ?? []).length;
    const res = await fn('otp-send', null, { phone: ph });
    const j = await codeOf(res);
    check(res.status === 403 && j.error === 'academy_locked', `${who}: otp-send 403 academy_locked`, 'B4-L1', '높음', `${who}: otp-send ${res.status} ${JSON.stringify(j)}`);
    check(((await admin.from('otp_codes').select('id').eq('phone', ph)).data ?? []).length === before, `${who}: otp_codes 행 안 생김(문자 안 나감)`, 'B4-L1', '높음', `${who}: otp_codes 가 늘었다`);
  }
  // otp-verify
  {
    let res = await fn('otp-verify', null, { phone: L.dir.phone, code: await plantOtp(L.dir.phone) });
    let j = await codeOf(res);
    check(res.status === 403 && j.error === 'academy_locked', '잠긴 학원 원장: otp-verify 403', 'B4-L2', '높음', `otp-verify ${res.status} ${JSON.stringify(j).slice(0, 120)}`);
    res = await fn('otp-verify', null, { phone: P.phone, code: await plantOtp(P.phone) });
    j = await codeOf(res);
    const acs = (j.memberships ?? []).map(m => m.academy_id);
    check(res.status === 200 && acs.includes(U.A) && !acs.includes(L.A), `두 학원 학부모 P: otp-verify 200, memberships 는 열린 학원(U)만 (${acs.length}개)`, 'B4-L3', '높음', `P otp-verify ${res.status} memberships=${JSON.stringify(acs)}`);
    if (j.session?.access_token) {
      // 그 세션으로 잠긴 학원 L 소속으로 갈아탈 수 있나
      const c = anonClient(); await c.auth.setSession({ access_token: j.session.access_token, refresh_token: j.session.refresh_token });
      // 0030 B4-L4: set_active_membership(잠긴 학원 소속) → academy_locked, 잠긴 학원 데이터 0
      const sw = await c.rpc('set_active_membership', { m: P.mid });
      const kids = (await c.from('students').select('id, name').eq('academy_id', L.A)).data ?? [];
      check(/academy_locked/.test(err(sw)) && kids.length === 0, 'P: 잠긴 학원 소속으로 갈아타기 → academy_locked, 잠긴 학원 학생 0', 'B4-L4', '중간',
        `두 학원 학부모 P 가 새 세션으로 set_active_membership(잠긴 학원 L 의 소속) → ${err(sw) || '통과'}, 잠긴 학원 학생 ${kids.length}명 조회`);
      // 활성 소속이 잠긴 학원을 가리켜도(서비스 키로 심음) current_membership() 이 null → RLS 전부 닫힘
      await admin.from('users').update({ active_membership_id: P.mid }).eq('id', P.uid);
      const kids2 = (await c.from('students').select('id').eq('academy_id', L.A)).data ?? [];
      const acs2 = (await c.from('academies').select('id')).data ?? [];
      check(kids2.length === 0 && acs2.length === 0, 'P: 활성 소속이 잠긴 학원이어도 students·academies 0행 (current_membership null)', 'B4-L4', '중간', `잠긴 학원 활성 소속으로 students ${kids2.length}·academies ${acs2.length}행`);
      const swU = await c.rpc('set_active_membership', { m: P.midU });
      check(!swU.error && ((await c.from('students').select('id').eq('academy_id', U.A)).data ?? []).length === 1, 'P: 열린 학원 U 소속으로는 갈아탄다(대조)', 'B4-L4', '낮음', err(swU));
      await c.auth.signOut().catch(() => {});
    }
  }
  // link-login
  {
    const tokL = await plantLink(L.A, L.par2.uid);
    let res = await fn('link-login', null, { token: tokL }); let j = await codeOf(res);
    check(res.status === 403 && j.error === 'academy_locked', '잠긴 학원 링크: link-login 403', 'B4-L5', '높음', `link-login ${res.status} ${JSON.stringify(j).slice(0, 100)}`);
    res = await fn('link-login', null, { token: tokL, resolve: true }); j = await codeOf(res);
    check(res.status === 403, '잠긴 학원 링크: link-login(resolve) 403', 'B4-L5', '높음', `resolve ${res.status}`);
    // P 의 열린 학원(U) 링크 → 200. memberships 에 잠긴 학원 L 이 끼어 오나
    const tokU = await plantLink(U.A, P.uid);
    res = await fn('link-login', null, { token: tokU }); j = await codeOf(res);
    const acs = (j.memberships ?? []).map(m => m.academy_id);
    check(res.status === 200 && acs.includes(U.A), `P 의 열린 학원 링크: link-login 200 (memberships ${acs.length}개)`, 'B4-L6', '높음', `link-login ${res.status} ${JSON.stringify(j).slice(0, 120)}`);
    // 0030 B4-L7: link-login 도 _shared/auth.ts listMemberships 를 쓴다 (Edge 재배포 뒤에만 PASS)
    check(!acs.includes(L.A), 'link-login memberships 에 잠긴 학원 없음', 'B4-L7', '중간', `link-login 응답 memberships 에 잠긴 학원 L 의 소속이 그대로 온다 (link-login 재배포 전이면 예상된 결과)`);
  }
  // invite-login
  {
    const newPh = phone(); created.phones.push(newPh);
    await admin.from('roster_phones').insert({ academy_id: L.A, phone: newPh, role: 'parent', name: '새 학부모', student_id: L.s2.id });
    const tok = await plantInvite(L.A, newPh, 'parent');
    const res = await fn('invite-login', null, { token: tok }); const j = await codeOf(res);
    check(res.status === 403 && j.error === 'academy_locked', '잠긴 학원 초대: invite-login 403', 'B4-L8', '높음', `invite-login ${res.status} ${JSON.stringify(j).slice(0, 100)}`);
    check(!(await admin.from('users').select('id').eq('phone', newPh).maybeSingle()).data, '거절된 초대로 users 행이 안 생긴다', 'B4-L8', '중간');
    const tokU = await plantInvite(U.A, P.phone, 'parent');
    const res2 = await fn('invite-login', null, { token: tokU }); const j2 = await codeOf(res2);
    const acs = (j2.memberships ?? []).map(m => m.academy_id);
    check(res2.status === 200 && acs.includes(U.A) && !acs.includes(L.A), `P 의 열린 학원 초대: invite-login 200 · memberships 는 U 만`, 'B4-L8', '높음', `invite-login ${res2.status} ${JSON.stringify(acs)}`);
  }
  // 잠기기 전에 열어 둔 세션들 — 0030 B4-L4: op_set_lock 이 활성 소속을 풀고 current_membership() 도 잠긴 소속을 null 로 → 즉시 0행
  {
    const kids = (await dL.from('students').select('id').eq('academy_id', L.A)).data ?? [];
    check(kids.length === 0, '잠기기 전 원장 세션: 잠긴 뒤 학생 0명 (활성 소속 해제 · current_membership null)', 'B4-L4', '중간', `잠기기 전 원장 세션이 잠긴 뒤에도 학생 ${kids.length}명 조회`);
    const k2 = (await pOnlyL.from('students').select('id').eq('academy_id', L.A)).data ?? [];
    check(k2.length === 0, '잠기기 전 학부모 세션: 잠긴 뒤 자녀 0명', 'B4-L4', '중간', `잠기기 전 학부모 세션이 잠긴 뒤에도 자녀 ${k2.length}명 조회`);
    const am = (await admin.from('users').select('active_membership_id').in('id', [L.dir.uid, L.par2.uid, L.tch.uid])).data ?? [];
    check(am.length === 3 && am.every(u => u.active_membership_id === null), 'op_set_lock(true): 잠긴 학원 사람들의 active_membership_id 전부 null', 'B4-L4', '중간', JSON.stringify(am));
    // 원장이 자기 손으로 잠금을 푼다? (0030 B4-L9 — 소속이 null 이라 0행이거나, 행이 잡혀도 trg_academies_guard 가 not allowed)
    const un = await dL.from('academies').update({ locked: false }).eq('id', L.A).select('locked');
    const now = (await admin.from('academies').select('locked').eq('id', L.A).single()).data?.locked;
    check((!!un.error || (un.data ?? []).length === 0) && now === true, `원장: locked=false 직접 갱신 거절, 여전히 잠김 (${err(un) || '0행'})`, 'B4-L9', '높음',
      `잠긴 학원의 원장이 남은 세션으로 PostgREST update academies set locked=false → 통과 (locked=${now})`);
    if (now === false) await o.rpc('op_set_lock', { p_academy: L.A, p_locked: true });
    // 강사·학부모는 못 푼다
    const un2 = await tL.from('academies').update({ locked: false }).eq('id', L.A).select();
    check(!!un2.error || (un2.data ?? []).length === 0, '강사: locked 갱신 거절', 'B4-L9', '높음', '강사가 잠금을 풀었다');
    const un3 = await pOnlyL.from('academies').update({ locked: false }).eq('id', L.A).select();
    check(!!un3.error || (un3.data ?? []).length === 0, '학부모: locked 갱신 거절', 'B4-L9', '높음', '학부모가 잠금을 풀었다');
    const dU0 = await login(U.dir.phone, U.dir.mid);
    const un4 = await dU0.from('academies').update({ locked: false }).eq('id', L.A).select();
    check(!!un4.error || (un4.data ?? []).length === 0, '다른 학원 원장: locked 갱신 거절', 'B4-L9', '높음', '다른 학원 원장이 잠금을 풀었다');
    // 열린 학원의 원장이 자기 학원 운영 칸을 만지면 트리거가 잡는다 (행은 잡히므로 0행이 아니라 not allowed 여야 한다)
    for (const [what, patch] of [['locked', { locked: true }], ['slug', { slug: 'rt-b4-hijack-' + Date.now() }], ['weekly_last_at', { weekly_last_at: new Date().toISOString() }], ['created_at', { created_at: '2000-01-01T00:00:00Z' }]]) {
      const x = await dU0.from('academies').update(patch).eq('id', U.A).select('id');
      if (!x.error && x.data?.length && what === 'locked') await admin.from('academies').update({ locked: false }).eq('id', U.A);
      check(/not allowed/.test(err(x)), `열린 학원 원장: 자기 academies.${what} 갱신 → not allowed (trg_academies_guard)`, 'B4-L9', '높음', `원장이 자기 학원 academies.${what} 를 바꿨다 → ${err(x) || JSON.stringify(x.data)}`);
    }
    const okc = await dU0.from('academies').update({ brand_color: '#654321' }).eq('id', U.A).select('brand_color');
    check(!okc.error && okc.data?.[0]?.brand_color === '#654321', '열린 학원 원장: brand_color 갱신 통과(대조)', 'B4-L9', '낮음', err(okc));
    // 학부모가 op_set_lock 을 부르면
    const un5 = await pOnlyL.rpc('op_set_lock', { p_academy: L.A, p_locked: false });
    check(/not_operator/.test(err(un5)), '학부모: op_set_lock → not_operator', 'B4-L9', '높음', err(un5) || '통과!');
  }
  await o.rpc('op_set_lock', { p_academy: L.A, p_locked: false });

  console.log('\n[4] 동의');
  {
    const a = await login(U.par1.phone, U.par1.mid), b = await login(U.par2.phone, U.par2.mid), anon = anonClient();
    // 동의 없이 데이터 RPC/표를 그대로 쓴다 (UX 게이트 — 허용 범위)
    const kids = (await a.from('students').select('id').eq('academy_id', U.A)).data ?? [];
    const mc = (await a.rpc('my_consent')).data ?? [];
    note(`동의 기록 ${mc.length}건인 학부모가 students ${kids.length}건·my_invoice 등 데이터 RPC 를 그대로 쓴다 → UX 게이트(문서화된 허용 범위)`);
    let r = await a.rpc('accept_terms', { p_terms: '2026-09-05', p_privacy: '2026-09-05' });
    check(!r.error, 'accept_terms 정상', 'B4-C1', '낮음', err(r));
    for (const [t, p] of [['', ''], [null, null], ['x', 'y'], ['2026-9-5', '2026-09-05'], ["2026-09-05'; drop table consents; --", '2026-09-05'], ['20260905', '20260905']]) {
      const x = await a.rpc('accept_terms', { p_terms: t, p_privacy: p });
      check(/bad_version/.test(err(x)), `accept_terms(${JSON.stringify(t)}, ${JSON.stringify(p)}) → bad_version`, 'B4-C1', '낮음', `통과? ${err(x) || 'OK'}`);
    }
    const odd = await a.rpc('accept_terms', { p_terms: '2026-13-45', p_privacy: '9999-99-99' });
    if (!odd.error) { note('accept_terms(2026-13-45, 9999-99-99) 통과 — 판 번호는 모양만 본다(YYYY-MM-DD 정규식). 앱이 상수로 넘기므로 해악 없음'); await a.rpc('accept_terms', { p_terms: '2026-09-05', p_privacy: '2026-09-05' }); }
    r = await anon.rpc('accept_terms', { p_terms: '2026-09-05', p_privacy: '2026-09-05' });
    check(!!r.error, 'anon: accept_terms 거절', 'B4-C2', '중간', 'anon 이 동의 행을 만들었다');
    r = await anon.rpc('my_consent');
    check(!!r.error || (r.data ?? []).length === 0, 'anon: my_consent 거절/빈결과', 'B4-C2', '낮음');
    r = await anon.from('consents').select('*');
    check((r.data ?? []).length === 0, 'anon: consents select 빈결과', 'B4-C2', '중간', `anon 이 consents ${r.data.length}행`);
    r = await b.from('consents').select('*');
    check((r.data ?? []).length === 0, '남(B): consents select 에 A 행 안 보임', 'B4-C2', '중간', `B 가 ${r.data.length}행 봄`);
    r = await b.from('consents').select('*').eq('user_id', U.par1.uid);
    check((r.data ?? []).length === 0, '남(B): user_id 지정해도 빈결과', 'B4-C2', '중간');
    r = await a.from('consents').select('terms_version').eq('user_id', U.par1.uid);
    check((r.data ?? []).length === 1, '본인(A): 자기 행 보임(대조)', 'B4-C9', '낮음');
    r = await a.from('consents').update({ terms_version: '1999-01-01' }).eq('user_id', U.par1.uid).select();
    check(!!r.error || (r.data ?? []).length === 0, '본인: consents update 거절(쓰기 정책 없음)', 'B4-C3', '낮음', '본인이 동의 판을 직접 고쳤다');
    r = await a.from('consents').delete().eq('user_id', U.par1.uid).select();
    check(!!r.error || (r.data ?? []).length === 0, '본인: consents delete 거절', 'B4-C3', '낮음', '본인이 동의 행을 지웠다');
    r = await b.from('consents').insert({ user_id: U.par1.uid, terms_version: '1', privacy_version: '1' }).select();
    check(!!r.error || (r.data ?? []).length === 0, '남(B): A 이름으로 consents insert 거절', 'B4-C3', '중간', 'B 가 A 의 동의 행을 넣었다');
    const row = (await admin.from('consents').select('terms_version').eq('user_id', U.par1.uid).single()).data;
    check(row?.terms_version === '2026-09-05', '위 시도 뒤에도 A 의 동의 행은 그대로', 'B4-C3', '낮음', JSON.stringify(row));
  }

  console.log('\n[8] 워드마크 칸 (0025)');
  {
    const dU = await login(U.dir.phone, U.dir.mid), tU = await login(U.tch.phone, U.tch.mid), pU = await login(U.par1.phone, U.par1.mid);
    const anon = anonClient();
    const pub = p => anon.storage.from('logos').getPublicUrl(p).data.publicUrl;
    // 0030 B4-M1: trg_academies_guard — 로고 경로 셋은 null 이거나 `<자기 id>/(logo|wordmark|wordmark-dark).png` 만 (bad_path)
    for (const [what, val] of [['다른 학원 경로', `${O.A}/wordmark.png`], ['외부 URL', 'https://evil.example/x.png'], ['경로 이탈', '../../object/public/logos/x.png'], ['javascript:', 'javascript:alert(1)'], ['따옴표·태그', `"><img src=x onerror=alert(1)>`], ['다른 파일 이름', `${U.A}/evil.png`], ['하위 폴더', `${U.A}/x/wordmark.png`]]) {
      const r = await dU.from('academies').update({ wordmark_path: val }).eq('id', U.A).select('wordmark_path');
      check(/bad_path/.test(err(r)), `원장: wordmark_path ${what} → bad_path`, 'B4-M1', '낮음', `원장: wordmark_path=${JSON.stringify(val)} 저장됨 (${what}) → 클라이언트 logoUrl → ${pub(val)}`);
    }
    for (const [col, val] of [['logo_path', `${O.A}/logo.png`], ['wordmark_dark_path', 'https://evil.example/d.png']]) {
      const r = await dU.from('academies').update({ [col]: val }).eq('id', U.A).select(col);
      check(/bad_path/.test(err(r)), `원장: ${col} 다른 학원/외부 → bad_path`, 'B4-M1', '낮음', `원장: ${col}=${JSON.stringify(val)} 저장됨`);
    }
    const saved = (await admin.from('academies').select('logo_path, wordmark_path, wordmark_dark_path').eq('id', U.A).single()).data;
    check(saved && saved.logo_path === null && saved.wordmark_path === null && saved.wordmark_dark_path === null, '위 시도 뒤 로고 경로 셋은 그대로 null', 'B4-M1', '낮음', JSON.stringify(saved));
    for (const [col, val] of [['logo_path', `${U.A}/logo.png`], ['wordmark_path', `${U.A}/wordmark.png`], ['wordmark_dark_path', `${U.A}/wordmark-dark.png`]]) {
      const r = await dU.from('academies').update({ [col]: val }).eq('id', U.A).select(col);
      check(!r.error && r.data?.[0]?.[col] === val, `원장: ${col}=<자기 id>/… 저장 통과(대조)`, 'B4-M9', '낮음', err(r) || JSON.stringify(r.data));
    }
    { const r = await dU.from('academies').update({ brand_color: '#abcdef' }).eq('id', U.A).select('brand_color');
      check(!r.error && r.data?.[0]?.brand_color === '#abcdef', '원장: 로고 경로가 찬 상태에서 다른 칸(brand_color) 갱신 통과(대조)', 'B4-M9', '낮음', err(r)); }
    await admin.from('academies').update({ logo_path: null, wordmark_path: null, wordmark_dark_path: null }).eq('id', U.A);
    // 강사·학부모는 wordmark_path 못 바꾼다
    let r = await tU.from('academies').update({ wordmark_path: 'x' }).eq('id', U.A).select();
    check(!!r.error || (r.data ?? []).length === 0, '강사: wordmark_path 갱신 거절', 'B4-M2', '중간', '강사가 wordmark_path 를 바꿨다');
    r = await pU.from('academies').update({ wordmark_path: 'x' }).eq('id', U.A).select();
    check(!!r.error || (r.data ?? []).length === 0, '학부모: wordmark_path 갱신 거절', 'B4-M2', '중간', '학부모가 wordmark_path 를 바꿨다');
    r = await dU.from('academies').update({ wordmark_path: 'x' }).eq('id', O.A).select();
    check(!!r.error || (r.data ?? []).length === 0, '원장: 다른 학원 wordmark_path 갱신 거절', 'B4-M2', '높음', '원장이 다른 학원 wordmark_path 를 바꿨다');
    // 저장소: 다른 학원 폴더에 올리기
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    let up = await dU.storage.from('logos').upload(`${O.A}/wordmark.png`, png, { contentType: 'image/png', upsert: true });
    if (!up.error) created.storage.push({ bucket: 'logos', path: `${O.A}/wordmark.png` });
    check(!!up.error, `원장: logos/<다른 학원>/wordmark.png 올리기 거절 (${(up.error?.message ?? '').slice(0, 40)})`, 'B4-M3', '높음', '원장이 다른 학원 폴더에 워드마크를 올렸다');
    up = await dU.storage.from('logos').upload(`${U.A}/wordmark.png`, png, { contentType: 'image/png', upsert: true });
    if (!up.error) created.storage.push({ bucket: 'logos', path: `${U.A}/wordmark.png` });
    check(!up.error, '원장: 자기 학원 워드마크 올리기 통과(대조)', 'B4-M9', '낮음', err(up));
    up = await tU.storage.from('logos').upload(`${U.A}/wordmark-dark.png`, png, { contentType: 'image/png', upsert: true });
    if (!up.error) created.storage.push({ bucket: 'logos', path: `${U.A}/wordmark-dark.png` });
    check(!!up.error, '강사: 자기 학원 logos 올리기 거절(원장 전용)', 'B4-M3', '중간', '강사가 로고를 올렸다');
    up = await dU.storage.from('logos').remove([`${O.A}/logo.png`]);
    check(!!up.error || (up.data ?? []).length === 0, '원장: 다른 학원 로고 지우기 거절/0건', 'B4-M3', '높음', '원장이 다른 학원 로고를 지웠다');
    // 공개 함수는 워드마크를 안 준다
    const slug = (await admin.from('academies').select('slug').eq('id', U.A).single()).data.slug;
    const pa = await anon.rpc('public_academy', { p_slug: slug });
    check(pa.data?.length === 1 && !('wordmark_path' in pa.data[0]), `public_academy 열: ${Object.keys(pa.data?.[0] ?? {}).join(',')}`, 'B4-M9', '낮음');
  }
} finally {
  await cleanup();
}
report('rt-batch4-locks-consent-wordmark');
