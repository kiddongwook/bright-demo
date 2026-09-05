// 4차 묶음 레드팀 — 세 스크립트를 차례로 돈다. 보고서: docs/reports/2026-09-05-redteam-batch4.md
//   cd tools && node --env-file=../.env.local redteam/rt-batch4.mjs 2>&1 | grep -v 'Assertion failed'
// 각 스크립트는 자기 학원(slug rt-b4-*)·사용자(0109…)만 만들고 finally 에서 지운다. otp-send 는 403 이 예상되는 곳에서만 부른다.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const parts = ['rt-batch4-notices.mjs', 'rt-batch4-billing-weekly.mjs', 'rt-batch4-locks-consent-wordmark.mjs'];
let bad = 0;
for (const p of parts) {
  console.log(`\n######## ${p}`);
  const r = spawnSync(process.execPath, [join(here, p)], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) bad++;
}
console.log(bad ? `\n${bad} script(s) exited non-zero` : '\nall scripts ran');
process.exitCode = bad ? 1 : 0;
