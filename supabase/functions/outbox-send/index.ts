import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendSms, sha256, json, cors } from '../_shared/sms.ts';
import { sendAlimtalk, renderSms } from '../_shared/alimtalk.ts';
import { enqueueSms } from '../_shared/outbox.ts';
import { pushDryRun, pushPayload, sendPush, type PushSub } from '../_shared/push.ts';

// 알림 줄 발송기. pg_cron 의 outbox_tick() 이 1분마다 깨운다(보낼 게 있을 때만). 손으로도 부를 수 있다: X-Outbox-Key 헤더.
// 채널 셋: push(웹 푸시, 공짜) · alimtalk(카톡) · sms(카톡·푸시 실패 대체). 상태·재시도 규칙은 셋 다 같다.
//
// 규칙 셋(적대적 점검 뒤 고친 자리):
//  1) 한 줄의 모든 일은 try 안에서 한다 — 무엇이 터져도 행이 queued 로 굳지 않는다 (INP-21).
//  2) 푸시가 죽으면(재시도 5회 소진 = dead, 또는 되풀이할 값어치가 없는 4xx) 문자로 대신 보낸다 —
//     구독 한 줄이 그 사람의 알림을 통째로 끊지 않게 (INP-11/02).
//  3) 보내기 전에 받는 사람이 아직 이 학원 사람인지 다시 본다 (INT-39).
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const RETRY_MS = 5 * 60e3;           // outbox_claim 과 같은 간격
const SUB_ROT_MS = 7 * 86400e3;      // 실패만 하고 7일이 지난 구독은 지운다
const SKIP_AFTER = 3;                // 이 횟수부터는 이미 실패 표시가 붙은 구독을 건너뛴다

/** 되풀이할 값어치가 없는 실패(fatal)면 재시도 없이 곧바로 dead 로 보낸다. */
class SendFail extends Error {
  fatal: boolean;
  constructor(message: string, fatal = false) { super(message); this.fatal = fatal; }
}
type SubRow = PushSub & { last_ok_at: string | null; failed_at: string | null };
type UserRow = { phone: string; prefs: Record<string, unknown> | null };
/** 알림 종류 → 그 사람이 끌 수 있는 카톡 설정 키 (0013 trg_notification_outbox 와 같은 표).
 *  여기 없는 코드(INQUIRY_NEW·ABSENCE_REQUESTED·ATTENDANCE_SELF·NOTIFY)는 원래 유료 채널로 가지 않는 종류다. */
