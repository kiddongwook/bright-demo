import { isValidMobile, normalizePhone } from './phone';
import { isValidHm, normHm } from './dates';
/* 명부 CSV — tools/roster.sample.csv 와 같은 열: 반,요일,시작,끝,학생,학생번호,보호자,보호자번호,관계 */
export type RosterRow = { line: number; cls: string; dows: number[]; start: string; end: string; student: string; student_phone: string; parent: string; parent_phone: string };
export type ParsedRoster = { rows: RosterRow[]; errors: { line: number; msg: string }[] };
const DOW_KO: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const HEAD = ['반', '요일', '시작', '끝', '학생', '학생번호', '보호자', '보호자번호'];
export const NAME_MAX = 20;

/** 따옴표·쉼표·CRLF·BOM 을 다루는 작은 CSV 파서 */
export function splitCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter(r => r.some(x => x.trim() !== ''));
}
export const parseDows = (s: string) => [...s].map(ch => DOW_KO[ch]).filter((d): d is number => d !== undefined);

export function parseRosterCsv(text: string): ParsedRoster {
  const lines = splitCsv(text); const errors: ParsedRoster['errors'] = []; const rows: RosterRow[] = [];
  if (!lines.length) return { rows, errors: [{ line: 1, msg: '비어 있어요' }] };
  const head = lines[0].map(h => h.trim());
  const idx = Object.fromEntries(HEAD.map(h => [h, head.indexOf(h)])) as Record<string, number>;
  const missing = HEAD.filter(h => idx[h] < 0);
  if (missing.length) return { rows, errors: [{ line: 1, msg: `머리글에 ${missing.join('·')} 이 없어요` }] };
  lines.slice(1).forEach((l, i) => {
    const line = i + 2; const g = (h: string) => (l[idx[h]] ?? '').trim();
    /* 시각은 들어올 때 'HH:MM' 으로 맞춘다 — '7:00' 을 CSV 만 거절하던 어긋남을 없앤다(INP-46) */
    const r: RosterRow = { line, cls: g('반'), dows: parseDows(g('요일')), start: normHm(g('시작')), end: normHm(g('끝')), student: g('학생'), student_phone: normalizePhone(g('학생번호')), parent: g('보호자'), parent_phone: normalizePhone(g('보호자번호')) };
    if (!r.cls) errors.push({ line, msg: '반이 비었어요' });
    if (!r.student) errors.push({ line, msg: '학생 이름이 비었어요' });
    if (r.student.length > NAME_MAX) errors.push({ line, msg: `학생 이름은 ${NAME_MAX}자까지예요` });
    if (r.student_phone && !isValidMobile(r.student_phone)) errors.push({ line, msg: `학생번호 모양이 이상해요 (${g('학생번호')})` });
    if (r.parent_phone && !isValidMobile(r.parent_phone)) errors.push({ line, msg: `보호자번호 모양이 이상해요 (${g('보호자번호')})` });
    /* 24:00·25:00·19:60 은 시간표에 앉으면 조용히 사라진다 — 여기서 막는다(INP-60/45) */
    if (!isValidHm(r.start) || !isValidHm(r.end)) errors.push({ line, msg: '시작·끝은 19:00 처럼 (00:00~23:59)' });
    else if (r.end <= r.start) errors.push({ line, msg: '끝나는 시간이 시작보다 늦어야 해요' });
    if (!r.dows.length) errors.push({ line, msg: '요일은 월수금 처럼' });
    rows.push(r);
  });
  return { rows, errors };
}

