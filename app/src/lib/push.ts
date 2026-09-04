import { currentEnv } from './env';
import { linkToNav, type Role } from './nav';
import { hasPushSubscription, removePushSubscription, savePushSubscription } from './api';

/* 웹 푸시 — 설치한 앱에 네이티브처럼 알림이 온다. 실제 발송은 서버(outbox-send)가 하고,
   여기서는 "이 기기의 구독"만 만들고 지운다. 알림을 그리는 쪽은 public/push-sw.js. */

/** 공개 VAPID 키. 없으면 구독을 만들 수 없다(빌드에 넣지 않은 것) — subscribe() 가 'error'. */
export const VAPID_PUBLIC: string = import.meta.env.VITE_VAPID_PUBLIC ?? '';

/** VAPID 공개키(base64url) → applicationServerKey. 바이트를 하나씩 채운다 — Uint8Array.from 은 타입이 BufferSource 로 안 좁혀진다. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** 이 브라우저가 웹 푸시를 할 수 있나. iOS 는 홈 화면에 추가한 뒤에야 true 가 된다. */
export const isPushSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;

/** 브라우저 알림 권한. 물어본 적 없으면 'default', 사용자가 막았으면 'denied'. */
export const permissionState = (): NotificationPermission =>
  typeof Notification === 'undefined' ? 'denied' : Notification.permission;

/** 홈 화면에서 연 앱인가 — iOS 는 이게 아니면 푸시를 켤 수 없다. */
export const isStandalone = (): boolean => currentEnv() === 'installed';

/** 이 기기에 이미 만들어 둔 구독. 서비스워커가 아직 없으면 null. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  // ready 는 등록된 서비스워커가 없으면 영영 안 온다(개발·헤드리스) — getRegistration 으로 묻는다.
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return await reg.pushManager.getSubscription();
}

const toRow = (s: PushSubscription) => {
  const j = s.toJSON();
  return { endpoint: s.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' };
};

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'error';

/** 이 기기로 알림 받기 켜기. 권한 묻기가 먼저다 — 그 앞에 await 를 두면 iOS 가 "사용자가 누른 김" 을 잃는다. */
export async function subscribe(): Promise<PushResult> {
  if (!isPushSupported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  if (!VAPID_PUBLIC) return 'error';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'error';
    let sub = await reg.pushManager.getSubscription();
    // 이 기기엔 구독이 있는데 서버엔 내 행이 없다 = 남이 쓰던 기기다. 그 endpoint 는 지우고 새로 만든다
    // (남의 행은 RLS 가 가려서 지우지도 못하므로 그대로 넣으면 unique 충돌이 난다).
    if (sub && !(await hasPushSubscription(sub.endpoint))) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) });
    await savePushSubscription(toRow(sub));
    return 'ok';
  } catch { return 'error'; }
}

/** 끄기 — 이 기기의 구독을 없애고 서버 행도 지운다. 권한 자체는 브라우저 설정에 남는다. */
export async function unsubscribe(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch { /* 브라우저가 이미 지웠으면 그만 */ }
  await removePushSubscription(endpoint);
}

/** 알림이 보내온 화면 이름 → 실제 화면. 알림톡 링크(`<view>:<id>`)와 같은 표를 쓴다. */
export function pushToNav(view: string, ref: string | null, role: Role): { view: string; params: Record<string, string> } | null {
  if (!view) return null;
  return linkToNav(ref ? `${view}:${ref}` : view, role);
}
