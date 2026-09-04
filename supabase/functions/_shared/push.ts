import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { TEMPLATES } from './alimtalk.ts';

// 웹 푸시(RFC 8291/8292). 건당 비용이 없어 카톡보다 먼저 간다.
// 라이브러리: npm:web-push 는 node:https · crypto.createECDH/createSign 에 기대어 Supabase Edge(Deno) 에서 못 쓴다.
// jsr:@negrel/webpush 는 fetch + SubtleCrypto 만 쓴다 — 그래서 이걸 쓴다.
// 비밀값: VAPID_PUBLIC_KEY(=클라이언트의 VITE_VAPID_PUBLIC, base64url raw 65바이트), VAPID_PRIVATE_KEY(base64url d 32바이트), VAPID_SUBJECT(mailto:…).
// PUSH_DRY_RUN=1 이면 아무 데도 보내지 않고 성공으로 친다(개발·회귀 테스트).

type P = Record<string, string>;
export type PushSub = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushOne = { id: string; ok: boolean; gone: boolean; error?: string };
export type PushPayload = { title: string; body: string; view: string; ref: string | null };

export const pushDryRun = () => Deno.env.get('PUSH_DRY_RUN') === '1';

/**
 * 알림 문구. 제목은 학원 이름, 본문은 알림톡 템플릿의 첫 줄(앞머리 [학원] 은 뗀다 — 제목에 이미 있다).
 * 카톡에 안 가는 종류(원장 대상 문의 접수·결석 신청, 학생 본인 출결)는 심사받은 템플릿이 없으므로
 * 트리거가 params 에 실어 준 알림 제목(params['알림'])을 그대로 쓴다.
 */
export function pushPayload(o: { template_code: string; params: P | null; link_view: string | null; link_ref: string | null }): PushPayload {
  const p = (o.params ?? {}) as P;
  const t = TEMPLATES[o.template_code];
  const body = t ? t.text(p).replace(/^\[[^\]]*\]\s*/, '') : (p['알림'] ?? '새 알림이 있어요.');
  return { title: p['학원'] ?? '학원', body: body.trim(), view: o.link_view ?? 'home', ref: o.link_ref ?? null };
}

const b64urlToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const bytesToB64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// base64url 로 둔 VAPID 키(웹 푸시 표준 모양) → 라이브러리가 받는 JWK 한 쌍
function vapidJwk(pub: string, priv: string): webpush.ExportedVapidKeys {
  const raw = b64urlToBytes(pub);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('bad VAPID_PUBLIC_KEY (raw uncompressed P-256, 65 bytes)');
  const x = bytesToB64url(raw.slice(1, 33)), y = bytesToB64url(raw.slice(33, 65));
  return {
    publicKey: { kty: 'EC', crv: 'P-256', x, y, ext: true, key_ops: ['verify'] },
    privateKey: { kty: 'EC', crv: 'P-256', x, y, d: priv, ext: true, key_ops: ['sign'] },
  };
}

let cached: Promise<webpush.ApplicationServer> | null = null;
function appServer(): Promise<webpush.ApplicationServer> {
  if (!cached) {
    const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY'), sub = Deno.env.get('VAPID_SUBJECT');
    if (!pub || !priv || !sub) throw new Error('vapid_not_configured');
    cached = (async () =>
      await webpush.ApplicationServer.new({
        contactInformation: sub,
        vapidKeys: await webpush.importVapidKeys(vapidJwk(pub, priv)),
      }))().catch((e) => { cached = null; throw e; });
  }
  return cached;
}

/** 그 사용자의 모든 구독에 보낸다. 결과는 구독 하나마다 — 404/410 은 gone(구독을 지운다). */
export async function sendPush(subs: PushSub[], payload: PushPayload): Promise<PushOne[]> {
  if (pushDryRun()) return subs.map((s) => ({ id: s.id, ok: true, gone: false }));
  const server = await appServer();
  const body = JSON.stringify(payload);
  const out: PushOne[] = [];
  for (const s of subs) {
    try {
      await server.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(body, { ttl: 86400 });
      out.push({ id: s.id, ok: true, gone: false });
    } catch (e) {
      const res = (e as { response?: Response }).response;
      const st = res?.status;
      out.push({
        id: s.id, ok: false, gone: st === 404 || st === 410,
        error: (st ? `push ${st} ${res!.statusText}` : String((e as Error)?.message ?? e)).slice(0, 200),
      });
    }
  }
  return out;
}
