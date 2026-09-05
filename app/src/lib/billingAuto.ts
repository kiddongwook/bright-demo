import { supabase } from './supabase';
import { getContext } from './api';

/* 수강료 자동화 (0028_billing_auto.sql). 규칙 세 칸은 billing_rules 에 함께 있다(RLS: 원장만).
   lib/billing.ts 의 getBillingRules/saveBillingRules 는 자기 네 칸만 upsert 하고, 여기는 자동 세 칸만 upsert 한다 —
   PostgREST upsert 는 보낸 칸만 고치니 서로 덮어쓰지 않는다. */

export type AutoRules = { auto_issue: boolean; auto_remind: boolean; auto_remind_after_days: number };
export const DEFAULT_AUTO: AutoRules = { auto_issue: false, auto_remind: false, auto_remind_after_days: 3 };
export const REMIND_DAYS_MIN = 1;
export const REMIND_DAYS_MAX = 14;

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export async function getAutoRules(): Promise<AutoRules> {
  const r = must(await supabase.from('billing_rules').select('auto_issue, auto_remind, auto_remind_after_days')
    .eq('academy_id', getContext().academyId).maybeSingle()) as AutoRules | null;
  return r ? { ...r } : { ...DEFAULT_AUTO };
}

export async function setAutoRules(v: AutoRules) {
  const days = Math.min(REMIND_DAYS_MAX, Math.max(REMIND_DAYS_MIN, Math.round(v.auto_remind_after_days) || DEFAULT_AUTO.auto_remind_after_days));
  must(await supabase.from('billing_rules').upsert({
    academy_id: getContext().academyId,
    auto_issue: !!v.auto_issue, auto_remind: !!v.auto_remind, auto_remind_after_days: days,
    updated_at: new Date().toISOString(),
  }));
}

/** 설정 화면 "자동" 묶음의 한 줄 요약. 예) "매월 1일 자동 발행 · 납기 3일 뒤 미납 안내" / "꺼져 있어요" */
export function describeAuto(a: AutoRules, billingDay = 1): string {
  const parts: string[] = [];
  if (a.auto_issue) parts.push(`매월 ${billingDay}일 자동 발행`);
  if (a.auto_remind) parts.push(`납기 ${a.auto_remind_after_days}일 뒤 미납 안내`);
  return parts.length ? parts.join(' · ') : '꺼져 있어요';
}
