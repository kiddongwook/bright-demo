import { supabase } from './supabase';

/* 이용약관·개인정보 처리방침 동의 (0026).
   판 번호는 문서 첫 줄의 날짜와 같다. 문서를 고치면 여기 두 상수를 올린다 → 모두 한 번 다시 동의한다(docs/ops/legal.md).
   UX 게이트일 뿐 RLS 강제는 아니다 — 서버에 "어느 판에 언제 동의했다" 를 남기는 자리. */
export const TERMS_VERSION = '2026-09-05';
export const PRIVACY_VERSION = '2026-09-05';

/* 문서는 저장소 루트의 정적 페이지(GitHub Pages). 앱 안에서는 새 탭으로 연다. */
export const LEGAL_URLS = {
  terms: 'https://kiddongwook.github.io/bright-demo/legal/terms.html',
  privacy: 'https://kiddongwook.github.io/bright-demo/legal/privacy.html',
} as const;

export type ConsentRow = { terms_version: string; privacy_version: string; agreed_at: string };

/** 본인 동의 행. 없으면 null. */
export async function fetchConsent(): Promise<ConsentRow | null> {
  const { data, error } = await supabase.rpc('my_consent');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ConsentRow[];
  return rows[0] ?? null;
}

/** 지금 판에 동의 — 서버가 본인 행을 upsert 한다. */
export async function acceptTerms(): Promise<void> {
  const { error } = await supabase.rpc('accept_terms', { p_terms: TERMS_VERSION, p_privacy: PRIVACY_VERSION });
  if (error) throw new Error(error.message);
}

const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
/** 동의 화면을 띄워야 하나 — 행이 없거나, 어느 한 판이라도 지금 판보다 낮으면(모양이 이상해도) 참. 날짜 문자열이라 사전순 비교가 곧 날짜 비교다. */
export function needsConsent(row: ConsentRow | null | undefined, terms = TERMS_VERSION, privacy = PRIVACY_VERSION): boolean {
  if (!row) return true;
  if (!DATE.test(row.terms_version ?? '') || !DATE.test(row.privacy_version ?? '')) return true;
  return row.terms_version < terms || row.privacy_version < privacy;
}
