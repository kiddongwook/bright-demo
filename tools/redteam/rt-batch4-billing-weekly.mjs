// 4차 레드팀 5·6 — billing_tick (0028) · 주간 요약 (0029)
// cd tools && node --env-file=../.env.local redteam/rt-batch4-billing-weekly.mjs
import { admin, seedAcademy, mkUser, member, pushSub, login, anonClient, check, pass, finding, note, report, cleanup, kst, err } from './b4-lib.mjs';

const TODAY = kst(); const YM = TODAY.slice(0, 7); const DAY = +TODAY.slice(8, 10);
const kstDow = new Date(Date.now() + 9 * 3600e3).getUTCDay();
const MONDAY = kst(-((kstDow + 6) % 7));
const ago = days => new Date(Date.now() - days * 86400e3).toISOString();
const notis = async (A, kind, uid) => { let q = admin.from('notifications').select('id, user_id, title, body, link, created_at').eq('academy_id', A).eq('kind', kind); if (uid) q = q.eq('user_id', uid); return (await q).data ?? []; };
const outbox = async A => (await admin.from('outbox').select('id, to_user_id, channel, template_code').eq('academy_id', A)).data ?? [];
const drain = async A => { const r = await outbox(A); if (r.length) await admin.from('outbox').delete().eq('academy_id', A); return r; };

