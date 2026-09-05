import { fn, supabase } from './supabase';

/* BRIGHT 운영자(사장님) 화면이 쓰는 것들 — 0023 의 op_* RPC 와 Edge op-delete·export-academy.
   운영자는 어느 학원의 소속도 아니라 RLS 를 한 줄도 통과하지 못한다. 여기 있는 모든 읽기·쓰기는
   security-definer RPC 를 지나고, 그 함수들이 첫 줄에서 is_operator() 를 본다.
   문서: docs/ops/operator.md · 마이그레이션: supabase/migrations/0023_operator.sql */

export type OpAcademy = {
  id: string; slug: string; name: string; brand_color: string; logo_path: string | null;
  created_at: string; locked: boolean;
  students: number; parents_entered: number; parents_total: number; no_push: number;
  invoices_month: number; paid_month: number; sms_provider: SmsProvider;
};
export type SmsProvider = 'console' | 'http';
export type OpSms = { sms_provider: SmsProvider; sender_key_masked: string | null; updated_at: string | null };

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/* ── 읽기 ── */
export async function opAcademies(): Promise<OpAcademy[]> {
  return must(await supabase.rpc('op_academies')) as OpAcademy[];
}
/** 한 학원만 읽는 RPC 는 없다 — 목록에서 골라 쓴다(학원 수가 적어 한 번에 읽어도 싸다). */
export const findAcademy = (list: OpAcademy[] | null, id: string): OpAcademy | null =>
  list?.find(a => a.id === id) ?? null;

/* ── 학원 만들기 · 원장 초대 ── */
export async function opCreateAcademy(slug: string, name: string, directorPhone: string, directorName: string, brandColor: string | null): Promise<{ academy_id: string; invite_url: string }> {
  const rows = must(await supabase.rpc('op_create_academy', {
    p_slug: slug, p_name: name, p_director_phone: directorPhone, p_director_name: directorName, p_brand_color: brandColor,
  })) as { academy_id: string; invite_url: string }[];
  if (!rows?.length) throw new Error('no_result');
  return rows[0];
}
/** 원장 초대 링크 다시 만들기 — 옛 링크는 이 순간 죽는다. 돌아오는 값은 완성된 주소다(서버의 app_url 기준). */
export async function opDirectorInvite(academyId: string): Promise<string> {
  return must(await supabase.rpc('op_director_invite', { p_academy: academyId })) as string;
}

/* ── 잠금 · 발신 설정 ── */
export async function opSetLock(academyId: string, locked: boolean): Promise<boolean> {
  return must(await supabase.rpc('op_set_lock', { p_academy: academyId, p_locked: locked })) as boolean;
}
export async function opGetSms(academyId: string): Promise<OpSms> {
  const rows = must(await supabase.rpc('op_get_sms', { p_academy: academyId })) as OpSms[];
  return rows?.[0] ?? { sms_provider: 'console', sender_key_masked: null, updated_at: null };
}
/** key: null = 키는 그대로 두고 모드만 바꾼다. '' = 키를 지운다(전역 값으로 되돌아간다). */
export async function opSetSms(academyId: string, provider: SmsProvider, key: string | null): Promise<void> {
  must(await supabase.rpc('op_set_sms', { p_academy: academyId, p_provider: provider, p_sender_key: key }));
}

/* ── 내려받기 · 삭제 ── */
/** 학원 데이터 통째로. 운영자는 ?academy=<id> 로 남의 학원도 받는다(export-academy 가 app_operators 를 본다). */
export async function opExport(academyId: string): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-academy?academy=${encodeURIComponent(academyId)}`, {
    method: 'POST', headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (session?.access_token ?? '') },
  });
  if (!r.ok) throw new Error(r.status === 403 ? 'not_operator' : '내려받지 못했어요 (' + r.status + ')');
  return await r.blob();
}
/** 학원 지우기 — 저장소(로고·공지 사진)를 먼저 비우고 op_delete_academy 를 부르는 Edge. slug 를 다시 받는다. */
export async function opDeleteAcademy(academyId: string, confirmSlug: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(fn('op-delete'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (session?.access_token ?? '') },
    body: JSON.stringify({ academy_id: academyId, confirm_slug: confirmSlug }),
  });
  const j = await r.json().catch(() => ({})) as { ok?: boolean; name?: string; error?: string };
  if (!r.ok || !j.ok) throw new Error(j.error ?? '지우지 못했어요 (' + r.status + ')');
  return j.name ?? '';
}

/* ── 순수 함수 (테스트) ── */

/** 학원 이름 → 주소(slug) 제안. 로마자 변환은 하지 않는다 — 영문·숫자만 남기고, 남는 게 없으면 빈 값(운영자가 손으로 적는다). */
export function suggestSlug(name: string): string {
  const s = (name ?? '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // 한글·공백·기호는 한 덩어리씩 붙임표로
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40)
    .replace(/-+$/, '');
  return s.length >= 2 ? s : '';
}
export const SLUG_RE = /^[a-z0-9-]{2,40}$/;
export const slugOk = (s: string) => SLUG_RE.test(s);

/** BASE_URL('/bright-demo/pwa/')의 한 칸 위 — 소개 페이지가 앉은 자리('/bright-demo/'). 로컬('/')이면 그대로 '/'. */
export function parentBase(base: string): string {
  const p = (base || '/').replace(/\/+$/, '');
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i + 1) : '/';
}
/** 학원 소개 페이지 — 앱(pwa) 한 칸 위의 랜딩. */
export const introUrl = (origin: string, base: string, slug: string) => `${origin}${parentBase(base)}?a=${slug}`;
/** 앱 주소 — 그 학원으로 열리는 링크. */
export const appUrl = (origin: string, base: string, slug: string) => `${origin}${base}?a=${slug}`;

/** 원장님께 보내는 초대 문구. url 은 서버(op_create_academy·op_director_invite)가 준 완성된 주소다. */
export function directorInviteText(academyName: string, url: string): string {
  return `[BRIGHT] ${academyName} 원장님 초대 — 링크를 누르면 바로 들어와요 (7일 안에)
아래 주소를 누르시면 인증번호 없이 원장으로 들어오세요.
${url}
처음 들어오시면 로고와 반·학생 명부를 넣으시면 됩니다.`;
}

/** 클립보드에 복사. 막히면(권한 없음·API 없음) false — 부르는 쪽이 직접 복사할 칸을 펼친다. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) throw new Error('no clipboard');
    await navigator.clipboard.writeText(text);
    return true;
  } catch { return false; }
}
