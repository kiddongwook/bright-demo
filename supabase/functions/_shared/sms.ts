export async function sendSms(to: string, text: string): Promise<void> {
  const provider = Deno.env.get('SMS_PROVIDER') ?? 'console';
  if (provider === 'console') { console.log(`[SMS→${to}] ${text}`); return; }
  if (provider === 'http') {
    const url = Deno.env.get('SMS_HTTP_URL')!;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (Deno.env.get('SMS_HTTP_TOKEN') ?? '') }, body: JSON.stringify({ to, text }) });
    if (!r.ok) throw new Error('sms http ' + r.status);
    return;
  }
  throw new Error('unknown SMS_PROVIDER ' + provider);
}
export const normalizePhone = (p: string) => (p ?? '').replace(/[^0-9]/g, '');
export async function sha256(s: string) { const b = new TextEncoder().encode(s); const h = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
// 프리플라이트: 204 에는 본문을 실으면 안 된다 (실으면 함수가 터지고 CORS 헤더 없이 실패한다)
export const cors = () => new Response(null, { status: 204, headers: CORS });
