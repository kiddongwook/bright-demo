// 솔라피(Solapi) 어댑터 — 문자(SMS/LMS) 와 알림톡(ATA) 이 REST 한 곳으로 나간다.
//   POST https://api.solapi.com/messages/v4/send-many/detail
//   Authorization: HMAC-SHA256 apiKey=…, date=…, salt=…, signature=…
//   signature = HMAC-SHA256(date + salt, apiSecret) 의 hex
// 근거로 삼은 공식 SDK 소스(문서 사이트가 리다이렉트로 막혀 있어 소스를 봤다) — URL 은 docs/ops/outbox.md 에 적어 뒀다.
//
// 이 파일은 **아무 것도 import 하지 않고 Deno.env 도 읽지 않는다.** 두 가지 이유다.
//  1) 환경변수 읽기는 부르는 쪽(sms.ts · alimtalk.ts)에 두어야 어댑터가 순수해진다.
//  2) tools/sms-test.mjs 가 이 조각을 그대로 Node 로 옮겨 쓴다 (Node 도 Web Crypto 가 전역이다).
// 로그에 본문과 번호를 통째로 찍지 않는다 — 번호는 maskPhone 을 거친다.

const API_URL = 'https://api.solapi.com/messages/v4/send-many/detail';
const SALT_ALPHABET = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type SolapiCreds = { apiKey: string; apiSecret: string; from: string };
export type SolapiResult = { groupId: string | null; messageId: string; statusCode: string | null };

/** 로그용 번호 가리기: 01012345678 → 010****5678. 짧으면 통째로 가린다. */
export const maskPhone = (p: string): string => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.length < 8 ? '***' : d.slice(0, 3) + '*'.repeat(d.length - 7) + d.slice(-4);
};

/** 번호를 숫자만 남긴 꼴로. _shared/sms.ts 의 normalizePhone 과 결과가 같아야 한다
 *  (여기 따로 둔 건 이 파일을 import 없는 순수 조각으로 지키기 위해서다 — 고칠 땐 양쪽을 같이 고친다). */
export const toDigits = (p: string): string => {
  const s = (p ?? '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const d = s.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');
  const m = /^\+?82(\d+)$/.exec(d);
  return m ? '0' + m[1].replace(/^0+/, '') : d.replace(/\+/g, '');
};

/** 국내 문자 과금 단위는 EUC-KR 바이트다 — 한글·한자·이모지 2, 아스키 1.
 *  _shared/alimtalk.ts 의 cutBytes 는 UTF-8(한글 3) 로 2,000바이트 상한을 보는 다른 셈이다. 섞지 말 것. */
export function eucKrBytes(s: string): number {
  let n = 0;
  for (const ch of s ?? '') n += (ch.codePointAt(0) ?? 0) < 128 ? 1 : 2;
  return n;
}
/** 90바이트를 넘으면 LMS. 단문·장문 요율이 다르니 이 경계가 곧 돈이다. */
export const smsType = (text: string): 'SMS' | 'LMS' => (eucKrBytes(text) > 90 ? 'LMS' : 'SMS');

/** 요청마다 새로 만든다 (date+salt 가 매번 달라야 한다). */
export async function solapiAuthHeader(apiKey: string, apiSecret: string): Promise<string> {
  if (!apiKey || !apiSecret) throw new Error('solapi: apiKey/apiSecret 이 비어 있다');
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let salt = '';
  for (const b of bytes) salt += SALT_ALPHABET[b % SALT_ALPHABET.length];
  const date = new Date().toISOString();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(date + salt));
  const signature = [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, '0')).join('');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

/** 학원별 키(0023 academy_settings.sms_sender_key)는 한 칸에 "apiKey:apiSecret[:발신번호]" 로 넣는다.
 *  모양이 아니면 **던진다** — 엉뚱한 계정으로 과금되느니 그 줄을 읽을 수 있는 사유로 실패시키는 게 낫다.
 *  senderKey 가 없으면 전역값(fallback)으로 간다. */
