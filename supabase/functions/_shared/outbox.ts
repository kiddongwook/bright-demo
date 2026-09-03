// 알림톡이 끝내 안 갔으면(dead 또는 대행사 실패 콜백) 같은 내용을 문자 줄에 넣는다 — 한 번만(idempotency_key + ':sms').
// deno-lint-ignore no-explicit-any
export async function enqueueSms(admin: any, o: { academy_id: string; to_user_id: string; template_code: string; params: unknown; link_view: string | null; link_ref: string | null; idempotency_key: string }): Promise<string | null> {
  const key = o.idempotency_key + ':sms';
  const { data } = await admin.from('outbox').upsert({ academy_id: o.academy_id, to_user_id: o.to_user_id, channel: 'sms', template_code: o.template_code, params: o.params ?? {}, link_view: o.link_view, link_ref: o.link_ref, idempotency_key: key }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id').maybeSingle();
  if (data?.id) return data.id;
  const { data: ex } = await admin.from('outbox').select('id').eq('idempotency_key', key).maybeSingle();
  return ex?.id ?? null;
}
