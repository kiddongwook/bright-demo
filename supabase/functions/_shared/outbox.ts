// 알림톡·푸시가 끝내 안 갔으면(dead 또는 대행사 실패 콜백) 같은 내용을 문자 줄에 넣는다 — 한 번만.
// 멱등키: 기본은 원래 줄의 키 + ':sms'. 푸시가 죽어서 넣는 줄은 부르는 쪽이 'sms:push:<outbox id>' 를 준다
// (같은 알림에 푸시 줄과 카톡 줄이 둘 다 있을 수 있어 키가 겹치면 안 된다).
// deno-lint-ignore no-explicit-any
export async function enqueueSms(admin: any, o: { academy_id: string; to_user_id: string; template_code: string; params: unknown; link_view: string | null; link_ref: string | null; idempotency_key: string }, key = o.idempotency_key + ':sms'): Promise<string | null> {
  const { data } = await admin.from('outbox').upsert({ academy_id: o.academy_id, to_user_id: o.to_user_id, channel: 'sms', template_code: o.template_code, params: o.params ?? {}, link_view: o.link_view, link_ref: o.link_ref, idempotency_key: key }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id').maybeSingle();
  if (data?.id) return data.id;
  const { data: ex } = await admin.from('outbox').select('id').eq('idempotency_key', key).maybeSingle();
  return ex?.id ?? null;
}
