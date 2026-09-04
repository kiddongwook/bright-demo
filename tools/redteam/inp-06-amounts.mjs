// inp-06 금액 — set_invoice_amount / record_payment / fee_plans / invoices 직접
import { admin, setup, teardown, F, held, report } from './inp-lib.mjs';

const ctx = await setup('amount');
console.log('academy', ctx.slug);
const D = ctx.d;

const mkInvoice = async (total = 100000) => (await D.from('invoices').insert({
  academy_id: ctx.A, student_id: ctx.student.id, period_ym: '2026-09', amount: total, discount: 0, textbook: 0,
  total, due_date: '2026-09-05', status: 'issued',
}).select('id').single()).data;

console.log('--- set_invoice_amount ---');
for (const [a, d, t, why] of [[-1, 0, 0, '음수 금액'], [0, 0, 0, '0원'], [1.5, 0, 0, '소수'], [1e9, 0, 0, '10억'], [2147483648, 0, 0, 'int 넘김'], [1000, 5000, 0, '할인이 금액보다 큼'], [null, null, null, 'null']]) {
  await admin.from('invoices').delete().eq('academy_id', ctx.A);
  const inv = await mkInvoice();
  const r = await D.rpc('set_invoice_amount', { p_invoice: inv.id, p_amount: a, p_discount: d, p_textbook: t });
  const { data: after } = await admin.from('invoices').select('amount, discount, textbook, total, status').eq('id', inv.id).single();
  console.log(JSON.stringify({ why, in: [a, d, t], err: r.error?.message?.slice(0, 60) ?? null, after }));
  if (r.error) { held(`set_invoice_amount ${why} 거절`, r.error.message.slice(0, 60)); continue; }
  if (after.total < 0) {
    F('INP-50', '중간', `set_invoice_amount 가 총액 음수를 만든다 (${why}: 금액 ${after.amount} − 할인 ${after.discount} = ${after.total}) — 각 칸만 >= 0 을 보고 합계는 안 본다. recalc_invoice 는 total>0 이 아니면 납부로 치지 않아 상태가 '${after.status}' 로 굳고, 학부모 카드에 마이너스 금액이 뜬다`,
      'tools/redteam/inp-06-amounts.mjs (set_invoice_amount)',
      `0014_billing_manual.sql set_invoice_amount: check 는 p_amount/p_discount/p_textbook 각각 < 0 뿐. 결과 total=${after.total}, status=${after.status}`);
  }
  if (why === '10억' && after.total === 1e9) F('INP-51', '낮음', '청구 금액에 상한이 없다 — 10억 원 청구서가 만들어진다', 'tools/redteam/inp-06-amounts.mjs', `total=${after.total}`);
}

console.log('--- record_payment ---');
{
  await admin.from('invoices').delete().eq('academy_id', ctx.A);
  const inv = await mkInvoice(100000);
  for (const [amt, why] of [[-1, '음수'], [0, '0원'], [1.5, '소수'], [1e9, '10억(초과 납부)'], [2147483648, 'int 넘김'], [null, 'null']]) {
    const r = await D.rpc('record_payment', { p_invoice: inv.id, p_amount: amt, p_method: 'cash', p_memo: null });
    const { data: after } = await admin.from('invoices').select('total, status').eq('id', inv.id).single();
    const { data: pays } = await admin.from('payments').select('amount').eq('invoice_id', inv.id);
    console.log(JSON.stringify({ why, amt, err: r.error?.message?.slice(0, 70) ?? null, status: after.status, pays: pays.map(p => p.amount) }));
    if (r.error) { held(`record_payment ${why} 거절`, r.error.message.slice(0, 60)); continue; }
    if (amt === 1e9) F('INP-52', '낮음', '청구액을 훨씬 넘는 납부를 그대로 적는다 (10억 원 vs 청구 10만 원) — 초과 납부 검사가 없다', 'tools/redteam/inp-06-amounts.mjs (record_payment)', `payments ${JSON.stringify(pays.map(p => p.amount))}, invoice status=${after.status}`);
    await admin.from('payments').delete().eq('invoice_id', inv.id);
    await admin.rpc("recalc_invoice", { p_invoice: inv.id });
  }
}

console.log('--- fee_plans.amount ---');
for (const [amt, why] of [[-1, '음수'], [0, '0원'], [1.5, '소수'], [1e9, '10억'], [2147483648, 'int 넘김']]) {
  const r = await D.from('fee_plans').insert({ academy_id: ctx.A, class_id: null, name: '적대 ' + why, amount: amt, active: true }).select('id, amount').single();
  console.log(JSON.stringify({ why, amt, err: r.error?.message?.slice(0, 60) ?? null, got: r.data?.amount }));
  if (r.error) held(`fee_plans.amount ${why} 거절`, r.error.message.slice(0, 60));
  else { if (amt === 1e9) F('INP-53', '낮음', '요금제 금액에 상한이 없다', 'tools/redteam/inp-06-amounts.mjs', `amount=${r.data.amount}`); await D.from('fee_plans').delete().eq('id', r.data.id); }
}

console.log('--- invoices 직접 insert (원장 RLS) ---');
{
  const r = await D.from('invoices').insert({ academy_id: ctx.A, student_id: ctx.student.id, period_ym: '2026-10', amount: -50000, discount: -1, textbook: -1, total: -50002, due_date: '2026-10-05', status: 'paid' }).select('id, total, status').single();
  if (r.error) held('invoices 음수 직접 insert 거절', r.error.message.slice(0, 80));
  else {
    F('INP-54', '중간', "invoices 표에 금액 check 가 하나도 없다 — 원장 RLS 로 음수 total·status='paid' 를 그대로 넣을 수 있다 (RPC 를 우회한 모든 경로가 무방비)",
      'tools/redteam/inp-06-amounts.mjs (invoices 직접)', `insert 성공 total=${r.data.total}, status=${r.data.status}. 0003_billing.sql invoices 정의에 amount/total check 없음 (payments.amount>0, fee_plans.amount>=0 은 있다)`);
    await D.from('invoices').delete().eq('id', r.data.id);
  }
}

await admin.from('invoices').delete().eq('academy_id', ctx.A);
report('inp-06 금액');
await teardown(ctx);
