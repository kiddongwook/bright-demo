// 푸시 발송 경로 프로브: 가짜 endpoint 구독 + 알림 1건 → outbox push 행 → outbox-send 호출 → last_error 가 "키" 문제가 아니라 "네트워크/endpoint" 문제인지 본다.
// node --env-file=../.env.local push-probe.mjs   (씨앗 학원 yeongeo 의 학부모 01012340001 사용, 끝나면 만든 행을 지운다)
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const phone = '01012340001';
const { data: u } = await sb.from('users').select('id').eq('phone', phone).single();
const { data: ac } = await sb.from('academies').select('id, name').eq('slug', 'yeongeo').single();
const endpoint = 'https://push.example.invalid/probe/' + crypto.randomUUID();
const { error: e1 } = await sb.from('push_subscriptions').insert({ user_id: u.id, endpoint, p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg', ua: 'probe' });
if (e1) { console.log('sub insert FAIL', e1.message); process.exit(1); }
const { data: n, error: e2 } = await sb.from('notifications').insert({ user_id: u.id, academy_id: ac.id, kind: 'notice', title: '[프로브] 푸시 경로 확인', link: 'home' }).select('id').single();
if (e2) { console.log('notification insert FAIL', e2.message); await sb.from('push_subscriptions').delete().eq('endpoint', endpoint); process.exit(1); }
const { data: rows } = await sb.from('outbox').select('id, channel, status').eq('idempotency_key', 'push:' + n.id);
console.log('outbox push rows:', rows?.length ?? 0);
const URL = process.env.SUPABASE_URL + '/functions/v1/outbox-send';
const r = await fetch(URL, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY, apikey: process.env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', 'X-Outbox-Key': process.env.OUTBOX_KEY }, body: '{}' });
console.log('outbox-send HTTP', r.status, (await r.text()).slice(0, 200));
const { data: after } = await sb.from('outbox').select('status, last_error, attempts').eq('idempotency_key', 'push:' + n.id).maybeSingle();
console.log('after:', JSON.stringify(after));
const { data: sub } = await sb.from('push_subscriptions').select('endpoint, failed_at').eq('endpoint', endpoint).maybeSingle();
console.log('subscription still there:', !!sub, sub?.failed_at ? '(failed_at set)' : '');
// 정리
await sb.from('outbox').delete().eq('idempotency_key', 'push:' + n.id);
await sb.from('notifications').delete().eq('id', n.id);
await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
console.log('cleaned');
