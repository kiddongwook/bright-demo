// inp-03 적대적 params 가 든 outbox 행이 줄을 막는가 — outbox_claim 은 전역이라 부르지 않고
// 내 학원 행에 같은 상태 전이를 손으로 만든 뒤, claim 의 WHERE 조건을 평범한 SELECT 로 확인한다.
import { admin, setup, teardown, drainOutbox, F, held, report, bytes } from './inp-lib.mjs';

const ctx = await setup('outbox');
console.log('academy', ctx.slug);

// claim 이 잡을 수 있는 행인가? (0018 outbox_claim 의 WHERE 를 그대로 — 굳은 줄을 한 번 더 집어 주려고 attempts < 6)
async function claimable(id) {
  const { data } = await admin.from('outbox').select('id, status, attempts, next_attempt_at, created_at').eq('id', id).single();
  const due = new Date(data.next_attempt_at ?? data.created_at) <= new Date();
  return { row: data, ok: ['queued', 'failed'].includes(data.status) && data.attempts < 6 && due };
}
const mkRow = (extra) => ({
  academy_id: ctx.A, to_user_id: ctx.momId, channel: 'push', template_code: 'NOTIFY',
  params: { 학원: ctx.academyName, 알림: '테스트' }, link_view: 'home', link_ref: null,
  idempotency_key: 'rt-inp:' + Math.random().toString(36).slice(2), ...extra,
});

// 1) 거대한 params (10,000자 알림 문구)
{
  const p = { 학원: ctx.academyName, 알림: '다'.repeat(10000) };
  const r = await admin.from('outbox').insert(mkRow({ params: p })).select('id, params').single();
  if (r.error) held('거대 params outbox 거절', r.error.message.slice(0, 100));
  else {
    F('INP-20', '중간', 'outbox.params 크기에 상한이 없다 — 10,000자 알림 문구가 그대로 줄에 선다 (푸시 4KB·알림톡 1,000자 한도를 이미 넘긴 채로)',
      'tools/redteam/inp-03-outbox.mjs (거대 params)',
      `params JSON ${bytes(JSON.stringify(r.data.params))}바이트 저장 성공`);
    await admin.from('outbox').delete().eq('id', r.data.id);
  }
}

