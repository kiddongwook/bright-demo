// 학원 개설: academies + 원장 roster_phones 행. 원장은 그 번호로 OTP 로 들어오면 otp-verify 가 membership 을 만든다.
// node --env-file=../.env.local new-academy.mjs <slug> "<이름>" <원장 번호> "<원장 이름>" [#색]
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const USAGE = 'usage: new-academy.mjs <slug> "<이름>" <원장 번호> "<원장 이름>" [#색]';
const [slug, name, dirPhoneRaw, dirName, color] = process.argv.slice(2);
if (!slug || !name || !dirPhoneRaw || !dirName) { console.log(USAGE); process.exit(2); }

const norm = p => (p ?? '').replace(/[^0-9]/g, '');
const dirPhone = norm(dirPhoneRaw);
if (dirPhone.length < 10) { console.error(`원장 번호가 올바르지 않습니다: ${dirPhoneRaw}`); process.exit(1); }
if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) { console.error(`강조색 형식이 올바르지 않습니다 (#RRGGBB): ${color}`); process.exit(1); }

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const { data: existing, error: findErr } = await admin.from('academies').select('id').eq('slug', slug).maybeSingle();
if (findErr) { console.error(`academies 조회 실패: ${findErr.message}`); process.exit(1); }
if (existing) { console.error(`이미 있는 학원 slug 입니다: ${slug}`); process.exit(1); }

const acRow = { slug, name };
if (color) acRow.brand_color = color;
const { data: ac, error: acErr } = await admin.from('academies').insert(acRow).select().single();
if (acErr) { console.error(`academies insert 실패: ${acErr.message}`); process.exit(1); }

const { error: rpErr } = await admin.from('roster_phones').insert({ academy_id: ac.id, phone: dirPhone, role: 'director', name: dirName });
if (rpErr) { console.error(`원장 roster_phones insert 실패: ${rpErr.message}`); process.exit(1); }

const appUrl = 'https://kiddongwook.github.io/bright-demo/pwa/';
console.log(`학원 개설 완료: ${name} (${slug})`);
console.log(`앱 주소: ${appUrl}`);
console.log(`원장 번호: ${dirPhone} — 이 번호로 OTP 로그인하면 원장 권한으로 들어갑니다.`);
console.log('다음 할 일:');
console.log('  1. 실제 명부 CSV 준비 (형식은 tools/roster.sample.csv 참고)');
console.log(`  2. cd tools && node --env-file=../.env.local seed-roster.mjs <csv> ${slug} "${name}"`);
console.log('  3. 원장 번호로 로그인해서 확인');
