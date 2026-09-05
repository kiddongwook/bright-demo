import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, cors } from '../_shared/sms.ts';

// 학원 지우기 — BRIGHT 운영자만. 몸통은 SQL 의 op_delete_academy(cascade) 지만,
// 저장소(logos/<id>/·notices/<id>/)는 SQL 이 못 지운다. 그래서 여기서 먼저 비우고 RPC 를 부른다.
// 순서가 중요하다: 파일을 먼저 지운다. RPC 가 먼저 성공하면 학원 id 를 잃어 접두어를 못 찾는다.
//
// 확인: slug 를 한 번 더 받는다(화면이 손으로 입력받은 값). 틀리면 RPC 가 slug_mismatch 로 거절한다.
// 인증: 사용자 JWT 를 그대로 실은 클라이언트로 RPC 를 부른다 — 서비스 키로 부르면 auth.uid() 가 없어
//       is_operator() 가 false 이고 not_operator 로 튕긴다.

// 한 겹만 보는 list 를 폴더마다 돌며 파일을 모은다 (tools/pilot-reset.mjs 의 emptyPrefix 와 같은 몸통).
// deno-lint-ignore no-explicit-any
async function emptyPrefix(admin: any, bucket: string, prefix: string): Promise<number> {
  const s = admin.storage.from(bucket);
  const paths: string[] = [];
  const { data: top, error } = await s.list(prefix, { limit: 1000 });
  if (error) throw new Error(error.message);
  for (const e of top ?? []) {
    if (e.id) { paths.push(`${prefix}/${e.name}`); continue; }
    const { data: inner, error: e2 } = await s.list(`${prefix}/${e.name}`, { limit: 1000 });
    if (e2) throw new Error(e2.message);
    for (const f of inner ?? []) if (f.id) paths.push(`${prefix}/${e.name}/${f.name}`);
  }
  if (paths.length) { const { error: e3 } = await s.remove(paths); if (e3) throw new Error(e3.message); }
  return paths.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors();
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: 'no_token' });
  const { academy_id: academyId, confirm_slug: confirmSlug } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(academyId ?? '')) return json(400, { error: 'bad_academy' });
  if (!confirmSlug) return json(400, { error: 'bad_confirm' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) return json(401, { error: 'bad_token' });

  // 그 사람의 JWT 로 부르는 클라이언트. is_operator() 가 이 토큰의 auth.uid() 를 본다.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: 'Bearer ' + jwt } }, auth: { persistSession: false },
  });
  const { data: isOp, error: opErr } = await asUser.rpc('is_operator');
  if (opErr) return json(500, { error: opErr.message });
  if (isOp !== true) return json(403, { error: 'not_operator' });

  // slug 를 먼저 대조한다 — 틀린 확인 문구로 파일부터 지우는 일이 없게.
  const { data: ac } = await admin.from('academies').select('slug, name').eq('id', academyId).maybeSingle();
  if (!ac) return json(404, { error: 'not_found' });
  if (String(confirmSlug).trim() !== ac.slug) return json(400, { error: 'slug_mismatch' });

  const files: Record<string, number | string> = {};
  for (const bucket of ['notices', 'logos']) {
    // 버킷이 없거나 비어 있어도 삭제 전체가 멈추지 않는다 — 지울 파일이 없다는 뜻이다.
    try { files[bucket] = await emptyPrefix(admin, bucket, academyId); }
    catch (e) { files[bucket] = `skipped: ${(e as Error).message}`; }
  }

  const { data: name, error: delErr } = await asUser.rpc('op_delete_academy', { p_academy: academyId, p_confirm_slug: confirmSlug });
  if (delErr) return json(delErr.message.includes('not_operator') ? 403 : 400, { error: delErr.message });
  return json(200, { ok: true, name: name ?? ac.name, slug: ac.slug, files });
});
