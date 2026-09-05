// 학원 로고 심기: PNG 를 logos 버킷 <academy_id>/logo.png 에 올리고 academies.logo_path 를 채운다.
// 원장님이 앱에서 올리는 것과 같은 자리다(app/src/lib/logo.ts 의 uploadLogo) — 운영자가 대신 넣어 줄 때 쓴다.
// node --env-file=../.env.local set-academy-logo.mjs <slug> <png 경로>
//
// 넣는 PNG 는 512×512 정사각·불투명을 권한다. 앱이 이 한 장을 세 자리에 그대로 쓰기 때문이다:
//   문·앱바 로고(어두운 화면에도 이 한 장) · 홈 화면 아이콘(any maskable) · 설치 미리보기(objectFit:cover).
// 투명 배경이나 가로로 긴 그림은 어두운 화면에서 안 보이거나 잘린다.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const USAGE = 'usage: set-academy-logo.mjs <slug> <png 경로>';
const [slug, file] = process.argv.slice(2);
if (!slug || !file) { console.log(USAGE); process.exit(2); }

let png;
try { png = readFileSync(file); } catch (e) { console.error(`파일을 열 수 없습니다: ${file} (${e.message})`); process.exit(1); }
if (png.length < 8 || png.readUInt32BE(0) !== 0x89504e47) { console.error(`PNG 가 아닙니다: ${file}`); process.exit(1); }
if (png.length > 1048576) { console.error(`logos 버킷 한도(1MB)를 넘습니다: ${png.length} bytes`); process.exit(1); }
const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
if (w !== h) console.warn(`경고: 정사각이 아닙니다 (${w}×${h}). 앱은 정사각을 기대합니다 — 자리마다 잘려 보일 수 있어요.`);

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const { data: ac, error: findErr } = await admin.from('academies').select('id, name, logo_path').eq('slug', slug).maybeSingle();
if (findErr) { console.error(`academies 조회 실패: ${findErr.message}`); process.exit(1); }
if (!ac) { console.error(`없는 학원 slug 입니다: ${slug}`); process.exit(1); }

const path = `${ac.id}/logo.png`;
const { error: upErr } = await admin.storage.from('logos').upload(path, png, { contentType: 'image/png', upsert: true });
if (upErr) { console.error(`logos 업로드 실패: ${upErr.message}`); process.exit(1); }

const { error: setErr } = await admin.from('academies').update({ logo_path: path }).eq('id', ac.id);
if (setErr) { console.error(`logo_path 갱신 실패: ${setErr.message}`); process.exit(1); }

const { data: pub, error: pubErr } = await admin.rpc('public_academy', { p_slug: slug });
if (pubErr) { console.error(`public_academy 확인 실패: ${pubErr.message}`); process.exit(1); }

const { data: url } = admin.storage.from('logos').getPublicUrl(path);
console.log(`로고 심기 완료: ${ac.name} (${slug})`);
console.log(`  파일: ${file} — ${w}×${h}, ${png.length} bytes`);
console.log(`  저장 경로: ${path}${ac.logo_path && ac.logo_path !== path ? ` (이전: ${ac.logo_path})` : ''}`);
console.log(`  공개 주소: ${url.publicUrl}`);
console.log(`  public_academy('${slug}') → ${JSON.stringify(pub)}`);
console.log('');
console.log('주의: 이미 홈 화면에 깔린 앱의 아이콘은 안 바뀝니다(설치 시점에 굳음). 지우고 다시 설치해야 합니다.');
console.log('      같은 경로를 덮어썼으므로 CDN 이 옛 그림을 한동안 더 줄 수 있습니다(최대 1시간).');
