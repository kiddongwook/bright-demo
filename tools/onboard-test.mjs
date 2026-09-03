// 온보딩 통합 테스트: new-academy 개설 → 원장 otp-send 200 → seed-roster 적재(학생6·반2) → pilot-reset(원장만 남김) → 정리
// node --env-file=../.env.local onboard-test.mjs
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8);
const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const slug = `onb-${rnd}`;
const dirPhone = '0109' + num() + '3';
const otpSend = phone => fetch(`${URL}/functions/v1/otp-send`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ phone }) });
function run(cmd, extraEnv = {}) {
  return execSync(cmd, { encoding: 'utf8', env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
}

// ---- 1. 학원 개설
try { run(`node new-academy.mjs ${slug} "온보딩 테스트" ${dirPhone} "김원장"`); }
catch (e) { fails.push('new-academy 실행: ' + (e.stderr?.toString() || e.message)); }

const { data: ac } = await admin.from('academies').select('id, slug').eq('slug', slug).maybeSingle();
ok(!!ac, `academies 행 생성 (slug=${slug})`);
const A = ac?.id;

const dirRoster = A ? (await admin.from('roster_phones').select('phone, role, name').eq('academy_id', A).eq('role', 'director')).data : [];
ok(dirRoster?.length === 1 && dirRoster[0].phone === dirPhone, `원장 roster_phones 행 (got ${JSON.stringify(dirRoster)})`);

const sendRes = await otpSend(dirPhone);
ok(sendRes.status === 200, `원장 otp-send 200 (got ${sendRes.status})`);

// ---- 2. 명부 CSV 적재
try { run(`node --env-file=../.env.local seed-roster.mjs roster.sample.csv ${slug} "온보딩 테스트"`); }
catch (e) { fails.push('seed-roster 실행: ' + (e.stderr?.toString() || e.message)); }

const nStudents = A ? (await admin.from('students').select('id', { count: 'exact', head: true }).eq('academy_id', A)).count : -1;
ok(nStudents === 6, `학생 6명 (got ${nStudents})`);
const nClasses = A ? (await admin.from('classes').select('id', { count: 'exact', head: true }).eq('academy_id', A)).count : -1;
ok(nClasses === 2, `반 2개 (got ${nClasses})`);

// ---- 3. 리셋
try { run(`node pilot-reset.mjs ${slug} --yes ${slug}`, { SEED_DEMO_WIPE: '1' }); }
catch (e) { fails.push('pilot-reset 실행: ' + (e.stderr?.toString() || e.message)); }

const nStudents2 = A ? (await admin.from('students').select('id', { count: 'exact', head: true }).eq('academy_id', A)).count : -1;
ok(nStudents2 === 0, `리셋 뒤 학생 0 (got ${nStudents2})`);
const nClasses2 = A ? (await admin.from('classes').select('id', { count: 'exact', head: true }).eq('academy_id', A)).count : -1;
ok(nClasses2 === 0, `리셋 뒤 반 0 (got ${nClasses2})`);
const rosterAfter = A ? (await admin.from('roster_phones').select('role').eq('academy_id', A)).data : [];
ok(rosterAfter?.length === 1 && rosterAfter[0].role === 'director', `리셋 뒤 roster_phones 은 원장 행만 (got ${JSON.stringify(rosterAfter)})`);
const acAfter = A ? (await admin.from('academies').select('id').eq('id', A).maybeSingle()).data : null;
ok(!!acAfter, '리셋 뒤에도 academies 행은 남음');

// ---- 정리: 학원(cascade) + 원장 auth 사용자(있다면)
if (A) { const { error } = await admin.from('academies').delete().eq('id', A); if (error) fails.push('academies 정리 실패: ' + error.message); }
const { data: dirUser } = await admin.from('users').select('id').eq('phone', dirPhone).maybeSingle();
if (dirUser) {
  try { await admin.auth.admin.deleteUser(dirUser.id); } catch { /* ignore */ }
  try { await admin.from('users').delete().eq('id', dirUser.id); } catch { /* ignore */ }
}

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: onboard');
