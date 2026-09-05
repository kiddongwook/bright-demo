import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { TEMPLATES, clampParams, cut, renderTemplate } from './alimtalk.ts';

// 웹 푸시(RFC 8291/8292). 건당 비용이 없어 카톡보다 먼저 간다.
// 라이브러리: npm:web-push 는 node:https · crypto.createECDH/createSign 에 기대어 Supabase Edge(Deno) 에서 못 쓴다.
// jsr:@negrel/webpush 는 fetch + SubtleCrypto 만 쓴다 — 그래서 이걸 쓴다.
// 비밀값: VAPID_PUBLIC_KEY(=클라이언트의 VITE_VAPID_PUBLIC, base64url raw 65바이트), VAPID_PRIVATE_KEY(base64url d 32바이트), VAPID_SUBJECT(mailto:…).
// PUSH_DRY_RUN=1 이면 아무 데도 보내지 않고 성공으로 친다(개발·회귀 테스트).

type P = Record<string, string>;
export type PushSub = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushOne = { id: string; ok: boolean; gone: boolean; fatal: boolean; status?: number; error?: string };
export type PushPayload = { title: string; body: string; view: string; ref: string | null };

export const pushDryRun = () => Deno.env.get('PUSH_DRY_RUN') === '1';

/**
 * 알림 문구. 제목은 학원 이름, 본문은 알림톡 템플릿의 첫 줄(앞머리 [학원] 은 뗀다 — 제목에 이미 있다).
 * 카톡에 안 가는 종류(원장 대상 문의 접수·결석 신청, 학생 본인 출결)는 심사받은 템플릿이 없으므로
 * 트리거가 params 에 실어 준 알림 제목(params['알림'])을 그대로 쓴다.
 *
 * 출결 사유("10분"·"병원")는 심사받은 ATTENDANCE 템플릿에 칸이 없어 카톡에는 못 싣는다.
 * 푸시 문구는 우리가 쓰는 것이라 뒤에 ' · <사유>' 로 붙인다 — 앱 알림과 같은 내용이 보이게.
 * 사유는 0016_attendance_reason_param.sql 이 채널 push 줄의 params['사유'] 에만 실어 준다.
 */
export const PUSH_TITLE_MAX = 60, PUSH_BODY_MAX = 200;
export function pushPayload(o: { template_code: string; params: P | null; link_view: string | null; link_ref: string | null }): PushPayload {
  const p = clampParams(o.params as P | null);
  const academy = p['학원'] ?? '학원';
  let body = TEMPLATES[o.template_code] ? renderTemplate(o.template_code, p) : (p['알림'] ?? '새 알림이 있어요.');
  // 주간 요약(0029)은 카톡 템플릿이 없는 푸시 전용 — 제목("이번 주 지훈 요약")만 보내면 숫자가 빠진다.
  // 트리거가 params['요약'] 에 실어 준 본문을 제목 뒤에 붙인다(자녀 둘인 학부모가 누구 것인지 알 수 있게 제목을 남긴다).
  if (o.template_code === 'WEEKLY') body = [p['알림'], p['요약']].filter(Boolean).join(' · ') || body;
  // 앞머리 [학원] 은 뗀다 — 제목에 이미 있다. 학원 이름에 ']' 가 있어도 끊기지 않게 이름으로 먼저 맞춰 본다(INP-04).
  const head = `[${academy}] `;
  body = body.startsWith(head) ? body.slice(head.length) : body.replace(/^\[[^\]]*\]\s*/, '');
  const why = (p['사유'] ?? '').trim();
  if (o.template_code === 'ATTENDANCE' && why) body = body.trim() + ' · ' + why;
  // RFC 8291 aes128gcm 의 실효 평문 한도는 4KB — 제목·본문을 여기서 자른다(INP-01/02/71).
  return { title: cut(academy, PUSH_TITLE_MAX), body: cut(body.trim(), PUSH_BODY_MAX), view: o.link_view ?? 'home', ref: o.link_ref ?? null };
}

const b64urlToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const bytesToB64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// VAPID 키 → CryptoKeyPair. 개인키는 PKCS8(VAPID_PRIVATE_PKCS8, base64 DER) 을 우선 쓴다 — Deno 의 JWK 개인키 가져오기가
// "Unexpected error decoding private key" 를 내는 경우가 있어서. 없으면 JWK(d 스칼라) 로 시도한다.
const ALGO = { name: 'ECDSA', namedCurve: 'P-256' } as const;
function b64ToBytes(s: string): Uint8Array { return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)); }
async function vapidKeyPair(pub: string, priv: string, pkcs8: string | undefined): Promise<CryptoKeyPair> {
  const raw = b64urlToBytes(pub);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('bad VAPID_PUBLIC_KEY (raw uncompressed P-256, 65 bytes)');
  const publicKey = await crypto.subtle.importKey('raw', raw, ALGO, true, ['verify']);
  let privateKey: CryptoKey;
  if (pkcs8) privateKey = await crypto.subtle.importKey('pkcs8', b64ToBytes(pkcs8), ALGO, false, ['sign']);
  else {
    const x = bytesToB64url(raw.slice(1, 33)), y = bytesToB64url(raw.slice(33, 65));
    privateKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y, d: priv }, ALGO, false, ['sign']);
  }
  return { publicKey, privateKey };
}

let cached: Promise<webpush.ApplicationServer> | null = null;
function appServer(): Promise<webpush.ApplicationServer> {
  if (!cached) {
    const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY'), sub = Deno.env.get('VAPID_SUBJECT');
    const pkcs8 = Deno.env.get('VAPID_PRIVATE_PKCS8');
    if (!pub || (!priv && !pkcs8) || !sub) throw new Error('vapid_not_configured');
    cached = (async () =>
      await webpush.ApplicationServer.new({
        contactInformation: sub,
        vapidKeys: await vapidKeyPair(pub, priv ?? '', pkcs8),
      }))().catch((e) => { cached = null; throw e; });
  }
  return cached;
}

export async function sendPush(subs: PushSub[], payload: PushPayload): Promise<PushOne[]> {
  if (pushDryRun()) return subs.map((s) => ({ id: s.id, ok: true, gone: false, fatal: false }));
  const server = await appServer();
  const body = JSON.stringify(payload);
  const out: PushOne[] = [];
  for (const s of subs) {
    try {
      await server.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(body, { ttl: 86400 });
      out.push({ id: s.id, ok: true, gone: false, fatal: false });
    } catch (e) {
      const res = (e as { response?: Response }).response;
      const st = res?.status;
      // 404/410 = 지운 기기(구독을 지운다). 그 밖의 4xx(400·401·403·413…)는 다시 보내도 같은 답이 온다
      // = 되풀이할 값어치가 없다(fatal) → 곧바로 문자 대체로 넘긴다. 429·5xx·그물망 오류는 재시도한다.
      const fatal = !!st && st >= 400 && st < 500 && st !== 404 && st !== 410 && st !== 429;
      out.push({
        id: s.id, ok: false, gone: st === 404 || st === 410, fatal, status: st,
        error: (st ? `push ${st} ${res!.statusText}` : String((e as Error)?.message ?? e)).slice(0, 200),
      });
    }
  }
  return out;
}
