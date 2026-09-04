// Attack: cross-academy director + parent against billing RPCs (issue_invoices/record_payment/void_invoice/
// set_invoice_amount/remind_unpaid/my_invoice) and direct PostgREST reads of invoices/payments of others.
import { admin, seedAcademy, login, held, hole, note, report, cleanup } from './_common.mjs';

const A = await seedAcademy('bilA');
const B = await seedAcademy('bilB');
const ym = '2026-09';
const due = '2026-09-05';
// invoices: A.S1 (parA1's child), A.S2 (other family in A), B.S1 (other academy)
const { data: invA1 } = await admin.from('invoices').insert({ academy_id: A.ac.id, student_id: A.s1.id, period_ym: ym, amount: 100000, total: 100000, due_date: due, status: 'issued' }).select().single();
const { data: invA2 } = await admin.from('invoices').insert({ academy_id: A.ac.id, student_id: A.s2.id, period_ym: ym, amount: 200000, total: 200000, due_date: due, status: 'issued' }).select().single();
const { data: invB1 } = await admin.from('invoices').insert({ academy_id: B.ac.id, student_id: B.s1.id, period_ym: ym, amount: 300000, total: 300000, due_date: due, status: 'issued' }).select().single();
await admin.from('payments').insert({ academy_id: B.ac.id, invoice_id: invB1.id, amount: 50000, method: 'cash' });

const dirA = await login(A.dir.phone, A.dir.mid);
const dirB = await login(B.dir.phone, B.dir.mid);
const parA1 = await login(A.par1.phone, A.par1.mid);

// ---- cross-academy director: dirA reaching into B ----
let r = await dirA.rpc('record_payment', { p_invoice: invB1.id, p_amount: 10000, p_method: 'cash' });
r.error ? held('dirA record_payment(B invoice) rejected: ' + r.error.message) : hole('높음', 'dirA recorded payment on B invoice');
r = await dirA.rpc('void_invoice', { p_invoice: invB1.id, p_memo: 'x' });
r.error ? held('dirA void_invoice(B) rejected: ' + r.error.message) : hole('높음', 'dirA voided B invoice');
r = await dirA.rpc('set_invoice_amount', { p_invoice: invB1.id, p_amount: 0, p_discount: 0, p_textbook: 0 });
r.error ? held('dirA set_invoice_amount(B) rejected: ' + r.error.message) : hole('높음', 'dirA changed B invoice amount');
// confirm B invoice untouched
const { data: chkB } = await admin.from('invoices').select('amount,total,status').eq('id', invB1.id).single();
chkB.amount === 300000 && chkB.status !== 'void' ? held('B invoice unchanged after dirA attacks') : hole('높음', 'B invoice mutated: ' + JSON.stringify(chkB));

// ---- parent calling director RPCs ----
r = await parA1.rpc('issue_invoices', { p_ym: ym }); r.error ? held('parent issue_invoices rejected') : hole('높음', 'parent issued invoices');
r = await parA1.rpc('record_payment', { p_invoice: invA1.id, p_amount: 1, p_method: 'cash' }); r.error ? held('parent record_payment rejected') : hole('높음', 'parent recorded payment');
r = await parA1.rpc('void_invoice', { p_invoice: invA1.id, p_memo: 'x' }); r.error ? held('parent void_invoice rejected') : hole('높음', 'parent voided invoice');
r = await parA1.rpc('set_invoice_amount', { p_invoice: invA1.id, p_amount: 0, p_discount: 0, p_textbook: 0 }); r.error ? held('parent set_invoice_amount rejected') : hole('높음', 'parent changed amount');
r = await parA1.rpc('remind_unpaid', { p_ym: ym }); r.error ? held('parent remind_unpaid rejected') : hole('중간', 'parent remind_unpaid');
r = await parA1.rpc('refresh_overdue'); r.error ? held('parent refresh_overdue rejected (is_staff)') : hole('중간', 'parent refresh_overdue succeeded');

// ---- my_invoice: sibling of another family / other academy ----
r = await parA1.rpc('my_invoice', { p_ym: ym });
(r.data?.length === 1 && r.data[0].student_name === A.s1.name) ? held('parent my_invoice returns only own child') : hole('중간', 'my_invoice own child odd: ' + JSON.stringify(r.data));
// my_invoice cannot take a target id (it filters my_student_ids); confirm it never returns S2/B by checking it never leaks their totals
note('my_invoice takes only p_ym; scoped by my_student_ids -> cannot address a sibling directly');

// ---- direct PostgREST reads of others' invoices/payments ----
let g = await parA1.from('invoices').select('id,total').eq('id', invA2.id);
(g.data?.length ?? 0) === 0 ? held('parent cannot read A.S2 invoice via PostgREST') : hole('높음', 'parent read other-family invoice: ' + JSON.stringify(g.data));
g = await parA1.from('invoices').select('id,total').eq('id', invB1.id);
(g.data?.length ?? 0) === 0 ? held('parent cannot read B invoice via PostgREST') : hole('높음', 'parent read cross-academy invoice');
g = await parA1.from('invoices').select('id');
const onlyOwn = (g.data ?? []).every(x => x.id === invA1.id);
onlyOwn ? held(`parent invoices list scoped to own child (${g.data?.length ?? 0})`) : hole('높음', 'parent invoices list leaked: ' + JSON.stringify(g.data));
g = await parA1.from('payments').select('id').eq('invoice_id', invB1.id);
(g.data?.length ?? 0) === 0 ? held('parent cannot read B payments') : hole('높음', 'parent read cross payments');

// ---- control: dirB can pay own invoice ----
r = await dirB.rpc('record_payment', { p_invoice: invB1.id, p_amount: 10000, p_method: 'cash' });
!r.error ? held('control: dirB paid own invoice OK') : note('control dirB pay failed: ' + r.error.message);

report();
await cleanup();
console.log('cleaned');
