// BRIGHT 운영자 등록·해제. 서비스 키로만 — 앱 안에는 운영자를 늘리는 길이 없다 (0023).
// 운영자는 어느 학원의 소속도 아니다. 명부에 없어도 그 번호로 인증번호를 받고 들어와 운영 화면을 본다.
//   node --env-file=../.env.local set-operator.mjs 01012345678 "홍길동"
//   node --env-file=../.env.local set-operator.mjs 01012345678 --remove
//   node --env-file=../.env.local set-operator.mjs --list
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const USAGE = 'usage: set-operator.mjs <번호> ["<이름>"] | set-operator.mjs <번호> --remove | set-operator.mjs --list';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// app/src/lib/phone.ts · _shared/sms.ts 의 규칙과 같아야 한다.
const norm = p => {
  const s = (p ?? '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const d = s.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');
  const m = /^\+?82(\d+)$/.exec(d);
  return m ? '0' + m[1].replace(/^0+/, '') : d.replace(/\+/g, '');
};
const valid = d => /^01[016789]\d{7,8}$/.test(d) && !(d.startsWith('010') && d.length !== 11);

const [rawPhone, arg2] = process.argv.slice(2);
if (!rawPhone) { console.log(USAGE); process.exit(2); }

if (rawPhone === '--list') {
  const { data, error } = await admin.from('app_operators').select('user_id, created_at, users(name, phone)').order('created_at');
  if (error) { console.error(`목록 조회 실패: ${error.message}`); process.exit(1); }
  if (!data?.length) { console.log('등록된 운영자가 없습니다.'); process.exit(0); }
  for (const o of data) console.log(`- ${o.users?.name ?? '?'} ${o.users?.phone ?? '?'} (${o.created_at.slice(0, 10)})`);
  process.exit(0);
}

const phone = norm(rawPhone);
if (!valid(phone)) { console.error(`번호가 올바르지 않습니다: ${rawPhone}`); process.exit(1); }

const { data: u, error: uErr } = await admin.from('users').select('id, name').eq('phone', phone).maybeSingle();
if (uErr) { console.error(`users 조회 실패: ${uErr.message}`); process.exit(1); }

if (arg2 === '--remove') {
  if (!u) { console.error(`그 번호의 사용자가 없습니다: ${phone}`); process.exit(1); }
  const { error } = await admin.from('app_operators').delete().eq('user_id', u.id);
  if (error) { console.error(`해제 실패: ${error.message}`); process.exit(1); }
  console.log(`운영자 해제: ${u.name} (${phone})`);
  console.log('auth 계정과 학원 소속은 그대로 둡니다 — 원장이기도 하면 원장으로는 계속 들어옵니다.');
  process.exit(0);
}

const name = (arg2 ?? '').trim();
let uid = u?.id;
if (!uid) {
  // 아직 앱에 한 번도 안 들어온 번호다. auth 사용자와 users 행을 여기서 만든다
  // (_shared/auth.ts 의 authEmail 과 같은 규칙 — 그 번호로 인증번호를 받으면 그 계정에 붙는다).
  if (!name) { console.error('처음 등록하는 번호입니다. 이름을 같이 주세요: set-operator.mjs <번호> "<이름>"'); process.exit(1); }
  const email = `${phone}@auth.yeongeo.local`;
  const password = crypto.randomUUID() + crypto.randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) { console.error(`auth 사용자 생성 실패: ${error.message}`); process.exit(1); }
  uid = created.user.id;
  const { error: e2 } = await admin.from('users').insert({ id: uid, name, phone });
  if (e2) { console.error(`users insert 실패: ${e2.message}`); process.exit(1); }
} else if (name && name !== u.name) {
  await admin.from('users').update({ name }).eq('id', uid);
}

const { error } = await admin.from('app_operators').upsert({ user_id: uid }, { onConflict: 'user_id' });
if (error) { console.error(`운영자 등록 실패: ${error.message}`); process.exit(1); }

console.log(`운영자 등록: ${name || u?.name} (${phone})`);
console.log('이 번호로 앱에서 인증번호 로그인하면 BRIGHT 운영 화면이 열립니다.');
console.log('(otp-send·otp-verify Edge 가 배포돼 있어야 명부에 없는 번호도 인증번호가 나갑니다.)');
