/* 답변 화면이 쓰는 것들 — api.ts 를 건드리지 않으려고 여기 따로 둔다. */
import { supabase } from './supabase';

/** 늘 있는 답변 세 개 — 최근 답변에 이미 있으면 겹치지 않게 걸러 낸다 */
export const FIXED_REPLIES = [
  '네, 확인했어요. 그날 보강 잡아 드릴게요.',
  '네, 준비물은 교재만 챙겨 주세요.',
  '확인 후 다시 연락드릴게요.',
];

/** 문의 본문 → FAQ 질문 (60자까지) */
export const faqQuestion = (body: string) => {
  const s = body.trim().replace(/\s+/g, ' ');
  return s.length > 60 ? s.slice(0, 59) + '…' : s;
};

/** 원장이 최근에 보낸 답변 중 서로 다른 것 몇 개 — 답변 칩으로 쓴다. */
export async function recentAnswers(limit = 5): Promise<string[]> {
  const { data, error } = await supabase.from('inquiries').select('answer, answered_at')
    .not('answer', 'is', null).order('answered_at', { ascending: false, nullsFirst: false }).limit(30);
  if (error) throw new Error(error.message);
  const seen = new Set<string>(FIXED_REPLIES);
  const out: string[] = [];
  for (const r of (data ?? []) as { answer: string | null }[]) {
    const a = (r.answer ?? '').trim();
    if (!a || seen.has(a)) continue;
    seen.add(a); out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}
