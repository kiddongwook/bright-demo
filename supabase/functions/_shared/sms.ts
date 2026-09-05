import { maskPhone, solapiCreds, solapiSendSms } from './solapi.ts';

/** 전역 솔라피 비밀값. 학원별 키가 있으면 solapiCreds 가 그쪽을 쓴다. */
export const solapiEnv = () => ({
  apiKey: Deno.env.get('SOLAPI_API_KEY') ?? '',
  apiSecret: Deno.env.get('SOLAPI_API_SECRET') ?? '',
  from: Deno.env.get('SOLAPI_FROM') ?? '',
});

// senderKey: 학원별 발신키 (0023 academy_settings). 주면 이 요청에만 그 키를 쓰고, 없으면 전역 값으로 간다.
// 콘솔 모드에서는 아무 차이가 없다 — 키가 실제로 나가는 자리는 대행사 REST 뿐이다.
// solapi 일 때 senderKey 는 "apiKey:apiSecret[:발신번호]" 로 읽는다 (docs/ops/outbox.md).
export async function sendSms(to: string, text: string, senderKey?: string | null): Promise<void> {
  const provider = Deno.env.get('SMS_PROVIDER') ?? 'console';
  if (provider === 'console') { console.log(`[SMS→${to}] ${text}`); return; }
  if (provider === 'solapi') {
    const r = await solapiSendSms({ to, text }, solapiCreds(senderKey, solapiEnv()));
    // 본문은 찍지 않는다 — 번호도 가린다. 무엇이 나갔는지는 outbox 행이 들고 있다.
    console.log(`[SMS→${maskPhone(to)}] solapi ${r.statusCode ?? ''} ${r.messageId}`);
    return;
  }
  if (provider === 'http') {
    const url = Deno.env.get('SMS_HTTP_URL')!;
    const key = senderKey ?? Deno.env.get('SMS_SENDER_KEY') ?? null;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (Deno.env.get('SMS_HTTP_TOKEN') ?? '') }, body: JSON.stringify({ to, text, ...(key ? { senderKey: key } : {}) }) });
    if (!r.ok) throw new Error('sms http ' + r.status);
    return;
  }
  throw new Error('unknown SMS_PROVIDER ' + provider);
}
/** 전화번호를 숫자만 남긴 꼴로. 전각 숫자·공백·대시를 지우고 국가번호(+82 10…)는 0 으로 되돌린다.
 *  app/src/lib/phone.ts 의 같은 함수와 글자 하나까지 같아야 한다 (INP-30/31). */
export const normalizePhone = (p: string) => {
  const s = (p ?? '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const d = s.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');
  const m = /^\+?82(\d+)$/.exec(d);
  return m ? '0' + m[1].replace(/^0+/, '') : d.replace(/\+/g, '');
};
/** 우리가 문자를 보낼 수 있는 휴대폰 모양인가. 010 은 11자리뿐이다(10자리는 011·016 등 옛 번호 — INP-36). */
export const isValidMobile = (p: string) => {
  const d = normalizePhone(p);
  return /^01[016789]\d{7,8}$/.test(d) && !(d.startsWith('010') && d.length !== 11);
};
export async function sha256(s: string) { const b = new TextEncoder().encode(s); const h = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
// 프리플라이트: 204 에는 본문을 실으면 안 된다 (실으면 함수가 터지고 CORS 헤더 없이 실패한다)
export const cors = () => new Response(null, { status: 204, headers: CORS });
