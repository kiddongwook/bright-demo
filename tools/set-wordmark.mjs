// 학원 가로 로고(워드마크)를 서비스 키로 올리고 academies.wordmark_path / wordmark_dark_path 를 채운다.
//   cd tools && node --env-file=../.env.local set-wordmark.mjs <slug> <light.png> [dark.png]
// 화면에서 올리는 것과 같은 자리(logos/<academy_id>/wordmark.png, wordmark-dark.png)를 쓴다.
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';

const [, , slug, lightFile, darkFile] = process.argv;
if (!slug || !lightFile) { console.error('쓰는 법: node --env-file=../.env.local set-wordmark.mjs <slug> <light.png> [dark.png]'); process.exit(2); }
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { data: a, error } = await s.from('academies').select('id,slug,name').eq('slug', slug).maybeSingle();
if (error || !a) { console.error('학원을 못 찾았다:', slug, error?.message ?? ''); process.exit(1); }

async function put(file, name) {
  const buf = await readFile(file);
  if (buf.length > 1024 * 1024) throw new Error(`${file} 가 1MB 를 넘는다 (${buf.length})`);
  const path = `${a.id}/${name}`;
  const { error: e } = await s.storage.from('logos').upload(path, buf, { contentType: 'image/png', upsert: true });
  if (e) throw new Error(`올리기 실패 ${path}: ${e.message}`);
  return path;
}
const patch = { wordmark_path: await put(lightFile, 'wordmark.png') };
if (darkFile) patch.wordmark_dark_path = await put(darkFile, 'wordmark-dark.png');
const { error: ue } = await s.from('academies').update(patch).eq('id', a.id);
if (ue) { console.error('경로 저장 실패:', ue.message); process.exit(1); }
console.log(`${a.name} (${a.slug}) ←`, patch);
