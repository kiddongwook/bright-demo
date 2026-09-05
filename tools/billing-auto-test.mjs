// 수강료 자동화(0028) 통합 테스트: 자동 발행(같은 날 두 번 tick → 1회, 퇴원생 제외, 원장 알림 1건) → 자동 미납 안내(크론은 납기+N일·6일 간격 — 0030 B4-B5; 수동 버튼은 20시간) → 내부 함수 권한
// remind_unpaid_for 는 0030 부터 4인자(p_academy, p_ym, p_due_before, p_min_gap) — 2인자 호출은 기본값으로 같은 함수에 닿는다.
// node --env-file=../.env.local billing-auto-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'auto-' + rnd; const email = p => `${p}@auth.yeongeo.local`;
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const TODAY = kstToday(); const YM = TODAY.slice(0, 7); const DAY = +TODAY.slice(8, 10);
const shiftDay = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
async function mkUser(name, phone) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true }); if (error) throw error;
  await admin.from('users').insert({ id: data.user.id, name, phone }); return data.user.id;
}
const users = []; const academies = [];
async function cleanup() {
  for (const id of academies) await admin.from('academies').delete().eq('id', id);   // cascade 로 청구서·알림까지
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
}
const tick = async () => { const r = await admin.rpc('billing_tick'); ok(!r.error, 'billing_tick: ' + r.error?.message); return r.data ?? []; };
const rowOf = (rows, A) => rows.find(x => x.academy_id === A);
const dirNotis = async (A, dirId) => (await admin.from('notifications').select('id, title, body, link').eq('academy_id', A).eq('user_id', dirId).eq('kind', 'billing')).data ?? [];

