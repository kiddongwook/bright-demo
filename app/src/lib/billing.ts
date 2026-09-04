import { supabase } from './supabase';
import { getContext } from './api';

/* 수강료 — 수기 모드. 돈은 학원 계좌로 바로 가고(자금 비보관), 앱은 "누가 냈나"만 적는다.
   원장이 누르는 것은 전부 RPC(0014_billing_manual.sql). 규칙·요금제는 표를 직접 읽고 쓴다(RLS: 원장만). */

export type BillingRules = { billing_day: number; due_day: number; sibling_discount_pct: number; bank_info: string };
export type FeePlan = { id: string; class_id: string | null; name: string; amount: number };
export type InvStatus = 'issued' | 'paid' | 'partial' | 'overdue' | 'void';
export type PayMethod = 'transfer' | 'card' | 'cash' | 'pg';
export type Invoice = {
  id: string; student_id: string; student_name: string; classes: string[];
  period_ym: string; amount: number; discount: number; textbook: number; total: number; paid: number;
  due_date: string; status: InvStatus; paid_at: string | null; reminded_at: string | null; memo: string | null;
};
export type MyInvoice = {
  id: string; period_ym: string; amount: number; discount: number; textbook: number; total: number; paid: number;
  due_date: string; status: InvStatus; memo: string | null; bank_info: string | null; student_name: string;
};

export const DEFAULT_RULES: BillingRules = { billing_day: 1, due_day: 5, sibling_discount_pct: 0, bank_info: '' };
/* 금액 꼴은 lib/money.ts 한 곳에서 온다 — 여기서 다시 정의하면 두 벌이 갈라진다 */
export { fmtWon, fmtComma, parseWon } from './money';
/** 'YYYY-MM-DD' → "9/5" */
export const fmtDue = (iso: string) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}`; };
/** 'YYYY-MM' → 9 */
export const monthOf = (ym: string) => +ym.split('-')[1];

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/* ── 규칙·요금제 ── */
export async function getBillingRules(): Promise<BillingRules> {
  const r = must(await supabase.from('billing_rules').select('billing_day, due_day, sibling_discount_pct, bank_info').eq('academy_id', getContext().academyId).maybeSingle()) as BillingRules | null;
  return r ? { ...r, bank_info: r.bank_info ?? '' } : { ...DEFAULT_RULES };
}
export async function saveBillingRules(v: BillingRules) {
  must(await supabase.from('billing_rules').upsert({
    academy_id: getContext().academyId,
    billing_day: v.billing_day, due_day: v.due_day, sibling_discount_pct: v.sibling_discount_pct,
    bank_info: v.bank_info.trim() || null, updated_at: new Date().toISOString(),
  }));
}
export async function listFeePlans(): Promise<FeePlan[]> {
  return must(await supabase.from('fee_plans').select('id, class_id, name, amount').eq('active', true).order('created_at')) as FeePlan[];
}
export async function saveFeePlan(p: { id?: string; class_id: string | null; name: string; amount: number }) {
  const row = { class_id: p.class_id, name: p.name.trim(), amount: Math.max(0, Math.round(p.amount)) };
  if (p.id) must(await supabase.from('fee_plans').update(row).eq('id', p.id));
  else must(await supabase.from('fee_plans').insert({ academy_id: getContext().academyId, ...row }));
}
export async function deleteFeePlan(id: string) { must(await supabase.from('fee_plans').delete().eq('id', id)); }

/* ── 청구서 ── */
export async function listInvoices(ym: string): Promise<Invoice[]> {
  const rows = must(await supabase.from('invoices')
    .select('id, student_id, period_ym, amount, discount, textbook, total, due_date, status, paid_at, reminded_at, memo, students(name, enrollments(classes(name))), payments(amount)')
    .eq('period_ym', ym)) as any[];
  return rows.map(r => ({
    id: r.id, student_id: r.student_id, student_name: r.students?.name ?? '',
    classes: (r.students?.enrollments ?? []).map((e: any) => e.classes?.name).filter(Boolean),
    period_ym: r.period_ym, amount: r.amount, discount: r.discount, textbook: r.textbook, total: r.total,
    paid: (r.payments ?? []).reduce((a: number, p: any) => a + (p.amount ?? 0), 0),
    due_date: r.due_date, status: r.status, paid_at: r.paid_at, reminded_at: r.reminded_at, memo: r.memo,
  })).sort((a, b) => a.student_name.localeCompare(b.student_name, 'ko'));
}
export async function issueInvoices(ym: string): Promise<number> { return must(await supabase.rpc('issue_invoices', { p_ym: ym })) as number; }
export async function recordPayment(invoiceId: string, amount: number, method: PayMethod, memo?: string) {
  must(await supabase.rpc('record_payment', { p_invoice: invoiceId, p_amount: Math.round(amount), p_method: method, p_memo: memo ?? null }));
}
export async function voidInvoice(invoiceId: string, memo: string) { must(await supabase.rpc('void_invoice', { p_invoice: invoiceId, p_memo: memo })); }
export async function setInvoiceAmount(invoiceId: string, amount: number, discount: number, textbook: number) {
  must(await supabase.rpc('set_invoice_amount', { p_invoice: invoiceId, p_amount: Math.round(amount), p_discount: Math.round(discount), p_textbook: Math.round(textbook) }));
}
export async function saveInvoiceMemo(invoiceId: string, memo: string) {
  must(await supabase.from('invoices').update({ memo: memo.trim() || null }).eq('id', invoiceId));
}
export async function remindUnpaid(ym: string): Promise<number> { return must(await supabase.rpc('remind_unpaid', { p_ym: ym })) as number; }
export async function refreshOverdue(): Promise<number> { return must(await supabase.rpc('refresh_overdue')) as number; }

/* ── 학부모·학생: 지금 보고 있는 자녀의 이번 달 청구서 (계좌 안내는 staff 전용 표라 RPC 로 나온다) ── */
export async function myInvoice(ym: string): Promise<MyInvoice | null> {
  const rows = must(await supabase.rpc('my_invoice', { p_ym: ym })) as MyInvoice[];
  return rows?.[0] ?? null;
}
