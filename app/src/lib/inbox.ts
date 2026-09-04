/* 답변 화면이 쓰는 것들 — api.ts 를 건드리지 않으려고 여기 따로 둔다. */
import { supabase } from './supabase';
import { getContext } from './api';

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

/** 답을 FAQ 로 올린다 — 같은 질문(대소문자·앞뒤 공백 무시)이 이미 있으면 답만 바꾼다.
    0017 의 unique index 가 마지막 방어라, 사이에 끼어든 삽입(23505)도 고치기로 되돌린다. */
export async function saveFaqDedup(q: string, a: string): Promise<'added' | 'updated'> {
  const key = q.trim().toLowerCase();
  const { data: rows, error: readErr } = await supabase.from('faqs').select('id, q, sort').order('sort');
  if (readErr) throw new Error(readErr.message);
  const list = (rows ?? []) as { id: string; q: string; sort: number }[];
  const hit = list.find(f => (f.q ?? '').trim().toLowerCase() === key);
  if (hit) {
    const { error } = await supabase.from('faqs').update({ q: q.trim(), a }).eq('id', hit.id);
    if (error) throw new Error(error.message);
    return 'updated';
  }
  const academyId = getContext().academyId;
  const { error } = await supabase.from('faqs').insert({ academy_id: academyId, q: q.trim(), a, sort: list.length + 1 });
  if (!error) return 'added';
  if (error.code !== '23505') throw new Error(error.message);
  /* 같은 질문이 방금 들어왔다 — 다시 찾아 답만 바꾼다 */
  const { data: again, error: e2 } = await supabase.from('faqs').select('id, q').order('sort');
  if (e2) throw new Error(e2.message);
  const now = ((again ?? []) as { id: string; q: string }[]).find(f => (f.q ?? '').trim().toLowerCase() === key);
  if (!now) throw new Error(error.message);
  const { error: e3 } = await supabase.from('faqs').update({ a }).eq('id', now.id);
  if (e3) throw new Error(e3.message);
  return 'updated';
}
