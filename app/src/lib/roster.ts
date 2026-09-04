/* 명부 화면이 쓰는 순수 계산 — 화면에서 떼어 내 따로 시험한다.
   서버를 부르는 것은 api.ts 에 그대로 있다 (studentDetail·entryStatus). 여기는 계산만. */
import { normalizePhone } from './phone';
import type { EntryRow } from './api';

/** 아직 앱에 안 들어온 번호 → 그 사람의 자리('parent'|'student'). 번호는 정규화해 담는다(명부·상세가 다른 꼴로 올 수 있다). */
export function notEnteredRoles(rows: EntryRow[] | null | undefined): Map<string, EntryRow['role']> {
  const m = new Map<string, EntryRow['role']>();
  for (const r of rows ?? []) if (!r.entered && r.phone) m.set(normalizePhone(r.phone), r.role);
  return m;
}

/** 붙여넣은 번호들을 학부모 칸에 앉힌다.
 *  target 이 숫자면 그 칸이 첫 번호를 받고(붙여넣은 자리), null 이면 첫 번호는 학생 칸이 받았다는 뜻이다.
 *  남은 번호는 앞에서부터 빈 칸을 찾아 채우고, 없으면 칸을 늘린다 — 최대 max 개.
 *  placed 는 실제로 앉힌 번호 수(칸이 모자라 못 앉힌 것은 빼고 센다). */
export function fillParentPhones(pp: string[], phones: string[], target: number | null, max = 3):
  { pp: string[]; placed: number } {
  const next = [...pp];
  let placed = 0;
  const rest = [...phones];
  if (target !== null && target >= 0 && target < next.length) { next[target] = rest.shift() ?? next[target]; placed = 1; }
  else if (target === null) { rest.shift(); placed = 1; }   // 첫 번호는 학생 칸으로 갔다
  for (const p of rest) {
    let i = next.findIndex(x => !x.trim());
    if (i < 0) { if (next.length >= max) break; next.push(''); i = next.length - 1; }
    if (next.some(x => x.trim() && normalizePhone(x) === normalizePhone(p))) continue;   // 이미 적힌 번호는 또 넣지 않는다
    next[i] = p; placed += 1;
  }
  return { pp: next.slice(0, max), placed };
}
