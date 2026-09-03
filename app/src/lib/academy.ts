import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** 문(Gate) 을 포함해 로그인 전 화면이 "어느 학원이냐" 를 아는 유일한 방법 — 주소의 ?a=<slug>, 없으면 이 기기에 마지막으로 저장된 값. */
export const DEFAULT_SLUG = 'yeongeo';
const SLUG_KEY = 'academy_slug';
const SLUG_RE = /^[a-z0-9-]{2,40}$/;

export function currentSlug(): string {
  try {
    const q = new URLSearchParams(location.search).get('a');
    if (q && SLUG_RE.test(q)) { try { localStorage.setItem(SLUG_KEY, q); } catch { /* 저장 안 돼도 이번 방문엔 쓴다 */ } return q; }
    const saved = localStorage.getItem(SLUG_KEY);
    if (saved) return saved;
  } catch { /* 프라이빗 모드 등 — 기본값으로 */ }
  return DEFAULT_SLUG;
}

export async function publicAcademy(slug: string): Promise<{ name: string; brand_color: string } | null> {
  const { data, error } = await supabase.rpc('public_academy', { p_slug: slug });
  if (error || !data || !data.length) return null;
  return data[0];
}

/** 로그인 전 화면(Otp·LinkEntry) 의 로고 alt 용 — 이름이 오기 전엔 '학원'. */
export function useAcademyName(): string {
  const [name, setName] = useState('학원');
  useEffect(() => {
    let alive = true;
    publicAcademy(currentSlug()).then(a => { if (alive && a) setName(a.name); });
    return () => { alive = false; };
  }, []);
  return name;
}
