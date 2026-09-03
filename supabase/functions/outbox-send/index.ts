import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendSms, sha256, json, cors } from '../_shared/sms.ts';
import { sendAlimtalk, renderSms } from '../_shared/alimtalk.ts';
import { enqueueSms } from '../_shared/outbox.ts';

// 카톡 줄 발송기. pg_cron 의 outbox_tick() 이 1분마다 깨운다(보낼 게 있을 때만). 손으로도 부를 수 있다: X-Outbox-Key 헤더.
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors();
  if (req.headers.get('x-outbox-key') !== Deno.env.get('OUTBOX_KEY')) return json(401, { error: 'bad_key' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const APP = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  const debugOn = (Deno.env.get('ALIMTALK_PROVIDER') ?? 'console') === 'console';
  const { data: rows, error } = await admin.rpc('outbox_claim', { n: 20 });
  if (error) return json(500, { error: error.message });
  let sent = 0, failed = 0, dead = 0; const debug: unknown[] = [];
  for (const o of rows ?? []) {
    const { data: u } = await admin.from('users').select('phone').eq('id', o.to_user_id).single();
    // 토큰: 발송할 때 새로 발급. 원문은 URL 에만, DB 에는 해시만. 7일 뒤 만료, 이 화면만.
    const token = hex(16);
    const { data: lt } = await admin.from('link_tokens').insert({ academy_id: o.academy_id, user_id: o.to_user_id, view: o.link_view ?? 'home', ref_id: o.link_ref, token_hash: await sha256(token), expires_at: new Date(Date.now() + 7 * 86400e3).toISOString() }).select('id').single();
    const url = `${APP}/?l=${token}`;
    try {
      let pid: string | null = null;
      if (o.channel === 'alimtalk') pid = await sendAlimtalk({ to: u!.phone, templateCode: o.template_code, params: o.params ?? {}, buttonUrl: url });
      else await sendSms(u!.phone, renderSms(o.template_code, o.params ?? {}, url));
      await admin.from('outbox').update({ status: 'sent', provider_msg_id: pid, sent_at: new Date().toISOString(), link_token_id: lt!.id, last_error: null }).eq('id', o.id);
      sent++; if (debugOn) debug.push({ id: o.id, channel: o.channel, to: u!.phone, template_code: o.template_code, url });
    } catch (e) {
      const isDead = o.attempts >= 5; // outbox_claim 이 이미 +1 한 값
      await admin.from('outbox').update({ status: isDead ? 'dead' : 'failed', last_error: String((e as Error).message).slice(0, 300), link_token_id: lt!.id }).eq('id', o.id);
      if (isDead) { dead++; if (o.channel === 'alimtalk') await enqueueSms(admin, o); } else failed++;
    }
  }
  return json(200, { claimed: rows?.length ?? 0, sent, failed, dead, ...(debugOn ? { debug } : {}) });
});
