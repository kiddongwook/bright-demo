// 솔라피 문자 한 통 실제로 보내 보기 — 키를 꽂고 나서 "정말 나가는가" 를 확인하는 자리.
//   cd tools && node --env-file=../.env.local sms-test.mjs 01012345678 ["보낼 문구"]
//
// 키(SOLAPI_API_KEY · SOLAPI_API_SECRET · SOLAPI_FROM)가 없으면 **아무 것도 보내지 않고**
// 무엇을 보낼 뻔했는지만 찍고 0 으로 끝난다 — 회귀 스크립트가 그냥 돌려도 안전하다.
//
// 여기 든 auth·본문 만들기는 supabase/functions/_shared/solapi.ts 를 그대로 옮긴 것이다(Node 도 Web Crypto 가 전역).
// 한쪽을 고치면 다른 쪽도 같이 고친다.

const API_URL = 'https://api.solapi.com/messages/v4/send-many/detail';
const SALT_ALPHABET = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const maskPhone = (p) => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.length < 8 ? '***' : d.slice(0, 3) + '*'.repeat(d.length - 7) + d.slice(-4);
};
const toDigits = (p) => {
  const s = (p ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const d = s.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');
  const m = /^\+?82(\d+)$/.exec(d);
  return m ? '0' + m[1].replace(/^0+/, '') : d.replace(/\+/g, '');
};
function eucKrBytes(s) {
  let n = 0;
  for (const ch of s ?? '') n += (ch.codePointAt(0) ?? 0) < 128 ? 1 : 2;
  return n;
}
const smsType = (text) => (eucKrBytes(text) > 90 ? 'LMS' : 'SMS');

async function solapiAuthHeader(apiKey, apiSecret) {
  if (!apiKey || !apiSecret) throw new Error('solapi: apiKey/apiSecret 이 비어 있다');
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let salt = '';
  for (const b of bytes) salt += SALT_ALPHABET[b % SALT_ALPHABET.length];
  const date = new Date().toISOString();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(date + salt));
  const signature = [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

// ---- 입력
const [, , rawTo, rawText] = process.argv;
if (!rawTo) {
  console.error('쓰는 법: node --env-file=../.env.local sms-test.mjs 01012345678 ["보낼 문구"]');
  process.exit(2);
}
const to = toDigits(rawTo);
if (!/^01[016789]\d{7,8}$/.test(to) || (to.startsWith('010') && to.length !== 11)) {
  console.error(`받는 번호가 휴대폰 모양이 아니다: ${maskPhone(rawTo)}`);
  process.exit(2);
}
const text = rawText ?? '[BRIGHT] 문자 발송 시험입니다. 이 문자를 받으셨다면 설정이 끝난 것입니다.';
const apiKey = process.env.SOLAPI_API_KEY ?? '';
const apiSecret = process.env.SOLAPI_API_SECRET ?? '';
const from = toDigits(process.env.SOLAPI_FROM ?? '');
const type = smsType(text);

console.log(`받는 번호 : ${maskPhone(to)}`);
console.log(`발신번호   : ${from ? maskPhone(from) : '(SOLAPI_FROM 없음)'}`);
console.log(`종류       : ${type} (${eucKrBytes(text)} 바이트 / 90 이 경계)`);
console.log(`문구       : ${text}`);

// ---- 키가 없으면 여기서 끝 (보내지 않는다)
if (!apiKey || !apiSecret || !from) {
  const missing = [!apiKey && 'SOLAPI_API_KEY', !apiSecret && 'SOLAPI_API_SECRET', !from && 'SOLAPI_FROM'].filter(Boolean);
  console.log(`\n건너뜀: ${missing.join(', ')} 가 .env.local 에 없다. 위 내용으로 보낼 참이었다 (실제 발송 없음).`);
  console.log('키를 받는 순서는 docs/ops/alimtalk.md "솔라피 준비" 를 본다.');
  process.exit(0);
}

// ---- 실제 발송 한 건
const body = { messages: [{ to, from, text, type }], showMessageList: true };
const r = await fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: await solapiAuthHeader(apiKey, apiSecret) },
  body: JSON.stringify(body),
});
const raw = await r.text();
let j = null;
try { j = JSON.parse(raw); } catch { /* JSON 이 아니면 상태코드만으로 말한다 */ }

if (!r.ok) {
  console.error(`\nFAIL HTTP ${r.status} ${j?.errorCode ?? ''} ${j?.errorMessage ?? raw.slice(0, 300)}`);
  process.exit(1);
}
const failed = j?.failedMessageList?.[0];
const item = j?.messageList?.[0];
console.log(`\ngroupId    : ${j?.groupInfo?.groupId ?? '(없음)'}`);
console.log(`group 상태 : ${j?.groupInfo?.status ?? '(없음)'}`);
console.log(`건수       : ${JSON.stringify(j?.groupInfo?.count ?? {})}`);
if (failed) {
  console.error(`FAIL 접수 실패 statusCode=${failed.statusCode} ${failed.statusMessage ?? ''}`);
  console.error('statusCode 뜻은 docs/ops/outbox.md "솔라피 오류 읽기" 를 본다.');
  process.exit(1);
}
console.log(`messageId  : ${item?.messageId ?? '(없음)'}`);
console.log(`statusCode : ${item?.statusCode ?? '(없음)'} ${item?.statusMessage ?? ''}`);
console.log(`잔액       : ${JSON.stringify(j?.groupInfo?.balance ?? {})}`);
console.log('\nOK 접수됐다. 실제 도착 여부는 폰과 솔라피 콘솔의 발송 내역에서 본다.');
