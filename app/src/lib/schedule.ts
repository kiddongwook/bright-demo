import { DOW, hmToMin, normHm } from './dates';

/* 반 시간표를 "요일 시간 묶음"으로 다루는 순수 함수들.
   서버가 갖고 있는 꼴은 요일 하나에 줄 하나({dow,start,end}[]) 지만,
   원장이 머리로 그리는 꼴은 "월·수·금 19:00–21:00 / 토 10:00–12:00" 처럼 묶음이다.
   화면은 묶음으로 고치고, 저장 직전에 다시 줄로 편다 — 그 오가는 셈만 여기 모았다.
   서버를 부르지 않아 따로 시험한다. */

export type Slot = { dow: number; start: string; end: string };
/** 같은 시간을 쓰는 요일 한 묶음 — 한 요일은 한 묶음에만 들어간다 */
export type Group = { dows: number[]; start: string; end: string };

/** 한 주를 월요일부터 본다 — 학원이 시간표를 읽는 순서 */
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
/** 월→일 순서 번호. 모르는 값은 맨 뒤로. */
export const dowRank = (d: number) => { const i = DOW_ORDER.indexOf(d); return i < 0 ? DOW_ORDER.length : i; };

export const DEFAULT_START = '19:00';
export const DEFAULT_END = '21:00';

/** 줄 → 묶음. 시작·끝이 똑같은 요일끼리 하나로 묶고, 묶음은 첫 요일이 이른 순서로. */
export function toGroups(schedule: Slot[] | null | undefined): Group[] {
  const buckets = new Map<string, Group>();
  for (const s of schedule ?? []) {
    const start = normHm(s.start), end = normHm(s.end);
    const k = `${start}-${end}`;
    const g = buckets.get(k);
    if (g) { if (!g.dows.includes(s.dow)) g.dows.push(s.dow); }
    else buckets.set(k, { dows: [s.dow], start, end });
  }
  const groups = [...buckets.values()];
  for (const g of groups) g.dows.sort((a, b) => dowRank(a) - dowRank(b));
  return groups.sort((a, b) => dowRank(a.dows[0] ?? 99) - dowRank(b.dows[0] ?? 99));
}

/** 묶음 → 줄. 월→일 순서로 펴고, 시각은 'HH:MM' 으로 맞춘다. 빈 묶음은 그냥 빠진다. */
export function fromGroups(groups: Group[]): Slot[] {
  const out: Slot[] = [];
  for (const g of groups) for (const dow of g.dows) out.push({ dow, start: normHm(g.start), end: normHm(g.end) });
  return out.sort((a, b) => dowRank(a.dow) - dowRank(b.dow) || a.start.localeCompare(b.start));
}

/** 저장해도 되나 — 안 되면 사람 말 한 줄, 되면 null. 저장 단추가 이것만 본다. */
export function validateGroups(groups: Group[]): string | null {
  if (!groups.length || groups.every(g => !g.dows.length)) return '요일을 하나 이상 골라주세요';
  const seen = new Map<number, number>();      /* 요일 → 몇 번째 묶음 */
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!g.dows.length) return '요일을 안 고른 시간 묶음이 있어요. 요일을 고르거나 그 묶음을 지워 주세요';
    const s = hmToMin(normHm(g.start)), e = hmToMin(normHm(g.end));
    /* 24:00·19:60 같은 값은 저장돼도 오늘 수업·다음 수업에서 조용히 빠진다 — 여기서 막는다(INP-45) */
    if (s === null || e === null) return '시간은 19:00 처럼 적어주세요 (00:00~23:59)';
    if (e <= s) return '끝나는 시간이 시작보다 늦어야 해요';
    for (const d of g.dows) {
      const prev = seen.get(d);
      if (prev !== undefined && prev !== i) return `${DOW[d]}요일이 두 묶음에 들어 있어요. 한 묶음에만 넣어 주세요`;
      seen.set(d, i);
    }
  }
  return null;
}

/** 어느 묶음에도 안 든 요일 — "다른 시간 묶음" 을 만들 때 미리 채워 준다 */
export function unassignedDows(groups: Group[]): number[] {
  const used = new Set(groups.flatMap(g => g.dows));
  return DOW_ORDER.filter(d => !used.has(d));
}

/** i 번째 묶음에서 요일을 켜고 끈다 — 켜면 다른 묶음에서는 빠진다(한 요일은 한 묶음). */
export function toggleDow(groups: Group[], i: number, dow: number): Group[] {
  const on = groups[i]?.dows.includes(dow);
  return groups.map((g, gi) => gi === i
    ? { ...g, dows: on ? g.dows.filter(d => d !== dow) : [...g.dows, dow].sort((a, b) => dowRank(a) - dowRank(b)) }
    : { ...g, dows: on ? g.dows : g.dows.filter(d => d !== dow) });
}

/** 묶음 한 줄을 사람 말로 — '월·수·금' */
export const dowsLabel = (dows: number[]) => [...dows].sort((a, b) => dowRank(a) - dowRank(b)).map(d => DOW[d]).join('·');
