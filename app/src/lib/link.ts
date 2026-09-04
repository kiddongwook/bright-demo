/** 알림톡 버튼 URL 은 https://<앱>/?l=<토큰>. 정적 호스팅에서 경로 재작성 없이 동작하게 쿼리로 둔다. */
export function parseLinkToken(search: string): string | null {
  const v = new URLSearchParams(search).get('l');
  return v && /^[0-9a-f]{32}$/.test(v) ? v : null;
}
/** 읽고 주소에서 지운다 — 새로고침·공유로 토큰이 다시 돌지 않게. */
export function takeLinkToken(): string | null {
  const t = parseLinkToken(location.search);
  if (t) { const u = new URL(location.href); u.searchParams.delete('l'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
  return t;
}

/** 개인 초대 링크는 https://<앱>/?a=<학원>&i=<토큰>. 토큰 모양은 알림톡 링크와 같은 32자 hex. */
export function parseInviteToken(search: string): string | null {
  const v = new URLSearchParams(search).get('i');
  return v && /^[0-9a-f]{32}$/.test(v) ? v : null;
}
/** 읽고 i 만 지운다 — ?a=(어느 학원이냐)는 남겨야 로그인 전 화면이 학원을 안다. */
export function takeInviteToken(): string | null {
  const t = parseInviteToken(location.search);
  if (t) { const u = new URL(location.href); u.searchParams.delete('i'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
  return t;
}

/** 푸시 알림을 눌러 앱이 새로 열릴 때 붙는 ?v=<화면>&r=<id>. 서비스워커가 만든다. */
export type NavParam = { view: string; ref: string | null };
export function parseNavParam(search: string): NavParam | null {
  const q = new URLSearchParams(search);
  const v = q.get('v'); const r = q.get('r');
  if (!v || !/^[a-z][a-z-]{1,23}$/.test(v)) return null;
  return { view: v, ref: r && /^[0-9a-zA-Z-]{1,64}$/.test(r) ? r : null };
}
/** 읽고 v·r 을 지운다 — 새로고침에 같은 화면으로 다시 튀지 않게. */
export function takeNavParam(): NavParam | null {
  const t = parseNavParam(location.search);
  if (t) { const u = new URL(location.href); u.searchParams.delete('v'); u.searchParams.delete('r'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
  return t;
}