const PREF_OF: Record<string, string> = {
  NOTICE_NEW: 'kakao_notice', NOTICE_REMIND: 'kakao_remind', INQUIRY_ANSWERED: 'kakao_answer',
  MAKEUP_CONFIRMED: 'kakao_makeup', ATTENDANCE: 'kakao_attendance',
};
/** 마지막 성공보다 실패가 더 최근인 구독 = 지금 고장 난 구독 */
const failing = (s: SubRow) => !!s.failed_at && (!s.last_ok_at || Date.parse(s.last_ok_at) < Date.parse(s.failed_at));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors();
  if (req.headers.get('x-outbox-key') !== Deno.env.get('OUTBOX_KEY')) return json(401, { error: 'bad_key' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const APP = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  const debugOn = (Deno.env.get('ALIMTALK_PROVIDER') ?? 'console') === 'console';
  const { data: rows, error } = await admin.rpc('outbox_claim', { n: 20 });
  if (error) return json(500, { error: error.message });
  let sent = 0, failed = 0, dead = 0, skipped = 0; const debug: unknown[] = [];
  // 학원별 발신키 (0023 academy_settings). service_role 전용 RPC 로만 원문이 나온다 — 운영자 화면은 마스킹만 본다.
  // 한 번 돌 때 학원마다 한 번만 묻는다. RPC 가 아직 없으면(배포 순서) 전역 값으로 간다.
  const keyCache = new Map<string, string | null>();
  const senderKeyOf = async (academyId: string): Promise<string | null> => {
    if (keyCache.has(academyId)) return keyCache.get(academyId) ?? null;
    let key: string | null = null;
    const { data, error: e } = await admin.rpc('academy_sms_key', { p_academy: academyId });
    const row = Array.isArray(data) ? data[0] : data;
    if (!e && row?.sms_provider === 'http' && row?.sender_key) key = row.sender_key as string;
    keyCache.set(academyId, key);
    return key;
  };
  for (const o of rows ?? []) {
    let lt: { id: string } | null = null, u: UserRow | null = null;
    try {
      // 줄에 선 뒤에 퇴원·명부 제외가 있었으면 보내지 않는다. RPC 가 아직 없으면(배포 순서) 그냥 보낸다.
      const act = await admin.rpc('outbox_recipient_active', { p_outbox: o.id });
      if (!act.error && act.data === false) {
        await admin.from('outbox').update({ status: 'dead', last_error: 'recipient_left' }).eq('id', o.id);
        skipped++; if (debugOn) debug.push({ id: o.id, channel: o.channel, skipped: 'recipient_left' });
        continue;
      }
      ({ data: u } = await admin.from('users').select('phone, prefs').eq('id', o.to_user_id).single());
      // 토큰: 발송할 때 새로 발급. 원문은 URL 에만, DB 에는 해시만. 7일 뒤 만료, 이 화면만.
      // 푸시는 앱이 이미 그 사람 세션으로 열려 있으니 토큰이 필요 없다.
      let url = '';
      if (o.channel !== 'push') {
        const token = hex(16);
        const { data } = await admin.from('link_tokens').insert({ academy_id: o.academy_id, user_id: o.to_user_id, view: o.link_view ?? 'home', ref_id: o.link_ref, token_hash: await sha256(token), expires_at: new Date(Date.now() + 7 * 86400e3).toISOString() }).select('id').single();
        lt = data; url = `${APP}/?l=${token}`;
      }
      let pid: string | null = null; let extra: Record<string, unknown> = {};
      if (o.channel === 'push') {
        const { data: subsAll } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth, last_ok_at, failed_at').eq('user_id', o.to_user_id);
        const all = (subsAll ?? []) as SubRow[];
        // 실패만 하고 7일이 지난 구독은 죽은 기기다 — 지운다(살림을 기다리지 않는다).
        const rotten = all.filter(s => failing(s) && Date.parse(s.failed_at!) < Date.now() - SUB_ROT_MS);
        if (rotten.length) await admin.from('push_subscriptions').delete().in('id', rotten.map(s => s.id));
        const alive = all.filter(s => !rotten.includes(s));
        // 세 번째 시도부터는 고장 난 구독을 건너뛴다 — 나머지 기기라도 받게.
        const subs = o.attempts >= SKIP_AFTER ? alive.filter(s => !failing(s)) : alive;
        if (!subs.length) throw new SendFail(alive.length ? 'push_subs_failing' : 'no_subscription');
        const payload = pushPayload(o);
        const rs = await sendPush(subs, payload);
        const gone = rs.filter(r => r.gone).map(r => r.id);
        const good = rs.filter(r => r.ok).map(r => r.id);
        const bad = rs.filter(r => !r.ok && !r.gone).map(r => r.id);
        if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone);        // 404/410 = 지운 기기
        if (good.length) await admin.from('push_subscriptions').update({ last_ok_at: new Date().toISOString(), failed_at: null }).in('id', good);
        if (bad.length) await admin.from('push_subscriptions').update({ failed_at: new Date().toISOString() }).in('id', bad);
        if (!good.length) {
          // 되풀이해 볼 값어치가 있는 실패(그물망 오류·429·5xx)가 하나도 없으면 곧바로 문자 대체로 넘긴다.
          const retryable = rs.some(r => !r.ok && !r.gone && !r.fatal);
          throw new SendFail(rs.map(r => r.error).filter(Boolean).join('; ').slice(0, 200) || 'push_failed', !retryable);
        }
        extra = { title: payload.title, body: payload.body, view: payload.view, subs: good.length, gone: gone.length, dry: pushDryRun() };
      }
      else if (o.channel === 'alimtalk') pid = await sendAlimtalk({ to: u!.phone, templateCode: o.template_code, params: o.params ?? {}, buttonUrl: url, senderKey: await senderKeyOf(o.academy_id) });
      else await sendSms(u!.phone, renderSms(o.template_code, o.params ?? {}, url), await senderKeyOf(o.academy_id));
      await admin.from('outbox').update({ status: 'sent', provider_msg_id: pid, sent_at: new Date().toISOString(), link_token_id: lt?.id ?? null, last_error: null }).eq('id', o.id);
      sent++; if (debugOn) debug.push({ id: o.id, channel: o.channel, to: u!.phone, template_code: o.template_code, url, ...extra });
    } catch (e) {
      // 여기까지 오면 무엇이 터졌든 행의 끝을 낸다 — queued 로 굳는 길을 없앤다(INP-21).
      const fatal = (e as { fatal?: boolean }).fatal === true;
      const isDead = fatal || o.attempts >= 5; // outbox_claim 이 이미 +1 한 값
      try {
        await admin.from('outbox').update({
          status: isDead ? 'dead' : 'failed',
          last_error: String((e as Error)?.message ?? e).slice(0, 300),
          link_token_id: lt?.id ?? null,
          ...(isDead ? {} : { next_attempt_at: new Date(Date.now() + RETRY_MS).toISOString() }),
        }).eq('id', o.id);
        // 카톡이든 푸시든 끝내 못 갔으면 문자로 대신 보낸다 — 알림이 조용히 사라지지 않게(INP-11/02).
        // 푸시 쪽은 카톡 줄이 원래 지고 있던 세 조건을 손으로 다시 건다: 심사받은 템플릿이 있는 종류인가 ·
        // 그 사람이 그 알림을 껐는가 · 같은 알림의 카톡 줄이 이미 있는가(kakao_also). 안 그러면 안 나가던 문자가 나간다.
        if (isDead && o.channel === 'alimtalk') await enqueueSms(admin, o);
        else if (isDead && o.channel === 'push') {
          const key = PREF_OF[o.template_code];
          const optedOut = !!key && (u?.prefs as Record<string, unknown> | null | undefined)?.[key] === false;
          const sibling = String(o.idempotency_key ?? '').replace(/^push:/, 'n:');
          const hasKakao = sibling && sibling !== o.idempotency_key
            ? !!(await admin.from('outbox').select('id').eq('idempotency_key', sibling).maybeSingle()).data
            : false;
          if (key && !optedOut && !hasKakao) await enqueueSms(admin, o, `sms:push:${o.id}`);
          else if (debugOn) debug.push({ id: o.id, channel: 'push', no_sms: !key ? 'push_only_kind' : optedOut ? 'opted_out' : 'kakao_row_exists' });
        }
      } catch (e2) {
        // 뒷정리마저 실패하면 이 줄만 포기하고 다음 줄로 간다 — 한 줄이 나머지를 막지 않게.
        console.error('outbox row cleanup failed', o.id, String((e2 as Error)?.message ?? e2));
      }
      if (isDead) dead++; else failed++;
    }
  }
  return json(200, { claimed: rows?.length ?? 0, sent, failed, dead, skipped, ...(debugOn ? { debug } : {}) });
});
