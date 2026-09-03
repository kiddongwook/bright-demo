import { normalizePhone } from './phone';
/* 명부 CSV — tools/roster.sample.csv 와 같은 열: 반,요일,시작,끝,학생,학생번호,보호자,보호자번호,관계 */
export type RosterRow = { line: number; cls: string; dows: number[]; start: string; end: string; student: string; student_phone: string; parent: string; parent_phone: string };
export type ParsedRoster = { rows: RosterRow[]; errors: { line: number; msg: string }[] };
const DOW_KO: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const HEAD = ['반', '요일', '시작', '끝', '학생', '학생번호', '보호자', '보호자번호'];

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
    const r: RosterRow = { line, cls: g('반'), dows: parseDows(g('요일')), start: g('시작'), end: g('끝'), student: g('학생'), student_phone: normalizePhone(g('학생번호')), parent: g('보호자'), parent_phone: normalizePhone(g('보호자번호')) };
    if (!r.cls) errors.push({ line, msg: '반이 비었어요' });
    if (!r.student) errors.push({ line, msg: '학생 이름이 비었어요' });
    if (r.student_phone && !/^01[016789]\d{7,8}$/.test(r.student_phone)) errors.push({ line, msg: `학생번호 모양이 이상해요 (${g('학생번호')})` });
    if (r.parent_phone && !/^01[016789]\d{7,8}$/.test(r.parent_phone)) errors.push({ line, msg: `보호자번호 모양이 이상해요 (${g('보호자번호')})` });
    if (!/^\d{2}:\d{2}$/.test(r.start) || !/^\d{2}:\d{2}$/.test(r.end)) errors.push({ line, msg: '시작·끝은 19:00 처럼' });
    if (!r.dows.length) errors.push({ line, msg: '요일은 월수금 처럼' });
    rows.push(r);
  });
  return { rows, errors };
}

/** 같은 학생(이름+학생번호)의 여러 줄(보호자 둘·반 둘)을 하나로 — saveStudent 는 전체 목록을 덮어쓰므로 */
export type RosterStudent = { key: string; name: string; student_phone: string; classes: string[]; parent_phones: string[] };
export function groupRoster(rows: RosterRow[]): { students: RosterStudent[]; classes: { name: string; dows: number[]; start: string; end: string }[] } {
  const st = new Map<string, RosterStudent>(); const cls = new Map<string, { name: string; dows: number[]; start: string; end: string }>();
  for (const r of rows) {
    if (!cls.has(r.cls)) cls.set(r.cls, { name: r.cls, dows: r.dows, start: r.start, end: r.end });
    const key = r.student + '|' + r.student_phone;
    const s = st.get(key) ?? { key, name: r.student, student_phone: r.student_phone, classes: [], parent_phones: [] };
    if (!s.classes.includes(r.cls)) s.classes.push(r.cls);
    if (r.parent_phone && !s.parent_phones.includes(r.parent_phone)) s.parent_phones.push(r.parent_phone);
    st.set(key, s);
  }
  return { students: [...st.values()], classes: [...cls.values()] };
}
