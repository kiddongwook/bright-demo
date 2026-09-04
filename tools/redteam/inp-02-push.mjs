// inp-02 푸시 구독의 적대 입력 (endpoint 10KB · non-https · 무한 등록) 과 그 결과인 알림톡 억제
import { admin, setup, teardown, drainOutbox, F, held, report, bytes } from './inp-lib.mjs';

const ctx = await setup('push');
console.log('academy', ctx.slug);
const P = ctx.p; // 학부모 JWT

const mkSub = (endpoint) => ({ user_id: ctx.momId, endpoint, p256dh: 'B'.repeat(87), auth: 'A'.repeat(22), ua: 'redteam' });

// 1) non-https endpoint
{
  const r = await P.from('push_subscriptions').insert(mkSub('http://192.0.2.1/redteam-' + Date.now())).select('id').single();
  if (r.error) held('non-https push endpoint 거절', r.error.message.slice(0, 100));
  else {
    F('INP-10', '중간', "push_subscriptions.endpoint 에 https·호스트 검증이 없다 — 학부모 JWT 로 아무 URL(http://, file://, javascript:) 이나 넣을 수 있다",
      'tools/redteam/inp-02-push.mjs (non-https)', `endpoint='http://192.0.2.1/…' insert 성공 (id ${r.data.id})`);
    // 2) 이 구독 하나가 알림톡을 끈다
    const n = await ctx.d.from('notices').insert({ academy_id: ctx.A, author_id: ctx.dirId, title: '구독 억제 시험', body: '' }).select('id').single();
    const ob = await drainOutbox(ctx.A);
    const chans = ob.map(o => o.channel);
    console.log('outbox channels with a bogus subscription →', JSON.stringify(chans));
    if (chans.includes('push') && !chans.includes('alimtalk')) {
      F('INP-11', '높음', "쓸모없는 푸시 구독 한 줄이 그 사람의 알림톡을 통째로 끈다 — 0013 trg_notification_outbox 는 has_push 만 보고(kakao_also 기본 false) 알림톡 행을 안 만들고, 죽은 endpoint 는 404/410 을 주지 않아 구독이 지워지지도 않아 그 사람은 어느 채널로도 알림을 못 받는다(영구)",
        'tools/redteam/inp-02-push.mjs (INP-11)',
        `가짜 endpoint 구독 1행 → 공지 1건 → outbox 채널 ${JSON.stringify(chans)} (alimtalk 없음). outbox-send 는 404/410 일 때만 구독을 지운다(_shared/push.ts sendPush: gone = st===404||st===410)`);
    } else held('가짜 구독이 있어도 알림톡이 함께 나간다', JSON.stringify(chans));
    await ctx.d.from('notices').delete().eq('id', n.data.id);
    await admin.from('notifications').delete().eq('academy_id', ctx.A);
    await P.from('push_subscriptions').delete().eq('id', r.data.id);
  }
}

// 3) 10KB endpoint (btree unique 인덱스 한도)
{
  const big = 'https://fcm.example/' + 'x'.repeat(10000);
  const r = await P.from('push_subscriptions').insert(mkSub(big)).select('id').single();
  if (r.error) held(`10KB endpoint 거절 (${bytes(big)}바이트)`, r.error.message.slice(0, 120));
  else {
    F('INP-12', '중간', 'endpoint 길이 제한이 없다 — 10KB 짜리 구독이 저장된다',
      'tools/redteam/inp-02-push.mjs (10KB endpoint)', `${bytes(big)}바이트 endpoint insert 성공`);
    await P.from('push_subscriptions').delete().eq('id', r.data.id);
  }
}

// 4) 한 사람이 구독을 몇 개나? (RLS 는 user_id=auth.uid() 만 본다)
{
  const rows = Array.from({ length: 60 }, (_, i) => mkSub(`https://fcm.example/rt-${Date.now()}-${i}`));
  const r = await P.from('push_subscriptions').insert(rows).select('id');
  if (r.error) held('구독 대량 등록 거절', r.error.message.slice(0, 100));
  else {
    F('INP-13', '중간', '한 사용자의 푸시 구독 수에 상한이 없다 — 60행을 한 번에 넣었다. outbox-send 는 알림 한 건마다 구독 전부에 순차 발송하므로 발송기 한 번(20행)이 그만큼 늘어져 Edge 타임아웃 위험',
      'tools/redteam/inp-02-push.mjs (구독 대량 등록)', `insert 60행 성공 (RLS push_subs_ins: with check (user_id = auth.uid()) 뿐)`);
    await admin.from('push_subscriptions').delete().eq('user_id', ctx.momId);
  }
}

// 5) 남의 user_id 로는? (보안 팀 몫이지만 입력 경로 확인)
{
  const r = await P.from('push_subscriptions').insert({ ...mkSub('https://fcm.example/other-' + Date.now()), user_id: ctx.dirId });
  if (r.error) held('남의 user_id 로 구독 insert 거절 (RLS)', r.error.message.slice(0, 80));
  else F('INP-14', '높음', '남의 user_id 로 푸시 구독을 넣을 수 있다', 'tools/redteam/inp-02-push.mjs', 'insert 성공');
}

await admin.from('push_subscriptions').delete().eq('user_id', ctx.momId);
await admin.from('push_subscriptions').delete().eq('user_id', ctx.dirId);
report('inp-02 푸시 구독 입력');
await teardown(ctx);
