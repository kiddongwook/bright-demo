import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { logoUrl } from './logo';
import { applyInstallIdentity } from './manifest';

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

export type PublicAcademy = { name: string; brand_color: string; logo_path: string | null; wordmark_path: string | null; wordmark_dark_path: string | null };
export async function publicAcademy(slug: string): Promise<PublicAcademy | null> {
  const { data, error } = await supabase.rpc('public_academy', { p_slug: slug });
  if (error) return null;
  // 서버가 모르는 slug 는 기기에 남기지 않는다 — 다음 방문이 계속 "찾을 수 없어요" 에 갇히지 않게 (네트워크 오류일 땐 남긴다)
  if (!data || !data.length) { try { if (localStorage.getItem(SLUG_KEY) === slug) localStorage.removeItem(SLUG_KEY); } catch { /* 무시 */ } return null; }
  return data[0];
}

/** 로그인 전 화면(Gate·Otp·LinkEntry) 이 "어느 학원이냐" 를 아는 유일한 곳 — undefined = 아직 안 옴, null = 모르는 학원. */
export function useAcademyPublic(): PublicAcademy | null | undefined {
  const [a, setA] = useState<PublicAcademy | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const slug = currentSlug();
    publicAcademy(slug).then(r => {
      if (!alive) return;
      setA(r);
      // 홈 화면에 놓일 이름·아이콘·색을 이 학원 것으로 — 로그인 전에도(설치는 대개 로그인 전에 한다)
      if (r) applyInstallIdentity({ name: r.name, brandColor: r.brand_color, logoUrl: logoUrl(r.logo_path), slug });
    });
    return () => { alive = false; };
  }, []);
  return a;
}

/** 로그인 전 화면의 로고 alt 용 — 이름이 오기 전엔 '이 학원'. */
export function useAcademyName(): string {
  const a = useAcademyPublic();
  return a?.name ?? '이 학원';
}
