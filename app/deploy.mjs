// 배포: GitHub Pages 의 /bright-demo/pwa/ 로. 빌드 결과를 저장소 루트 /pwa/ 에 복사한다 (커밋해서 푸시하면 Pages 가 서빙).
// node deploy.mjs            → base /bright-demo/pwa/
// 미리 보기: VITE_BASE=/bright-demo/pwa/ npx vite preview --port 4174 → http://localhost:4174/bright-demo/pwa/
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const BASE = process.env.VITE_BASE ?? '/bright-demo/pwa/';
execSync('npx tsc -b && npx vite build', { stdio: 'inherit', env: { ...process.env, VITE_BASE: BASE } });
const out = path.resolve('..', 'pwa');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync('dist', out, { recursive: true });
fs.writeFileSync(path.resolve('..', '.nojekyll'), '');
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
if (!html.includes(`${BASE}assets/`)) throw new Error('index.html 의 자산 경로가 base 와 다르다: ' + BASE);
console.log(`배포물 준비: ${out} (base ${BASE}). 커밋·푸시하면 https://kiddongwook.github.io${BASE} 에 뜬다.`);