// 2) 발송기가 잡은 뒤 잡히지 않은 예외(Edge 타임아웃 등)로 죽으면 — attempts 만 오르고 status 는 queued 로 남는다
{
  const r = await admin.from('outbox').insert(mkRow({})).select('id').single();
  const id = r.data.id;
  const log = [];
  for (let i = 1; i <= 6; i++) {
    // outbox_claim 이 하는 갱신만 손으로 (status 는 건드리지 않는다 = 함수가 그 뒤 죽은 경우)
    const { data: cur } = await admin.from('outbox').select('attempts').eq('id', id).single();
    await admin.from('outbox').update({ attempts: cur.attempts + 1, next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq('id', id);
    const c = await claimable(id);
    log.push({ tick: i, attempts: c.row.attempts, status: c.row.status, claimable: c.ok });
  }
  console.log(JSON.stringify(log));
  const last = log[log.length - 1];
  if (!last.claimable && last.status === 'queued') {
    F('INP-21', '높음', "발송 중 잡히지 않은 예외(Edge 타임아웃)로 죽으면 outbox 행이 status='queued', attempts=5 로 굳는다 — outbox_claim 의 attempts<5 조건에서 영영 빠지고, status 가 dead 가 아니라 문자 대체(enqueueSms)도 안 걸린다. outbox_tick 의 '보낼 게 있나' 검사에도 안 잡혀 아무도 눈치채지 못한다",
      'tools/redteam/inp-03-outbox.mjs (2번 블록)',
      `claim 갱신만 6번 반복 → ${JSON.stringify(last)} — 잡히지도 dead 도 아닌 상태로 남는다. 이 시나리오는 INP-13(구독 무제한)·INP-02(6KB 페이로드)로 실제로 만들 수 있다`);
  } else held('claim 반복 뒤에도 행이 살아 있다', JSON.stringify(last));
  await admin.from('outbox').delete().eq('id', id);
}

// 3) 어댑터가 던지는 정상 실패 경로(잡히는 예외)는 제대로 도나 — outbox-send 의 catch 를 그대로 흉내
{
  // 0018: outbox.params 에 8KB 상한이 생겼다 — 3,000자(약 9KB)는 이제 줄에 서지도 못한다.
  // 그 자체가 held 지만, 아래의 dead → 문자 대체 경로도 계속 봐야 하므로 상한 안쪽(1,500자)으로 한 번 더 시도한다.
  let r = await admin.from('outbox').insert(mkRow({ channel: 'alimtalk', template_code: 'NOTICE_NEW', params: { 학원: ctx.academyName, 제목: '가'.repeat(3000) } })).select('id').single();
  if (r.error) {
    held('8KB 넘는 params 는 줄에 서지도 못한다 (0018 outbox_params_size_ck)', r.error.message.slice(0, 100));
    r = await admin.from('outbox').insert(mkRow({ channel: 'alimtalk', template_code: 'NOTICE_NEW', params: { 학원: ctx.academyName, 제목: '가'.repeat(1500) } })).select('id').single();
  }
  if (r.error) { console.log('adapter-failure path 건너뜀 —', r.error.message.slice(0, 120)); }
  else {
  const id = r.data.id;
  let smsRow = null;
  for (let i = 1; i <= 6; i++) {
    const { data: cur } = await admin.from('outbox').select('attempts, idempotency_key, link_view, link_ref, template_code, params').eq('id', id).single();
    const attempts = cur.attempts + 1;
    await admin.from('outbox').update({ attempts, next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq('id', id);
    const isDead = attempts - 1 >= 5;   // outbox-send: o.attempts 는 claim 이 이미 +1 한 값
    await admin.from('outbox').update({ status: isDead ? 'dead' : 'failed', last_error: 'simulated adapter failure' }).eq('id', id);
    if (isDead) {
      const key = cur.idempotency_key + ':sms';
      const up = await admin.from('outbox').upsert({ academy_id: ctx.A, to_user_id: ctx.momId, channel: 'sms', template_code: cur.template_code, params: cur.params, link_view: cur.link_view, link_ref: cur.link_ref, idempotency_key: key }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id').maybeSingle();
      smsRow = up.data?.id ?? null;
      break;
    }
  }
  const c = await claimable(id);
  console.log('adapter-failure path →', JSON.stringify({ ...c.row, smsFallback: !!smsRow }));
  if (c.row.status === 'dead' && smsRow) held('잡히는 어댑터 실패는 5회 뒤 dead + 문자 대체 한 줄 (알림톡 채널). 적대적 params 로도 줄이 막히지 않는다', `outbox status=dead, sms 대체 행 ${smsRow}`);
  else F('INP-22', '중간', '알림톡 실패 대체 경로가 예상대로 돌지 않는다', 'tools/redteam/inp-03-outbox.mjs (3번 블록)', JSON.stringify(c.row));
  await admin.from('outbox').delete().eq('academy_id', ctx.A);
  }
}

// 4) 적대적 params 가 든 행이 같은 학원의 다른 행을 막는가 — claim 은 id 별 갱신이라 막지 않는다(확인)
{
  const a = await admin.from('outbox').insert(mkRow({ params: { 학원: ctx.academyName, 알림: '라'.repeat(20000) } })).select('id').single();
  const b = await admin.from('outbox').insert(mkRow({})).select('id').single();
  const cb = await claimable(b.data.id);
  if (cb.ok) held('거대 params 행이 있어도 뒤 행은 그대로 잡힌다 (줄이 막히지 않음)', `id ${b.data.id} claimable=true`);
  else F('INP-23', '높음', '거대 params 행이 뒤 행을 막는다', 'tools/redteam/inp-03-outbox.mjs (4번 블록)', JSON.stringify(cb.row));
  await admin.from('outbox').delete().eq('academy_id', ctx.A);
}

await drainOutbox(ctx.A);
report('inp-03 outbox 적대 입력');
await teardown(ctx);
