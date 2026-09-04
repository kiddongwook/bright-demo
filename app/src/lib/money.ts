/* 돈 — 보여 주기와 읽어 들이기 한 곳.
   원장이 금액 칸에 치는 말은 한결같지 않다: "150000", "150,000", "15만", 가끔 자리를 잘못 끊은 "15,0000".
   전부 같은 뜻으로 읽고, 화면에는 늘 세 자리 콤마로 되돌려 준다. */

/** 150000 → "150,000원" */
export const fmtWon = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
/** 150000 → "150,000" (칸 안에서 치는 동안 보여 주는 꼴 — '원'은 붙이지 않는다) */
export const fmtComma = (n: number | string) => {
  const v = typeof n === 'string' ? Number(n.replace(/[^0-9]/g, '')) : n;
  return Number.isFinite(v) && v ? Math.round(v).toLocaleString('ko-KR') : '';
};

const UNIT: Record<string, number> = { '억': 100000000, '만': 10000, '천': 1000, '백': 100 };

/**
 * 사람이 친 금액 → 숫자. 못 읽으면 0.
 * "150,000" → 150000 · "15만" → 150000 · "15,0000" → 150000 · "150000원" → 150000 · "1만5천" → 15000
 */
export function parseWon(s: string | number | null | undefined): number {
  if (typeof s === 'number') return Number.isFinite(s) ? Math.max(0, Math.round(s)) : 0;
  const t = (s ?? '').replace(/[\s,원]/g, '');
  if (!t || !/[0-9]/.test(t)) return 0;
  let sum = 0; let seen = false;
  for (const m of t.matchAll(/([0-9]+)\s*(억|만|천|백)?/g)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    sum += n * (m[2] ? UNIT[m[2]] : 1);
    seen = true;
  }
  return seen ? Math.max(0, Math.round(sum)) : 0;
}
