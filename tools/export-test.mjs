// 학원 데이터 내려받기: 원장 200 + 표 16개, 학부모 403, 토큰 없음 401
// node --env-file=../.env.local export-test.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8); const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'export-' + rnd; const email = p => `${p}@auth.yeongeo.local`;
async function mkUser(name, phone) { const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true }); if (error) throw error; await admin.from('users').insert({ id: data.user.id, name, phone }); return data.user.id; }
const { data: ac } = await admin.from('academies').insert({ slug: `export-${rnd}`, name: '내보내기 테스트' }).select().single(); const A = ac.id;
const { data: cls } = await admin.from('classes').insert({ academy_id: A, name: '고1 A', schedule: [] }).select().single();
const { data: st } = await admin.from('students').insert({ academy_id: A, name: '박지훈' }).select().single();
await admin.from('enrollments').insert({ student_id: st.id, class_id: cls.id });
const dirId = await mkUser('원장', '0109' + num() + '3'); const parId = await mkUser('학부모', '0109' + num() + '2');
const { data: dm } = await admin.from('memberships').insert({ user_id: dirId, academy_id: A, role: 'director' }).select().single();
const { data: pm } = await admin.from('memberships').insert({ user_id: parId, academy_id: A, role: 'parent', student_id: st.id }).select().single();
await admin.from('guardians').insert({ student_id: st.id, user_id: parId });
await admin.from('users').update({ active_membership_id: dm.id }).eq('id', dirId); await admin.from('users').update({ active_membership_id: pm.id }).eq('id', parId);
await admin.from('notices').insert({ academy_id: A, author_id: dirId, title: '공지', body: '' });
const login = async (uid, phone) => { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { data } = await c.auth.signInWithPassword({ email: email(phone), password: PW }); return data.session.access_token; };
const dirTok = await login(dirId, (await admin.from('users').select('phone').eq('id', dirId).single()).data.phone);
const parTok = await login(parId, (await admin.from('users').select('phone').eq('id', parId).single()).data.phone);
const call = tok => fetch(`${URL}/functions/v1/export-academy`, { method: 'POST', headers: { apikey: ANON, ...(tok ? { Authorization: 'Bearer ' + tok } : {}) } });
const r1 = await call(dirTok); ok(r1.status === 200, `원장 200 (got ${r1.status})`);
const j = r1.status === 200 ? await r1.json() : null;
ok(j && j.academy?.id === A && Object.keys(j.tables).length === 16, `표 16개 (got ${j ? Object.keys(j.tables).length : '-'})`);
ok(j && j.tables.students.length === 1 && j.tables.notices.length === 1 && j.tables.users.length === 1 && j.tables.guardians.length === 1, '내용이 이 학원 것');
ok((r1.headers.get('content-disposition') ?? '').includes('export-'), 'attachment 파일 이름');
const r2 = await call(parTok); ok(r2.status === 403, `학부모 403 (got ${r2.status})`);
const r3 = await call(null); ok(r3.status === 401, `토큰 없음 401 (got ${r3.status})`);
if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: export-academy');
