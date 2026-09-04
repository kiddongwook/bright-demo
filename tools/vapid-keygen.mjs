// VAPID 키 한 쌍을 만든다 (웹 푸시 서명용, RFC 8292). 값은 이 화면에 딱 한 번만 나온다 — 저장소·문서에 적지 말 것.
// node vapid-keygen.mjs
import { webcrypto } from 'node:crypto';

const b64url = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64url(new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey)));   // 65바이트 uncompressed point
const priv = (await webcrypto.subtle.exportKey('jwk', kp.privateKey)).d;                     // 32바이트 스칼라 (이미 base64url)

console.log('VAPID 키를 만들었습니다. 아래 값은 지금 이 화면에만 나옵니다.\n');
console.log(`VAPID_PUBLIC_KEY=${pub}`);
console.log(`VAPID_PRIVATE_KEY=${priv}`);
console.log('VAPID_SUBJECT=mailto:<운영자 이메일>');
console.log(`\n앱(빌드 시점 공개값)에도 같은 공개키를 넣습니다:\nVITE_VAPID_PUBLIC=${pub}`);
console.log(`
넣을 곳 (셋 다 필요합니다)
  1. .env.local  — 위 네 줄을 그대로 붙입니다 (VAPID_SUBJECT 의 이메일만 채웁니다).
  2. Edge 비밀값 — npx supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:…
  3. app/.env     — VITE_VAPID_PUBLIC=… (공개키만. 앱 빌드에 들어갑니다)
개인키는 한 번 잃어버리면 복구할 수 없고, 바꾸면 이미 등록된 구독이 전부 무효가 됩니다(모두 다시 켜야 합니다).`);