export function solapiCreds(senderKey: string | null | undefined, fallback: Partial<SolapiCreds>): SolapiCreds {
  if (senderKey) {
    const parts = String(senderKey).split(':');
    if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) {
      throw new Error('solapi: 학원 발신키 모양이 아니다 (apiKey:apiSecret[:발신번호])');
    }
    const from = toDigits(parts[2] ?? fallback.from ?? '');
    if (!from) throw new Error('solapi: 발신번호가 없다 (학원 키 3번째 칸이나 SOLAPI_FROM)');
    return { apiKey: parts[0], apiSecret: parts[1], from };
  }
  const apiKey = fallback.apiKey ?? '', apiSecret = fallback.apiSecret ?? '';
  if (!apiKey || !apiSecret) throw new Error('solapi: SOLAPI_API_KEY / SOLAPI_API_SECRET 이 없다');
  const from = toDigits(fallback.from ?? '');
  if (!from) throw new Error('solapi: SOLAPI_FROM(등록 발신번호) 이 없다');
  return { apiKey, apiSecret, from };
}

type SolapiMessage = {
  to: string; from: string; text?: string; type: 'SMS' | 'LMS' | 'ATA';
  kakaoOptions?: { pfId: string; templateId: string; variables: Record<string, string>; disableSms: boolean };
};

/** 오류를 짧은 한 줄로 — outbox.last_error 는 300자에서 잘린다. 본문·번호는 넣지 않는다. */
const short = (s: unknown, n = 160) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** 한 건 보내고 결과를 읽는다. showMessageList 를 켜야 응답에 messageId 가 들어온다(provider_msg_id 로 쓴다).
 *  성공·실패의 갈림은 failedMessageList 에 들어 있느냐다 — statusCode 값을 손으로 판정하지 않는다. */
async function post(messages: SolapiMessage[], creds: SolapiCreds): Promise<SolapiResult> {
  const auth = await solapiAuthHeader(creds.apiKey, creds.apiSecret);
  let r: Response;
  try {
    r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: auth },
      body: JSON.stringify({ messages, showMessageList: true }),
    });
  } catch (e) {
    throw new Error('solapi: 연결 실패 ' + short((e as Error)?.message ?? e, 100));
  }
  const raw = await r.text();
  // deno-lint-ignore no-explicit-any
  let j: any = null;
  try { j = JSON.parse(raw); } catch { /* 본문이 JSON 이 아니면 상태코드만으로 말한다 */ }
  if (!r.ok) throw new Error(short(`solapi ${r.status} ${j?.errorCode ?? ''} ${j?.errorMessage ?? raw}`, 200));
  const failed = j?.failedMessageList?.[0];
  if (failed) throw new Error(short(`solapi ${failed.statusCode ?? '?'} ${failed.statusMessage ?? 'failed'}`, 200));
  const groupId: string | null = j?.groupInfo?.groupId ?? null;
  const item = j?.messageList?.[0];
  const messageId: string | undefined = item?.messageId;
  if (!messageId) throw new Error(short(`solapi: 응답에 messageId 가 없다 (groupId ${groupId ?? '?'} status ${j?.groupInfo?.status ?? '?'})`, 200));
  return { groupId, messageId: String(messageId), statusCode: item?.statusCode ?? null };
}

/** 문자 한 건. 90바이트(EUC-KR)를 넘으면 LMS 로 올려 보낸다. */
export function solapiSendSms(m: { to: string; from?: string; text: string }, creds: SolapiCreds): Promise<SolapiResult> {
  const to = toDigits(m.to);
  if (!to) throw new Error('solapi: 받는 번호가 비어 있다');
  return post([{ to, from: toDigits(m.from ?? creds.from), text: m.text, type: smsType(m.text) }], creds);
}

/** 알림톡 한 건. disableSms=false 라서 카톡이 안 되는 번호면 **솔라피가 알아서** fallbackText 를 문자로 보낸다
 *  (그래서 from 이 등록 발신번호여야 한다 — 없으면 대체 없이 실패한다). 우리 쪽 문자 대체와 겹치는 자리는 docs/ops/outbox.md 참고. */
export function solapiSendAlimtalk(
  m: { to: string; from?: string; pfId: string; templateId: string; variables: Record<string, string>; fallbackText: string },
  creds: SolapiCreds,
): Promise<SolapiResult> {
  const to = toDigits(m.to);
  if (!to) throw new Error('solapi: 받는 번호가 비어 있다');
  if (!m.pfId || !m.templateId) throw new Error('solapi: pfId/templateId 가 없다');
  return post([{
    to, from: toDigits(m.from ?? creds.from), text: m.fallbackText, type: 'ATA',
    kakaoOptions: { pfId: m.pfId, templateId: m.templateId, variables: m.variables ?? {}, disableSms: false },
  }], creds);
}
