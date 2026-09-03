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
