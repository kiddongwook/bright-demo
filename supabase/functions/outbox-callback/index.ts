import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, cors } from '../_shared/sms.ts';
import { enqueueSms } from '../_shared/outbox.ts';

// 대행사 수신 결과. 대행사마다 모양이 달라서 계약을 {provider_msg_id, status: delivered|failed, reason} 으로 고정하고,
// 대행사 콜백 → 이 모양으로 바꾸는 얇은 변환은 대행사를 붙일 때 아래 parse() 에 둔다.
function parse(body: Record<string, unknown>): { provider_msg_id?: string; status?: string; reason?: string } {
  return { provider_msg_id: body.provider_msg_id as string, status: body.status as string, reason: body.reason as string | undefined };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors();
  const url = new URL(req.url);
  if ((req.headers.get('x-outbox-key') ?? url.searchParams.get('key')) !== Deno.env.get('OUTBOX_KEY')) return json(401, { error: 'bad_key' });
  const { provider_msg_id, status, reason } = parse(await req.json().catch(() => ({})));
  if (!provider_msg_id || !['delivered', 'failed'].includes(status ?? '')) return json(400, { error: 'bad_input' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: o } = await admin.from('outbox').select('*').eq('provider_msg_id', provider_msg_id).maybeSingle();
  if (!o) return json(404, { error: 'unknown_msg' });
  if (status === 'delivered') { await admin.from('outbox').update({ status: 'delivered' }).eq('id', o.id); return json(200, { ok: true }); }
  // 실패: 다시 알림톡을 시도하지 않는다(attempts 5 로 잠금) — 카톡이 없는 번호는 다시 보내도 같다. 문자로 간다.
  await admin.from('outbox').update({ status: 'failed', attempts: 5, last_error: String(reason ?? 'provider_failed').slice(0, 300) }).eq('id', o.id);
  const fallback = o.channel === 'alimtalk' ? await enqueueSms(admin, o) : null;
  return json(200, { ok: true, fallback });
});
