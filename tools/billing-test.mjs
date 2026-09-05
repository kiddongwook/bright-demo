// 수강료(수기 모드) 통합 테스트: 청구서 만들기 → 형제 할인 → 납부/부분 납부 → 미납 안내(20시간) → 연체 → 학부모 열람 → 학원 격리
// node --env-file=../.env.local billing-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'bill-' + rnd; const email = p => `${p}@auth.yeongeo.local`;
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const YM = kstToday().slice(0, 7);
async function mkUser(name, phone) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true }); if (error) throw error;
  await admin.from('users').insert({ id: data.user.id, name, phone }); return data.user.id;
}
const users = []; const academies = [];
async function cleanup() {
  for (const id of academies) await admin.from('academies').delete().eq('id', id);   // cascade 로 청구서·납부까지
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => {});
}

try {
  // ---- 준비: 학원 A · 반 · 원장 · 형제 둘(엄마 번호 공유) · 요금제 · 규칙
  const { data: ac } = await admin.from('academies').insert({ slug: `bill-${rnd}`, name: '수강료 테스트' }).select().single();
  const A = ac.id; academies.push(A);
  const { data: c1 } = await admin.from('classes').insert({ academy_id: A, name: '고1 A', schedule: [{ dow: 1, start: '19:00', end: '21:00' }] }).select().single();
  const P_DIR = '0109' + num() + '3'; const dirId = await mkUser('김지영', P_DIR); users.push(dirId);
  const { data: dm } = await admin.from('memberships').insert({ user_id: dirId, academy_id: A, role: 'director' }).select().single();
  await admin.from('users').update({ active_membership_id: dm.id }).eq('id', dirId);
  const d = createClient(URL, ANON, { auth: { persistSession: false } });
  ok(!(await d.auth.signInWithPassword({ email: email(P_DIR), password: PW })).error, '원장 로그인');

  const P_MOM = '0109' + num() + '2';
  let r = await d.rpc('roster_save_student', { sid: null, p_name: '박첫째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [P_MOM] });
  ok(!r.error, '첫째 저장: ' + r.error?.message); const S1 = r.data;
  r = await d.rpc('roster_save_student', { sid: null, p_name: '박둘째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [P_MOM] });
  ok(!r.error, '둘째 저장: ' + r.error?.message); const S2 = r.data;

  // 규칙·요금제는 원장이 직접 쓴다 (RLS: director only)
  r = await d.from('billing_rules').upsert({ academy_id: A, billing_day: 1, due_day: 5, sibling_discount_pct: 10, bank_info: '국민 123-45 수강료 테스트' });
  ok(!r.error, 'billing_rules 저장: ' + r.error?.message);
  ok(!!(await admin.from('billing_rules').select('bank_info').eq('academy_id', A).single()).data?.bank_info, 'bank_info 칸 있음');
  r = await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '고1 정규', amount: 150000 });
  ok(!r.error, 'fee_plan insert: ' + r.error?.message);

  // ---- A. 청구서 만들기 + 형제 할인
  r = await d.rpc('issue_invoices', { p_ym: YM });
  ok(!r.error && r.data === 2, `issue_invoices → 2 (got ${r.error?.message ?? r.data})`);
  let { data: invs } = await admin.from('invoices').select('id, student_id, amount, discount, total, due_date, status').eq('academy_id', A).eq('period_ym', YM);
  ok(invs?.length === 2, `청구서 2장 (got ${invs?.length})`);
  ok(invs?.filter(i => i.discount === 15000 && i.total === 135000).length === 1, `형제 할인 한 장만 (got ${JSON.stringify(invs?.map(i => [i.discount, i.total]))})`);
  ok(invs?.filter(i => i.discount === 0 && i.total === 150000).length === 1, '첫째는 할인 없음');
  ok(invs?.every(i => i.due_date === `${YM}-05`), `납기 ${YM}-05 (got ${invs?.[0]?.due_date})`);
  ok(invs?.every(i => i.status === 'issued'), '처음은 issued');
  r = await d.rpc('issue_invoices', { p_ym: YM }); ok(!r.error && r.data === 0, `다시 만들기 → 0 (got ${r.data})`);
  // 새 학생만 늘어난다 (학부모 번호 없음 → 형제 아님, 안내 받을 사람도 없음)
  r = await d.rpc('roster_save_student', { sid: null, p_name: '박셋째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [] });
  const S3 = r.data;
  r = await d.rpc('issue_invoices', { p_ym: YM }); ok(!r.error && r.data === 1, `새 학생만 → 1 (got ${r.error?.message ?? r.data})`);
  ok((await admin.from('invoices').select('discount').eq('student_id', S3).single()).data?.discount === 0, '셋째는 형제 할인 없음');
  r = await d.rpc('issue_invoices', { p_ym: '20260-9' }); ok(!!r.error, '잘못된 달 형식 거절');

  const inv1 = invs.find(i => i.student_id === S1), inv2 = invs.find(i => i.student_id === S2);

  // ---- B. 납부 적기: 전액 → paid, 부분 → partial
  r = await d.rpc('record_payment', { p_invoice: inv1.id, p_amount: inv1.total, p_method: 'transfer' });
  ok(!r.error, 'record_payment(전액): ' + r.error?.message);
  let got = (await admin.from('invoices').select('status, paid_at').eq('id', inv1.id).single()).data;
  ok(got?.status === 'paid' && !!got.paid_at, `전액 → paid (got ${JSON.stringify(got)})`);
  r = await d.rpc('record_payment', { p_invoice: inv2.id, p_amount: 35000, p_method: 'cash', p_memo: '나머지는 다음 주' });
  ok(!r.error, 'record_payment(부분): ' + r.error?.message);
  got = (await admin.from('invoices').select('status, paid_at, memo').eq('id', inv2.id).single()).data;
  ok(got?.status === 'partial' && got.paid_at === null && got.memo === '나머지는 다음 주', `부분 → partial (got ${JSON.stringify(got)})`);
  ok(((await admin.from('payments').select('id, recorded_by').eq('invoice_id', inv2.id)).data ?? []).length === 1, '납부 기록 한 줄');
  ok((await admin.from('payments').select('recorded_by').eq('invoice_id', inv2.id).single()).data?.recorded_by === dirId, 'recorded_by = 원장');
  r = await d.rpc('record_payment', { p_invoice: inv2.id, p_amount: 0, p_method: 'cash' }); ok(!!r.error, '0원 납부 거절');

  // ---- C. 미납 안내 — 부분 납부 한 장만. 셋째는 받을 사람이 없어 세지 않는다.
  const momId = await mkUser('박첫째 어머님', P_MOM); users.push(momId);
  const { data: mm1 } = await admin.from('memberships').insert({ user_id: momId, academy_id: A, role: 'parent', student_id: S1 }).select().single();
  await admin.from('memberships').insert({ user_id: momId, academy_id: A, role: 'parent', student_id: S2 });
  await admin.from('guardians').insert([{ student_id: S1, user_id: momId }, { student_id: S2, user_id: momId }]);
  await admin.from('users').update({ active_membership_id: mm1.id }).eq('id', momId);

  r = await d.rpc('remind_unpaid', { p_ym: YM });
  ok(!r.error && r.data === 1, `remind_unpaid → 1 (got ${r.error?.message ?? r.data})`);
  const { data: nots } = await admin.from('notifications').select('kind, title, body, link, user_id').eq('academy_id', A).eq('kind', 'billing');
  ok(nots?.length === 1 && nots[0].user_id === momId, `엄마에게 알림 한 줄 (got ${nots?.length})`);
  ok(nots?.[0]?.link === 'child:', `link 'child:' (got ${nots?.[0]?.link})`);
  // 둘째: 135,000원(형제 할인) 중 35,000원 냈으니 남은 금액 100,000원
  ok(/^\[수강료 테스트\] \d+월 수강료 안내 · 남은 금액 100,000원 · 납기 \d+\/5$/.test(nots?.[0]?.title ?? ''), `제목 (got ${nots?.[0]?.title})`);
  ok(nots?.[0]?.body === '국민 123-45 수강료 테스트', `본문에 계좌 안내 (got ${nots?.[0]?.body})`);
  ok(!!(await admin.from('invoices').select('reminded_at').eq('id', inv2.id).single()).data?.reminded_at, 'reminded_at 기록');
  ok((await admin.from('invoices').select('reminded_at').eq('student_id', S3).single()).data?.reminded_at === null, '받을 사람 없는 청구서는 보낸 것으로 치지 않는다');
  r = await d.rpc('remind_unpaid', { p_ym: YM }); ok(!r.error && r.data === 0, `20시간 안에 다시 → 0 (got ${r.data})`);
  ok(((await admin.from('notifications').select('id').eq('academy_id', A).eq('kind', 'billing')).data ?? []).length === 1, '알림도 늘지 않는다');

  // ---- D. 연체 표시
  await admin.from('invoices').update({ due_date: '2020-01-05', status: 'issued' })   /* 오늘이 납기 뒤면 C 의 안내가 이미 overdue 로 뒤집어 놓는다 — 날짜에 안 흔들리게 되돌린다 */.eq('student_id', S3);
  // 0018: 부분 납부도 뒤집는다(INT-32) → 둘째 청구서의 납기가 지난 날에 돌리면 2장이 될 수 있다. "적어도 셋째 한 장" 으로 본다.
  r = await d.rpc('refresh_overdue'); ok(!r.error && r.data >= 1, `refresh_overdue → 1 이상 (got ${r.error?.message ?? r.data})`);
  ok((await admin.from('invoices').select('status').eq('student_id', S3).single()).data?.status === 'overdue', '납기 지난 issued → overdue');
  r = await d.rpc('refresh_overdue'); ok(!r.error && r.data === 0, '두 번째는 0');

  // ---- E. 금액 고치기 · 면제
  r = await d.rpc('set_invoice_amount', { p_invoice: inv2.id, p_amount: 150000, p_discount: 15000, p_textbook: 20000 });
  ok(!r.error, 'set_invoice_amount: ' + r.error?.message);
  got = (await admin.from('invoices').select('total, status').eq('id', inv2.id).single()).data;
  ok(got?.total === 155000 && ['partial', 'overdue'].includes(got.status), /* 납기가 지난 날에 돌리면 부분 납부는 overdue 로 보인다(INT-32) */ `총액 다시 계산 (got ${JSON.stringify(got)})`);
  // 0018(INT-30): 이미 낸 돈(35,000)보다 낮은 총액은 거절 — 환불이 먼저다
  r = await d.rpc('set_invoice_amount', { p_invoice: inv2.id, p_amount: 10000, p_discount: 0, p_textbook: 0 });
  ok(!!r.error && /below_paid/.test(r.error.message), `낸 돈보다 낮은 총액 거절 (got ${r.error?.message})`);
  // 0018(INT-34): 납부 기록이 있는 청구서는 면제할 수 없다 (돈 기록이 어긋난다)
  r = await d.rpc('void_invoice', { p_invoice: inv2.id, p_memo: 'x' });
  ok(!!r.error && /has_payments/.test(r.error.message), `납부가 있는 청구서 면제 거절 (got ${r.error?.message})`);
  // 납부가 없는 청구서(셋째)는 그대로 면제된다
  const inv3 = (await admin.from('invoices').select('id').eq('student_id', S3).single()).data;
  r = await d.rpc('void_invoice', { p_invoice: inv3.id, p_memo: '형편이 어려워 이번 달 면제' });
  ok(!r.error, 'void_invoice: ' + r.error?.message);
  got = (await admin.from('invoices').select('status, memo').eq('id', inv3.id).single()).data;
  ok(got?.status === 'void' && got.memo === '형편이 어려워 이번 달 면제', `면제 (got ${JSON.stringify(got)})`);
  r = await d.rpc('record_payment', { p_invoice: inv3.id, p_amount: 1000, p_method: 'cash' }); ok(!!r.error, '면제된 청구서에는 납부를 못 적는다');

  // ---- F. 학부모: 내 청구서 한 장만 (지금 보고 있는 자녀)
  const p = createClient(URL, ANON, { auth: { persistSession: false } });
  ok(!(await p.auth.signInWithPassword({ email: email(P_MOM), password: PW })).error, '엄마 로그인');
  r = await p.rpc('my_invoice', { p_ym: YM });
  ok(!r.error && r.data?.length === 1, `my_invoice 한 줄 (got ${r.error?.message ?? r.data?.length})`);
  ok(r.data?.[0]?.id === inv1.id && r.data[0].student_name === '박첫째', `보고 있는 자녀의 청구서 (got ${r.data?.[0]?.student_name})`);
  ok(r.data?.[0]?.bank_info === '국민 123-45 수강료 테스트', '계좌 안내가 학부모에게 나간다');
  ok(r.data?.[0]?.paid === 150000 && r.data[0].status === 'paid', `납부 합계·상태 (got ${JSON.stringify([r.data?.[0]?.paid, r.data?.[0]?.status])})`);
  ok(!(await p.from('billing_rules').select('bank_info')).data?.length, '학부모는 billing_rules 표를 직접은 못 읽는다');
  ok(((await p.from('invoices').select('id')).data ?? []).length === 1, '학부모는 자기 자녀 청구서만 본다');
  ok(!!(await p.rpc('issue_invoices', { p_ym: YM })).error, '학부모는 청구서를 못 만든다');
  ok(!!(await p.rpc('record_payment', { p_invoice: inv1.id, p_amount: 1000, p_method: 'cash' })).error, '학부모는 납부를 못 적는다');
  ok(!!(await p.rpc('remind_unpaid', { p_ym: YM })).error, '학부모는 미납 안내를 못 보낸다');
  ok(!!(await p.rpc('refresh_overdue')).error, '학부모는 연체 표시를 못 돌린다');
  ok(!!(await p.rpc('void_invoice', { p_invoice: inv1.id, p_memo: 'x' })).error, '학부모는 면제를 못 한다');
  ok(!!(await p.rpc('set_invoice_amount', { p_invoice: inv1.id, p_amount: 0, p_discount: 0, p_textbook: 0 })).error, '학부모는 금액을 못 고친다');

  // ---- G. 다른 학원 원장은 남의 청구서를 못 본다
  const { data: bc } = await admin.from('academies').insert({ slug: `bill-b-${rnd}`, name: '옆 학원' }).select().single();
  academies.push(bc.id);
  const P_DIR_B = '0109' + num() + '7'; const dirB = await mkUser('옆 원장', P_DIR_B); users.push(dirB);
  const { data: bm } = await admin.from('memberships').insert({ user_id: dirB, academy_id: bc.id, role: 'director' }).select().single();
  await admin.from('users').update({ active_membership_id: bm.id }).eq('id', dirB);
  const b = createClient(URL, ANON, { auth: { persistSession: false } });
  ok(!(await b.auth.signInWithPassword({ email: email(P_DIR_B), password: PW })).error, '옆 학원 원장 로그인');
  ok(((await b.from('invoices').select('id')).data ?? []).length === 0, '옆 학원 원장은 청구서를 하나도 못 본다');
  ok(((await b.from('payments').select('id')).data ?? []).length === 0, '납부 기록도 못 본다');
  ok(!!(await b.rpc('record_payment', { p_invoice: inv1.id, p_amount: 1000, p_method: 'cash' })).error, '남의 청구서에 납부를 못 적는다');
  ok(!!(await b.rpc('void_invoice', { p_invoice: inv1.id, p_memo: 'x' })).error, '남의 청구서를 못 면제한다');
  ok((await b.rpc('remind_unpaid', { p_ym: YM })).data === 0, '옆 학원에서 미납 안내를 돌려도 0');
  ok(!(await b.rpc('my_invoice', { p_ym: YM })).data?.length, '옆 학원 원장의 my_invoice 는 빈 줄');
} finally {
  await cleanup();
}

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: billing A~G (청구·형제 할인·납부·미납 안내·연체·면제·격리)');