const BOM = '﻿';
/** 표(행×열) → CSV 문자열. BOM(엑셀 호환) + CRLF, 쉼표·따옴표·줄바꿈이 있는 칸만 따옴표로 감싼다(따옴표는 두 배로). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return BOM + rows.map(r => r.map(cell).join(',')).join('\r\n');
}

/** 같은 학생(이름+학생번호)의 여러 줄(보호자 둘·반 둘)을 하나로 — saveStudent 는 전체 목록을 덮어쓰므로 */
export type RosterStudent = { key: string; name: string; student_phone: string; classes: string[]; parent_phones: string[]; lines: number[] };
export function groupRoster(rows: RosterRow[]): { students: RosterStudent[]; classes: { name: string; dows: number[]; start: string; end: string }[] } {
  const st = new Map<string, RosterStudent>(); const cls = new Map<string, { name: string; dows: number[]; start: string; end: string }>();
  for (const r of rows) {
    if (!cls.has(r.cls)) cls.set(r.cls, { name: r.cls, dows: r.dows, start: r.start, end: r.end });
    const key = r.student + '|' + r.student_phone;
    const s = st.get(key) ?? { key, name: r.student, student_phone: r.student_phone, classes: [], parent_phones: [], lines: [] };
    if (!s.classes.includes(r.cls)) s.classes.push(r.cls);
    if (r.parent_phone && !s.parent_phones.includes(r.parent_phone)) s.parent_phones.push(r.parent_phone);
    if (!s.lines.includes(r.line)) s.lines.push(r.line);
    st.set(key, s);
  }
  return { students: [...st.values()], classes: [...cls.values()] };
}

/* ── 이미 있는 학생과 짝짓기 (INP-62) ──
   빈 학생번호 + 동명이인이면 첫 후보에게 무조건 붙던 자리. 이제 세 갈래로 나눈다:
     새로 넣기(new) · 번호가 딱 맞는 학생 갱신(update) · 사람은 하나지만 번호로 확인이 안 되는 합치기(merge, 확인 받고).
   후보가 둘 이상이면 아무것도 하지 않고 오류로 돌려준다 — 남의 아이 명부를 갈아치우지 않는다. */
export type ExistingStudent = { id: string; name: string; student_phone: string; parent_phones: string[]; class_ids: string[] };
export type MatchResult =
  | { kind: 'new' }
  | { kind: 'update'; id: string }
  | { kind: 'merge'; id: string }
  | { kind: 'ambiguous' };

/** cands 는 이름이 같은 활성 학생들(그 학원의). */
export function matchStudent(s: { student_phone: string }, cands: ExistingStudent[]): MatchResult {
  if (!cands.length) return { kind: 'new' };
  if (s.student_phone) {
    const exact = cands.filter(c => c.student_phone === s.student_phone);
    if (exact.length === 1) return { kind: 'update', id: exact[0].id };
    if (exact.length > 1) return { kind: 'ambiguous' };
    // 번호가 맞는 후보가 없다 — 번호가 아직 비어 있는 후보라면 같은 사람일 수 있다
    const blank = cands.filter(c => !c.student_phone);
    if (blank.length === 1) return { kind: 'merge', id: blank[0].id };
    if (blank.length > 1) return { kind: 'ambiguous' };
    return { kind: 'new' };
  }
  if (cands.length > 1) return { kind: 'ambiguous' };
  return { kind: 'merge', id: cands[0].id };
}

/** 보호자 번호는 절대 덮어쓰지 않는다 — 이미 있던 것과 CSV 것을 합친다(순서 유지, 겹치면 한 번). */
export const mergePhones = (before: string[], add: string[]): string[] => {
  const out = [...before];
  for (const p of add) if (p && !out.includes(p)) out.push(p);
  return out;
};

export type ImportPlan = {
  /** 학생 key → 어떻게 할지 */
  by: Map<string, MatchResult>;
  /** 적용 전에 확인받을 줄 — "기존 학생 김민수에 합쳐요" */
  merges: string[];
  /** 막는 오류 — 동명이인이라 사람을 고를 수 없는 줄 */
  errors: { line: number; msg: string }[];
};
/** 이미 있는 학생 목록(이름이 겹치는 것만 채워 와도 된다)과 CSV 학생을 맞춰 본다. 순수 함수 — 화면이 미리보기에 그대로 쓴다. */
export function planImport(students: RosterStudent[], existing: ExistingStudent[]): ImportPlan {
  const by = new Map<string, MatchResult>(); const merges: string[] = []; const errors: ImportPlan['errors'] = [];
  for (const s of students) {
    const cands = existing.filter(e => e.name === s.name);
    const r = matchStudent(s, cands);
    by.set(s.key, r);
    if (r.kind === 'ambiguous') errors.push({ line: s.lines[0] ?? 1, msg: `동명이인이 있어 학생 번호가 필요해요 (${s.lines.join('·')}줄)` });
    if (r.kind === 'merge') merges.push(`기존 학생 ${s.name}에 합쳐요`);
  }
  return { by, merges, errors };
}
