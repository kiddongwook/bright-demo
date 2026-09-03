// 한 학원의 씨앗·시험 데이터를 전부 지운다. academies 행·원장 roster_phones·원장 memberships 는 남긴다.
// SEED_DEMO_WIPE=1 없이는 아무것도 지우지 않는다. 학생 수 등을 보여준 뒤 slug 를 한 번 더 입력받는다(--yes 로 건너뛸 수 있음).
// SEED_DEMO_WIPE=1 node --env-file=../.env.local pilot-reset.mjs <slug> [--yes <slug>]
import 'dotenv/config';
import readline from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const [slug, flag, yesSlug] = process.argv.slice(2);
if (!slug) { console.log('usage: pilot-reset.mjs <slug> [--yes <slug>]'); process.exit(2); }

if (process.env.SEED_DEMO_WIPE !== '1') {
  console.error('거부: SEED_DEMO_WIPE=1 환경변수 없이는 아무것도 지우지 않습니다.');
  console.error(`예: SEED_DEMO_WIPE=1 node --env-file=../.env.local pilot-reset.mjs ${slug}`);
  process.exit(1);
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const { data: ac, error: acErr } = await admin.from('academies').select('id, slug, name').eq('slug', slug).maybeSingle();
if (acErr) { console.error(`academies 조회 실패: ${acErr.message}`); process.exit(1); }
if (!ac) { console.error(`학원을 찾을 수 없습니다: ${slug}`); process.exit(1); }
const A = ac.id;

// guardians·enrollments·notice_reads·todo_done 은 id 열이 없다(복합 PK) — 있는 열로 센다.
const PK = { guardians: 'student_id', enrollments: 'student_id' };
async function cnt(table, apply) {
  const { count, error } = await apply(admin.from(table).select(PK[table] ?? 'id', { count: 'exact', head: true }));
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

console.log(`대상 학원: ${ac.name} (${ac.slug})`);
console.log(`- 학생 ${await cnt('students', q => q.eq('academy_id', A))}`);
console.log(`- 반 ${await cnt('classes', q => q.eq('academy_id', A))}`);
console.log(`- 공지 ${await cnt('notices', q => q.eq('academy_id', A))}`);
console.log(`- 출결 ${await cnt('attendance', q => q.eq('academy_id', A))}`);

let confirmed = flag === '--yes' && yesSlug === slug;
if (!confirmed) {
  confirmed = await new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`정말 지우려면 학원 slug(${slug})를 한 번 더 입력하세요: `, answer => { rl.close(); resolve(answer.trim() === slug); });
  });
}
if (!confirmed) { console.error('확인 문구가 일치하지 않아 취소되었습니다.'); process.exit(1); }

async function wipe(label, table, apply) {
  const n = await cnt(table, apply);
  const { error } = await apply(admin.from(table).delete());
  if (error) throw new Error(`${label} delete: ${error.message}`);
  console.log(`- ${label}: ${n}`);
}

console.log('삭제 중…');
await wipe('notifications', 'notifications', q => q.eq('academy_id', A));
await wipe('outbox', 'outbox', q => q.eq('academy_id', A));
await wipe('link_tokens', 'link_tokens', q => q.eq('academy_id', A));
try {
  await wipe('client_errors', 'client_errors', q => q.eq('academy_id', A));
} catch (e) {
  if (/relation .* does not exist/i.test(e.message)) console.log('- client_errors: 표 없음 (건너뜀)');
  else throw e;
}
await wipe('notes', 'notes', q => q.eq('academy_id', A));
await wipe('todos (→ todo_done cascade)', 'todos', q => q.eq('academy_id', A));
await wipe('inquiries', 'inquiries', q => q.eq('academy_id', A));
await wipe('notices (→ notice_reads cascade)', 'notices', q => q.eq('academy_id', A));
await wipe('absence_requests', 'absence_requests', q => q.eq('academy_id', A));
await wipe('attendance', 'attendance', q => q.eq('academy_id', A));
await wipe('calendar', 'calendar', q => q.eq('academy_id', A));
await wipe('faqs', 'faqs', q => q.eq('academy_id', A));

// guardians·enrollments 는 academy_id 가 없다 — 이 학원 학생 id 로 지운다.
const studentIds = ((await admin.from('students').select('id').eq('academy_id', A)).data ?? []).map(s => s.id);
if (studentIds.length) {
  await wipe('guardians', 'guardians', q => q.in('student_id', studentIds));
  await wipe('enrollments', 'enrollments', q => q.in('student_id', studentIds));
}

await wipe('roster_phones (원장 제외)', 'roster_phones', q => q.eq('academy_id', A).neq('role', 'director'));
await wipe('memberships (원장 제외)', 'memberships', q => q.eq('academy_id', A).neq('role', 'director'));
await wipe('students', 'students', q => q.eq('academy_id', A));
await wipe('classes', 'classes', q => q.eq('academy_id', A));

console.log('남은 데이터:');
console.log(`- students: ${await cnt('students', q => q.eq('academy_id', A))}`);
console.log(`- classes: ${await cnt('classes', q => q.eq('academy_id', A))}`);
console.log(`- notices: ${await cnt('notices', q => q.eq('academy_id', A))}`);
console.log(`- attendance: ${await cnt('attendance', q => q.eq('academy_id', A))}`);
console.log(`- roster_phones(원장): ${await cnt('roster_phones', q => q.eq('academy_id', A).eq('role', 'director'))}`);
console.log(`- memberships(원장): ${await cnt('memberships', q => q.eq('academy_id', A).eq('role', 'director'))}`);
console.log('PASS: pilot-reset');
