import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, cors } from '../_shared/sms.ts';
// 학원 데이터 통째로 내려받기 — 원장만. JWT 를 서비스 키로 검증하고, 활성 소속이 director 인 학원의 표를 모아 JSON 으로.
// 학원이 나갈 때(데이터 이관)와 원장이 백업을 원할 때 쓴다. 운영 문서: docs/ops/outbox.md 옆 deploy.md.
const TABLES = ['classes', 'students', 'enrollments', 'guardians', 'roster_phones', 'attendance', 'absence_requests', 'notices', 'notice_reads', 'inquiries', 'faqs', 'todos', 'todo_done', 'notes', 'calendar'];
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return cors();
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: 'no_token' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) return json(401, { error: 'bad_token' });
  const { data: u } = await admin.from('users').select('active_membership_id').eq('id', user.id).single();
  const { data: m } = await admin.from('memberships').select('academy_id, role').eq('id', u?.active_membership_id ?? '').maybeSingle();
  if (!m || m.role !== 'director') return json(403, { error: 'director_only' });
  const { data: academy } = await admin.from('academies').select('id, name, slug, brand_color, created_at').eq('id', m.academy_id).single();
  const tables: Record<string, unknown[]> = {};
  const studentIds = ((await admin.from('students').select('id').eq('academy_id', m.academy_id)).data ?? []).map(s => s.id);
  const noticeIds = ((await admin.from('notices').select('id').eq('academy_id', m.academy_id)).data ?? []).map(n => n.id);
  const todoIds = ((await admin.from('todos').select('id').eq('academy_id', m.academy_id)).data ?? []).map(t => t.id);
  for (const t of TABLES) {
    let q = admin.from(t).select('*');
    if (t === 'enrollments' || t === 'guardians') q = q.in('student_id', studentIds);
    else if (t === 'notice_reads') q = q.in('notice_id', noticeIds);
    else if (t === 'todo_done') q = q.in('todo_id', todoIds);
    else q = q.eq('academy_id', m.academy_id);
    const { data, error: e } = await q;
    if (e) return json(500, { error: `${t}: ${e.message}` });
    tables[t] = data ?? [];
  }
  // 사용자 이름·번호는 명부·보호자에 이어지는 만큼만 (auth 비밀은 없다)
  const userIds = new Set<string>([...(tables.guardians as { user_id: string }[]).map(g => g.user_id), ...(tables.students as { user_id: string | null }[]).map(s => s.user_id).filter((x): x is string => !!x)]);
  const { data: users } = await admin.from('users').select('id, name, phone').in('id', [...userIds]);
  tables.users = users ?? [];
  const body = JSON.stringify({ exported_at: new Date().toISOString(), academy, tables }, null, 1);
  const fname = `${academy?.slug ?? 'academy'}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${fname}"`, 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Disposition' } });
});