try {
  // ---- 준비: 학원 · 반 · 원장 · 활성 학생 둘 · 퇴원생 하나 · 요금제
  const { data: ac } = await admin.from('academies').insert({ slug: `auto-${rnd}`, name: '자동 수강료 테스트' }).select().single();
  const A = ac.id; academies.push(A);
  const { data: c1 } = await admin.from('classes').insert({ academy_id: A, name: '중2 A', schedule: [{ dow: 2, start: '18:00', end: '20:00' }] }).select().single();
  const P_DIR = '0109' + num() + '5'; const dirId = await mkUser('자동 원장', P_DIR); users.push(dirId);
  const { data: dm } = await admin.from('memberships').insert({ user_id: dirId, academy_id: A, role: 'director' }).select().single();
  await admin.from('users').update({ active_membership_id: dm.id }).eq('id', dirId);
  const d = createClient(URL, ANON, { auth: { persistSession: false } });
  ok(!(await d.auth.signInWithPassword({ email: email(P_DIR), password: PW })).error, '원장 로그인');

  const { data: kids } = await admin.from('students').insert([
    { academy_id: A, name: '자동 첫째', status: 'active' },
    { academy_id: A, name: '자동 둘째', status: 'active' },
    { academy_id: A, name: '자동 퇴원', status: 'left', left_at: new Date().toISOString() },
  ]).select();
  const S1 = kids.find(k => k.name === '자동 첫째').id, S2 = kids.find(k => k.name === '자동 둘째').id, S_LEFT = kids.find(k => k.name === '자동 퇴원').id;
  await admin.from('enrollments').insert(kids.map(k => ({ student_id: k.id, class_id: c1.id })));
  ok(!(await admin.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '중2 정규', amount: 200000 })).error, '요금제');

  // ---- A. 자동 발행: 오늘이 청구일. billing_day 는 1..28 이라 29~31일에는 발행 검증을 건너뛴다.
  const canIssue = DAY <= 28;
  let r = await admin.from('billing_rules').upsert({ academy_id: A, billing_day: Math.min(DAY, 28), due_day: 5, auto_issue: true, auto_remind: false, bank_info: '농협 999-01 자동 테스트' });
  ok(!r.error, 'billing_rules 자동 칸 저장: ' + r.error?.message);
  const rules = (await admin.from('billing_rules').select('auto_issue, auto_remind, auto_remind_after_days').eq('academy_id', A).single()).data;
  ok(rules?.auto_issue === true && rules.auto_remind === false && rules.auto_remind_after_days === 3, `새 칸 기본값 (got ${JSON.stringify(rules)})`);
  ok(!!(await admin.from('billing_rules').update({ auto_remind_after_days: 0 }).eq('academy_id', A)).error, 'after_days 0 은 거절(check 1..14)');
  ok(!!(await admin.from('billing_rules').update({ auto_remind_after_days: 15 }).eq('academy_id', A)).error, 'after_days 15 는 거절');

  if (canIssue) {
    let rows = await tick();
    let me = rowOf(rows, A);
    ok(me?.issued === 2, `첫 tick → 우리 학원 2건 발행 (got ${JSON.stringify(me)})`);
    let { data: invs } = await admin.from('invoices').select('id, student_id, total, due_date, status').eq('academy_id', A).eq('period_ym', YM);
    ok(invs?.length === 2, `청구서 2장 (got ${invs?.length})`);
    ok(invs?.every(i => i.student_id !== S_LEFT), '퇴원생 청구서는 없다');
    ok(invs?.every(i => i.total === 200000 && i.status === 'issued' && i.due_date === `${YM}-05`), `금액·상태·납기 (got ${JSON.stringify(invs)})`);
    let dn = await dirNotis(A, dirId);
    ok(dn.length === 1, `원장 알림 1건 (got ${dn.length})`);
    ok(/^\[자동 수강료 테스트\] \d+월 청구서 2건 자동 발행$/.test(dn[0]?.title ?? ''), `제목 (got ${dn[0]?.title})`);
    ok(dn[0]?.link === 'billing:', `link 'billing:' (got ${dn[0]?.link})`);

    // 같은 날 두 번째 tick — 발행 0, 알림도 그대로
    rows = await tick(); me = rowOf(rows, A);
    ok(!me || me.issued === 0, `두 번째 tick → 0건 (got ${JSON.stringify(me)})`);
    ok(((await admin.from('invoices').select('id').eq('academy_id', A)).data ?? []).length === 2, '청구서는 여전히 2장');
    ok((await dirNotis(A, dirId)).length === 1, '원장 알림도 늘지 않는다');
    // 원장 화면의 수동 버튼(위임 함수)도 그대로 돈다
    r = await d.rpc('issue_invoices', { p_ym: YM }); ok(!r.error && r.data === 0, `원장 issue_invoices 위임 → 0 (got ${r.error?.message ?? r.data})`);
  } else {
    console.log(`(오늘 ${DAY}일 — billing_day 상한 28 이라 자동 발행 검증은 건너뜀. 수동으로 만들어 안내 검증만 한다)`);
    r = await d.rpc('issue_invoices', { p_ym: YM }); ok(!r.error && r.data === 2, `수동 발행 2건 (got ${r.error?.message ?? r.data})`);
  }

  // ---- B. 자동 미납 안내: 납기 1일 뒤. 첫째 청구서 납기를 이틀 전으로 — 받을 사람(엄마)은 첫째에게만.
  const P_MOM = '0109' + num() + '6'; const momId = await mkUser('자동 어머님', P_MOM); users.push(momId);
  const { data: mm } = await admin.from('memberships').insert({ user_id: momId, academy_id: A, role: 'parent', student_id: S1 }).select().single();
  await admin.from('guardians').insert({ student_id: S1, user_id: momId });
  await admin.from('users').update({ active_membership_id: mm.id }).eq('id', momId);

  r = await admin.from('billing_rules').update({ auto_remind: true, auto_remind_after_days: 1 }).eq('academy_id', A);
  ok(!r.error, 'auto_remind 켜기: ' + r.error?.message);
  const inv1 = (await admin.from('invoices').select('id').eq('academy_id', A).eq('student_id', S1).eq('period_ym', YM).single()).data;
  // 둘째 납기는 미래로 밀어 "납기+N 지난 것" 이 첫째 하나만 되게 (둘째는 받을 사람도 없다)
  await admin.from('invoices').update({ due_date: shiftDay(TODAY, -2) }).eq('id', inv1.id);
  await admin.from('invoices').update({ due_date: shiftDay(TODAY, 20) }).eq('academy_id', A).eq('student_id', S2);

  let rows = await tick(); let me = rowOf(rows, A);
  ok(me?.reminded === 1, `tick → 1명 안내 (got ${JSON.stringify(me)})`);
  let got = (await admin.from('invoices').select('reminded_at, status').eq('id', inv1.id).single()).data;
  ok(!!got?.reminded_at, 'reminded_at 기록');
  ok(got?.status === 'overdue', `납기 지난 청구서는 overdue (got ${got?.status})`);
  const parentNotis = async () => (await admin.from('notifications').select('title, body, link').eq('academy_id', A).eq('user_id', momId).eq('kind', 'billing')).data ?? [];
  let pn = await parentNotis();
  ok(pn.length === 1, `엄마 알림 1건 (got ${pn.length})`);
  ok(pn[0]?.link === 'child:', `학부모 link 'child:' (got ${pn[0]?.link})`);
  ok(/남은 금액 200,000원/.test(pn[0]?.title ?? ''), `남은 금액 (got ${pn[0]?.title})`);
  ok(pn[0]?.body === '농협 999-01 자동 테스트', `계좌 안내 본문 (got ${pn[0]?.body})`);
  let dn = await dirNotis(A, dirId);
  ok(dn.some(n => /미납 1명에게 안내를 보냈어요$/.test(n.title)), `원장에게 "미납 1명" 알림 (got ${JSON.stringify(dn.map(n => n.title))})`);

  // 같은 날 다시 tick — 20시간 창 안이라 안내 0, 알림도 그대로
  rows = await tick(); me = rowOf(rows, A);
  ok(!me || me.reminded === 0, `두 번째 tick → 안내 0 (got ${JSON.stringify(me)})`);
  ok((await parentNotis()).length === 1, '엄마 알림이 늘지 않는다');
  ok((await dirNotis(A, dirId)).filter(n => /미납/.test(n.title)).length === 1, '원장 "미납" 알림도 한 건');

  // 납기 + N 이 아직 안 지났으면 안 간다: after_days 를 14로 → 첫째(이틀 전)는 대상 아님
  await admin.from('invoices').update({ reminded_at: null }).eq('id', inv1.id);
  await admin.from('billing_rules').update({ auto_remind_after_days: 14 }).eq('academy_id', A);
  rows = await tick(); me = rowOf(rows, A);
  ok(!me || me.reminded === 0, `납기+14 전이면 안내 0 (got ${JSON.stringify(me)})`);
  ok((await parentNotis()).length === 1, '엄마 알림 그대로');

  // ---- C. 권한: 내부 함수는 로그인 사용자가 못 부른다. 위임 함수는 원장만.
  r = await d.rpc('issue_invoices_for', { p_academy: A, p_ym: YM });
  ok(!!r.error && /permission denied/i.test(r.error.message), `원장도 issue_invoices_for 직접은 못 부른다 (got ${r.error?.message ?? r.data})`);
  r = await d.rpc('remind_unpaid_for', { p_academy: A, p_ym: YM });
  ok(!!r.error && /permission denied/i.test(r.error.message), `remind_unpaid_for 도 못 부른다 (got ${r.error?.message ?? r.data})`);
  r = await d.rpc('billing_tick');
  ok(!!r.error && /permission denied/i.test(r.error.message), `billing_tick 도 못 부른다 (got ${r.error?.message ?? r.data})`);
  const p = createClient(URL, ANON, { auth: { persistSession: false } });
  ok(!(await p.auth.signInWithPassword({ email: email(P_MOM), password: PW })).error, '엄마 로그인');
  ok(!!(await p.rpc('issue_invoices', { p_ym: YM })).error, '학부모는 청구서를 못 만든다');
  ok(!!(await p.rpc('remind_unpaid', { p_ym: YM })).error, '학부모는 미납 안내를 못 보낸다');
  ok(!(await p.from('billing_rules').select('auto_issue')).data?.length, '학부모는 자동 규칙을 못 읽는다');
  // 원장은 표를 직접 고친다 (billing_rules_staff — 화면의 setAutoRules 가 쓰는 길)
  r = await d.from('billing_rules').upsert({ academy_id: A, auto_issue: false, auto_remind: false, auto_remind_after_days: 5 });
  ok(!r.error, '원장 upsert 자동 칸: ' + r.error?.message);
  got = (await admin.from('billing_rules').select('auto_issue, auto_remind, auto_remind_after_days, bank_info').eq('academy_id', A).single()).data;
  ok(got?.auto_issue === false && got.auto_remind_after_days === 5 && got.bank_info === '농협 999-01 자동 테스트', `자동 칸만 바뀌고 다른 칸은 그대로 (got ${JSON.stringify(got)})`);

  // 크론 등록 확인 (service role 은 cron 스키마를 못 읽을 수 있어 실패해도 경고만)
  const cj = await admin.schema('cron').from('job').select('jobname, schedule').eq('jobname', 'billing-tick');
  if (cj.error) console.log('(cron.job 은 service role 로 못 읽음 — SQL 편집기에서 확인: ' + cj.error.message + ')');
  else ok(cj.data?.length === 1 && cj.data[0].schedule === '0 0 * * *', `cron billing-tick 0 0 * * * (got ${JSON.stringify(cj.data)})`);
} finally {
  await cleanup();
}

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: billing-auto A~C (자동 발행·퇴원생 제외·같은 날 2회·자동 안내 dedupe·권한)');