const X = await seedAcademy('bill');       // 자동 발행
const R = await seedAcademy('rmd');        // 자동 미납 안내
const W = await seedAcademy('wk');         // 주간 요약
const W2 = await seedAcademy('wk2');       // 두 학원 학부모
try {
  const dX = await login(X.dir.phone, X.dir.mid), tX = await login(X.tch.phone, X.tch.mid), pX = await login(X.par1.phone, X.par1.mid);
  const anon = anonClient();

  console.log('\n[5] billing_tick — 권한');
  for (const [who, c] of [['원장', dX], ['강사', tX], ['학부모', pX], ['anon', anon]]) {
    for (const [f, args] of [['issue_invoices_for', { p_academy: X.A, p_ym: YM }], ['remind_unpaid_for', { p_academy: X.A, p_ym: YM }], ['billing_tick', {}], ['weekly_summary_for', { p_academy: X.A, p_week_start: MONDAY }], ['weekly_summary_tick', {}]]) {
      const r = await c.rpc(f, args);
      check(!!r.error && /permission denied|42501/.test(r.error.message + r.error.code), `${who}: ${f} → permission denied`, 'B4-B1', '높음', `${who}: ${f} → ${err(r) || 'OK ' + JSON.stringify(r.data)}`);
    }
  }
  // billing_rules 새 칸: 강사·학부모는 못 켠다, 못 읽는다
  {
    let r = await dX.from('billing_rules').upsert({ academy_id: X.A, billing_day: Math.min(DAY, 28), due_day: 5, auto_issue: true, auto_remind: false, bank_info: 'rt' }).select();
    check(!r.error && r.data?.length === 1, '원장: billing_rules 자동 칸 upsert 통과(대조)', 'B4-B9', '낮음', err(r));
    r = await tX.from('billing_rules').update({ auto_remind: true }).eq('academy_id', X.A).select();
    check(!!r.error || (r.data ?? []).length === 0, '강사: billing_rules 자동 칸 갱신 거절', 'B4-B2', '중간', '강사가 auto_remind 를 켰다');
    r = await pX.from('billing_rules').update({ auto_issue: false }).eq('academy_id', X.A).select();
    check(!!r.error || (r.data ?? []).length === 0, '학부모: billing_rules 갱신 거절', 'B4-B2', '중간', '학부모가 auto_issue 를 바꿨다');
    r = await pX.from('billing_rules').select('auto_issue, bank_info').eq('academy_id', X.A);
    check((r.data ?? []).length === 0, '학부모: billing_rules 읽기 빈결과', 'B4-B2', '낮음', '학부모가 billing_rules 를 읽는다');
    r = await dX.from('billing_rules').update({ billing_day: 30 }).eq('academy_id', X.A).select();
    check(!!r.error, `billing_day=30 은 check 로 거절 (${err(r).slice(0, 40)}) → 29~31 처리 분지는 닿을 수 없다`, 'B4-B9', '낮음', 'billing_day 30 저장됨');
  }

  console.log('\n[5] billing_tick — 같은 날 두 번 · 퇴원생 · 뒤늦게 등록한 학생');
  if (DAY <= 28) {
    const { data: left } = await admin.from('students').insert({ academy_id: X.A, name: 'bill퇴원', status: 'left', left_at: new Date().toISOString() }).select().single();
    await admin.from('enrollments').insert({ student_id: left.id, class_id: X.c1.id });
    await admin.from('fee_plans').insert({ academy_id: X.A, class_id: null, name: '공통', amount: 100000 });
    let rows = (await admin.rpc('billing_tick')).data ?? [];
    let me = rows.find(x => x.academy_id === X.A);
    check(me?.issued === 2, `첫 tick: 활성 2명 발행 (got ${JSON.stringify(me)})`, 'B4-B3', '중간');
    const invs = (await admin.from('invoices').select('student_id').eq('academy_id', X.A).eq('period_ym', YM)).data ?? [];
    check(!invs.some(i => i.student_id === left.id), '퇴원생 청구서 없음', 'B4-B3', '중간', '퇴원생에게 청구서가 생겼다');
    let dn = await notis(X.A, 'billing', X.dir.uid);
    check(dn.length === 1 && /2건 자동 발행/.test(dn[0].title), `원장 알림 1건 "${dn[0]?.title}"`, 'B4-B3', '중간', JSON.stringify(dn));
    rows = (await admin.rpc('billing_tick')).data ?? [];
    me = rows.find(x => x.academy_id === X.A);
    check((me?.issued ?? 0) === 0, `같은 날 두 번째 tick: 발행 0 (got ${JSON.stringify(me)})`, 'B4-B3', '높음');
    check(((await admin.from('invoices').select('id').eq('academy_id', X.A).eq('period_ym', YM)).data ?? []).length === 2, '청구서 여전히 2장', 'B4-B3', '높음');
    dn = await notis(X.A, 'billing', X.dir.uid);
    check(dn.length === 1, '원장 알림 여전히 1건', 'B4-B3', '중간', `원장 알림 ${dn.length}건`);
    // 발행 뒤 같은 날 새 학생 → 다음 tick 이 그 학생만 발행 + 원장 알림 한 줄 더 (하루 한 번 크론이라 실제로는 다음 달까지 안 나간다)
    const { data: late } = await admin.from('students').insert({ academy_id: X.A, name: 'bill늦게' }).select().single();
    await admin.from('enrollments').insert({ student_id: late.id, class_id: X.c1.id });
    rows = (await admin.rpc('billing_tick')).data ?? [];
    me = rows.find(x => x.academy_id === X.A);
    note(`발행 뒤 등록한 학생 → 같은 날 tick 다시 돌면 issued=${me?.issued ?? 0}, 원장 알림 ${(await notis(X.A, 'billing', X.dir.uid)).length}건 (크론은 하루 한 번이라 청구일 09:00 뒤 등록한 학생은 이번 달 자동 발행에서 빠진다 — 원장이 수동 발행)`);
    const ob = await drain(X.A);
    check(ob.every(o => o.channel === 'push'), `발행 알림 outbox 는 push 만 (${ob.length}줄)`, 'B4-B9', '낮음', JSON.stringify(ob.map(o => o.channel)));
  } else note(`오늘 ${DAY}일 — billing_day 는 1..28 이라 자동 발행 실행 검증을 건너뛴다`);

  console.log('\n[5] billing_tick — 자동 미납 안내 cadence');
  {
    // R: 학생 셋(s1·s2·s3) — A: 납기 10일 전·2일 전 안내함, B: 납기 4일 전·안내 없음, C: 납기 5일 뒤. 퇴원생 L: 납기 10일 전.
    const { data: s3 } = await admin.from('students').insert({ academy_id: R.A, name: 'rmdS3' }).select().single();
    const p3 = await mkUser('rmd학부모3'); p3.mid = await member(p3.uid, R.A, 'parent', s3.id); await pushSub(p3.uid);
    const { data: L } = await admin.from('students').insert({ academy_id: R.A, name: 'rmd퇴원', status: 'left' }).select().single();
    const pL = await mkUser('rmd학부모L'); pL.mid = await member(pL.uid, R.A, 'parent', L.id); await pushSub(pL.uid);
    const notToday = DAY === 28 ? 27 : Math.min(DAY + 1, 28);
    await admin.from('billing_rules').upsert({ academy_id: R.A, billing_day: notToday, due_day: 5, auto_issue: false, auto_remind: true, auto_remind_after_days: 3, bank_info: '농협 000' });
    const { error: ie } = await admin.from('invoices').insert([
      { academy_id: R.A, student_id: R.s1.id, period_ym: YM, amount: 100000, total: 100000, due_date: kst(-10), status: 'overdue', reminded_at: ago(2) },
      { academy_id: R.A, student_id: R.s2.id, period_ym: YM, amount: 100000, total: 100000, due_date: kst(-4), status: 'issued' },
      { academy_id: R.A, student_id: s3.id, period_ym: YM, amount: 100000, total: 100000, due_date: kst(5), status: 'issued' },
      { academy_id: R.A, student_id: L.id, period_ym: YM, amount: 100000, total: 100000, due_date: kst(-10), status: 'issued' },
    ]);
    if (ie) throw new Error('invoices ' + ie.message);
    let rows = (await admin.rpc('billing_tick')).data ?? [];
    let me = rows.find(x => x.academy_id === R.A);
    const got = await notis(R.A, 'billing');
    const who = u => u === R.par1.uid ? 'A(2일 전 안내함)' : u === R.par2.uid ? 'B(납기+4일, 처음)' : u === p3.uid ? 'C(납기 5일 뒤 — 아직 안 됨)' : u === pL.uid ? 'L(퇴원)' : u === R.dir.uid ? '원장' : u;
    const parents = got.filter(n => n.user_id !== R.dir.uid).map(n => who(n.user_id)).sort();
    note(`tick → reminded=${me?.reminded} · 알림 받은 사람: ${JSON.stringify(parents)}`);
    check(!got.some(n => n.user_id === pL.uid), '퇴원생 학부모에게는 안내 없음', 'B4-B4', '중간', '퇴원생 학부모가 미납 안내를 받았다');
    check(got.some(n => n.user_id === R.par2.uid), 'B(납기+4일) 학부모 안내 받음', 'B4-B4', '중간', 'B 가 안내를 못 받았다');
    // 0030 B4-B5: billing_tick 이 remind_unpaid_for(학원, 달, 오늘-N일, 6일) 로 부른다 → 문턱을 넘은 청구서(B)에만
    const cAlso = got.some(n => n.user_id === p3.uid), aAlso = got.some(n => n.user_id === R.par1.uid);
    check(!cAlso && !aAlso && (me?.reminded ?? 0) === 1, `문턱을 넘은 청구서(B)에만 안내 (reminded=${me?.reminded})`, 'B4-B5', '중간',
      `${cAlso ? 'C(납기 5일 뒤, 아직 미납 아님) ' : ''}${aAlso ? 'A(2일 전 안내함 → 6일 간격 약속 깨짐) ' : ''}에게도 안내가 갔다 (reminded=${me?.reminded})`);
    check(!(await admin.from('invoices').select('reminded_at').eq('academy_id', R.A).eq('student_id', s3.id).single()).data?.reminded_at, 'C(납기 전) 청구서의 reminded_at 은 그대로 null', 'B4-B5', '낮음', 'C 의 reminded_at 이 찍혔다');
    const dn = await notis(R.A, 'billing', R.dir.uid);
    check(dn.length === 1 && /미납 \d+명에게 안내/.test(dn[0].title), `원장 알림 "${dn[0]?.title}"`, 'B4-B4', '낮음', JSON.stringify(dn));
    // 두 번째 tick 같은 날 → 아무도 안 받는다
    const before = got.length;
    rows = (await admin.rpc('billing_tick')).data ?? [];
    me = rows.find(x => x.academy_id === R.A);
    check((me?.reminded ?? 0) === 0 && (await notis(R.A, 'billing')).length === before, '같은 날 두 번째 tick: 안내 0 · 알림 수 그대로', 'B4-B4', '높음', `reminded=${me?.reminded}`);
    // 6일 뒤 시뮬레이션: reminded_at 을 7일 전으로 → 다시 나간다(주 1회)
    await admin.from('invoices').update({ reminded_at: ago(7) }).eq('academy_id', R.A).eq('student_id', R.s2.id);
    rows = (await admin.rpc('billing_tick')).data ?? [];
    me = rows.find(x => x.academy_id === R.A);
    check((me?.reminded ?? 0) >= 1, `reminded_at 7일 전이면 다시 안내 (reminded=${me?.reminded})`, 'B4-B4', '낮음');
    // 3일 전 → 안 나간다(6일 규칙)
    await admin.from('invoices').update({ reminded_at: ago(3) }).eq('academy_id', R.A);
    rows = (await admin.rpc('billing_tick')).data ?? [];
    me = rows.find(x => x.academy_id === R.A);
    check((me?.reminded ?? 0) === 0, 'reminded_at 3일 전이면 안내 없음(6일 규칙)', 'B4-B4', '중간', `reminded=${me?.reminded}`);
    const ob = await drain(R.A);
    check(ob.every(o => o.channel === 'push'), `미납 안내 outbox 는 push 만 (${ob.length}줄, 알림톡 0)`, 'B4-B9', '낮음', JSON.stringify(ob.map(o => o.channel)));
    // 부분 납부(partial) 도 남은 금액이 있으면 안내 대상 — 본문에 남은 금액
    const sample = got.find(n => n.user_id === R.par2.uid);
    if (sample) note(`안내 문구 예: "${sample.title}" / "${sample.body}"`);
  }

  console.log('\n[6] 주간 요약');
  {
    const dW = await login(W.dir.phone, W.dir.mid), tW = await login(W.tch.phone, W.tch.mid), pW = await login(W.par1.phone, W.par1.mid);
    const dW2 = await login(W2.dir.phone, W2.dir.mid);
    // 학원 설정 칸: 강사·학부모·다른 학원 원장은 못 만진다, 원장은 만진다, 범위 밖은 check
    let r = await tW.from('academies').update({ weekly_hour: 9 }).eq('id', W.A).select();
    check(!!r.error || (r.data ?? []).length === 0, '강사: academies.weekly_hour 갱신 거절', 'B4-W1', '중간', '강사가 weekly_hour 를 바꿨다');
    r = await pW.from('academies').update({ weekly_summary: false }).eq('id', W.A).select();
    check(!!r.error || (r.data ?? []).length === 0, '학부모: academies.weekly_summary 갱신 거절', 'B4-W1', '중간', '학부모가 weekly_summary 를 껐다');
    r = await dW2.from('academies').update({ weekly_summary: false }).eq('id', W.A).select();
    check(!!r.error || (r.data ?? []).length === 0, '다른 학원 원장: 우리 학원 weekly 갱신 거절', 'B4-W1', '높음', '다른 학원 원장이 우리 weekly 설정을 바꿨다');
    r = await dW.from('academies').update({ weekly_dow: 3, weekly_hour: 20 }).eq('id', W.A).select('weekly_dow, weekly_hour');
    check(!r.error && r.data?.[0]?.weekly_dow === 3, '원장: weekly_dow/hour 갱신 통과(대조)', 'B4-W9', '낮음', err(r));
    r = await dW.from('academies').update({ weekly_hour: 23 }).eq('id', W.A).select();
    check(!!r.error, `weekly_hour=23 → check 거절 (${err(r).slice(0, 40)})`, 'B4-W1', '낮음', 'weekly_hour 23 저장됨');
    r = await dW.from('academies').update({ weekly_dow: 7 }).eq('id', W.A).select();
    check(!!r.error, 'weekly_dow=7 → check 거절', 'B4-W1', '낮음', 'weekly_dow 7 저장됨');
    // 0030 B4-L9: trg_academies_guard — 로그인 사용자는 id·slug·locked·created_at·weekly_last_at 을 못 바꾼다 (B4-W2 는 같은 원인)
    r = await dW.from('academies').update({ weekly_last_at: null, locked: true }).eq('id', W.A).select('locked');
    if (!r.error && r.data?.length) await admin.from('academies').update({ locked: false }).eq('id', W.A);
    check(/not allowed/.test(err(r)), '원장: locked/weekly_last_at 갱신 → not allowed (trg_academies_guard)', 'B4-L9', '높음', `원장이 academies 의 운영 칸을 PostgREST 로 바꿨다 → ${err(r) || JSON.stringify(r.data)}`);
    for (const [what, patch] of [['slug', { slug: 'rt-b4-hijack-' + Date.now() }], ['weekly_last_at', { weekly_last_at: new Date().toISOString() }], ['created_at', { created_at: '2000-01-01T00:00:00Z' }]]) {
      const x = await dW.from('academies').update(patch).eq('id', W.A).select('id');
      check(/not allowed/.test(err(x)), `원장: academies.${what} 갱신 → not allowed`, 'B4-L9', '높음', `원장이 academies.${what} 를 바꿨다 → ${err(x) || JSON.stringify(x.data)}`);
    }
    r = await dW.from('academies').update({ brand_color: '#123456' }).eq('id', W.A).select('brand_color');
    check(!r.error && r.data?.[0]?.brand_color === '#123456', '원장: brand_color 갱신은 통과(대조)', 'B4-W9', '낮음', err(r));

    // 데이터: s1 출석 2·지각 1, 숙제 3(1 완료); 학부모2 는 prefs.weekly=false
    await admin.from('users').update({ prefs: { weekly: false } }).eq('id', W.par2.uid);
    await admin.from('attendance').insert([
      { academy_id: W.A, class_id: W.c1.id, student_id: W.s1.id, date: MONDAY, status: 'present', marked_by: W.dir.uid },
      { academy_id: W.A, class_id: W.c1.id, student_id: W.s1.id, date: kst(-((kstDow + 6) % 7) + 1), status: 'present', marked_by: W.dir.uid },
      { academy_id: W.A, class_id: W.c1.id, student_id: W.s1.id, date: kst(-((kstDow + 6) % 7) + 2), status: 'late', marked_by: W.dir.uid },
      { academy_id: W.A, class_id: W.c2.id, student_id: W.s2.id, date: MONDAY, status: 'absent', marked_by: W.dir.uid },
    ]);
    const { data: hw } = await admin.from('todos').insert([1, 2, 3].map(i => ({ academy_id: W.A, class_id: W.c1.id, kind: 'homework', title: 'hw' + i, due_date: kst(-((kstDow + 6) % 7) + Math.min(i, 6)) }))).select();
    await admin.from('todo_done').insert({ todo_id: hw[0].id, student_id: W.s1.id });
    // 같은 이름 자녀 둘인 학부모(쌍둥이)
    const { data: tw1 } = await admin.from('students').insert({ academy_id: W.A, name: '쌍둥이' }).select().single();
    const { data: tw2 } = await admin.from('students').insert({ academy_id: W.A, name: '쌍둥이' }).select().single();
    await admin.from('enrollments').insert([{ student_id: tw1.id, class_id: W.c1.id }, { student_id: tw2.id, class_id: W.c2.id }]);
    const pT = await mkUser('wk쌍둥이부모'); await member(pT.uid, W.A, 'parent', tw1.id); await member(pT.uid, W.A, 'parent', tw2.id); await pushSub(pT.uid);
    // 두 학원 학부모: W 의 학부모1 이 W2 에도 자녀(s1) 가 있다
    await member(W.par1.uid, W2.A, 'parent', W2.s1.id);

    let n1 = (await admin.rpc('weekly_summary_for', { p_academy: W.A, p_week_start: MONDAY })).data;
    let wk = await notis(W.A, 'weekly');
    const mine = wk.filter(n => n.user_id === W.par1.uid);
    check(mine.length === 1, `학부모1 알림 1건 (반환 ${n1})`, 'B4-W3', '중간', `학부모1 알림 ${mine.length}건`);
    check(mine[0] && /출석 2 · 지각 1 · 결석 0 · 숙제 1\/3/.test(mine[0].body), `본문 숫자 일치: "${mine[0]?.body}"`, 'B4-W3', '중간', `본문 "${mine[0]?.body}"`);
    check(wk.every(n => [...n.body].length <= 120), '본문 전부 120자 안', 'B4-W3', '낮음', '120자 넘는 본문 있음');
    check(!wk.some(n => n.user_id === W.par2.uid), 'prefs.weekly=false 학부모2 건너뜀', 'B4-W3', '중간', '끈 학부모에게도 갔다');
    check(wk.filter(n => n.user_id === W.dir.uid).length === 1, '원장 요약 1건', 'B4-W3', '낮음');
    // 0030 B4-W4: dedupe 키가 link('child:<student_id>') — 같은 이름 자녀 둘도 각각 받는다
    const twins = wk.filter(n => n.user_id === pT.uid);
    const twinLinks = new Set(twins.map(n => n.link));
    check(twins.length === 2 && twinLinks.has('child:' + tw1.id) && twinLinks.has('child:' + tw2.id), '같은 이름 자녀 둘 → 2건, link 는 child:<각 학생 id>', 'B4-W4', '낮음',
      `같은 이름 자녀 둘(쌍둥이) 학부모는 ${twins.length}건 (links ${JSON.stringify([...twinLinks])})`);
    check(mine[0]?.link === 'child:' + W.s1.id, `학부모1 link 'child:<student_id>' (got ${mine[0]?.link})`, 'B4-W4', '낮음');
    // 같은 주 다시 → 0
    const n2 = (await admin.rpc('weekly_summary_for', { p_academy: W.A, p_week_start: MONDAY })).data;
    check(n2 === 0 && (await notis(W.A, 'weekly')).length === wk.length, `같은 주 재호출 → 0, 알림 수 그대로 (${wk.length})`, 'B4-W5', '높음', `재호출 ${n2}`);
    // outbox: push 만
    const ob = await drain(W.A);
    const wob = ob.filter(o => o.template_code === 'WEEKLY');   // 출결을 심을 때 생긴 ATTENDANCE 푸시 줄은 뺀다
    check(wob.length === wk.length && wob.every(o => o.channel === 'push') && !ob.some(o => o.channel === 'alimtalk'), `WEEKLY outbox ${wob.length}줄 = 알림 ${wk.length}건, 전부 push · 알림톡 0`, 'B4-W6', '높음', JSON.stringify(ob.map(o => o.channel + ':' + o.template_code)));
    // 학부모가 두 학원: W2 요약은 W2 자녀 이름으로 따로 1건
    const m2 = (await admin.rpc('weekly_summary_for', { p_academy: W2.A, p_week_start: MONDAY })).data;
    const wk2 = (await notis(W2.A, 'weekly')).filter(n => n.user_id === W.par1.uid);
    check(wk2.length === 1 && wk2[0].title.includes(W2.s1.name) && !wk2[0].title.includes(W.s1.name), `두 학원 학부모: W2 에서 W2 자녀(${W2.s1.name}) 이름으로 1건 (반환 ${m2})`, 'B4-W7', '중간', JSON.stringify(wk2));
    check(!(await notis(W2.A, 'weekly')).some(n => n.user_id === W.par2.uid || n.user_id === pT.uid), 'W2 요약이 W 만의 학부모에게는 안 감', 'B4-W7', '높음');
    await drain(W2.A);
    // 학부모가 남의 알림을 못 읽는다
    const peek = await pW.from('notifications').select('id').eq('academy_id', W.A).eq('kind', 'weekly').neq('user_id', W.par1.uid);
    check((peek.data ?? []).length === 0, '학부모: 남의 weekly 알림 안 보임', 'B4-W8', '높음', '남의 알림 보임');
    // 학부모가 prefs 를 직접 바꿀 수 있다(본인 행, 열 grant) — 대조
    const pr = await pW.from('users').update({ prefs: { weekly: false } }).eq('id', W.par1.uid).select('prefs');
    check(!pr.error && pr.data?.[0]?.prefs?.weekly === false, '학부모: 본인 prefs.weekly 끄기 통과(대조)', 'B4-W9', '낮음', err(pr));
  }
} finally {
  for (const a of [X, R, W, W2]) await drain(a.A);
  await cleanup();
}
report('rt-batch4-billing-weekly');
