/* 날짜·시간을 사람이 읽는 말로 바꾸는 순수 함수들.
   서버(supabase)를 부르지 않아서 따로 시험하기 쉽다 — 공지 틀과 날짜·시간 칸이 여기만 쓴다.
   iso 는 늘 'YYYY-MM-DD', hm 은 늘 24시간 'HH:MM'. 셈은 UTC 로만 해서 기기 시간대에 흔들리지 않는다. */

export const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' → 요일 번호 (0=일) */
export const dowOf = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay();

/** 'YYYY-MM-DD' 에서 n 일 뒤(음수면 앞) — '2026-09-11' + 7 = '2026-09-18' */
export function addDays(iso: string, n: number): string {
  const t = Date.parse(iso + 'T00:00:00Z');
  if (Number.isNaN(t)) return iso;
  return new Date(t + n * 86400e3).toISOString().slice(0, 10);
}

/** 진짜 있는 날인가 — '2026-02-30' 은 Date 가 3월 2일로 굴려 버려 모양 검사만으로는 못 거른다(INP-47). */
export function isValidIso(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return false;
  const t = Date.parse(iso + 'T00:00:00Z');
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso;
}

/** '2026-09-11' → '9월 11일 (금)' — 날짜 칸과 공지 본문이 쓰는 긴 꼴. 날짜가 아니면 빈 글자(없는 날을 그럴듯하게 보여 주지 않는다). */
export function fmtDateLong(iso: string): string {
  if (!isValidIso(iso)) return '';
  const [, m, d] = iso.split('-');
  return `${+m}월 ${+d}일 (${DOW[dowOf(iso)]})`;
}

/** 시각 한 가지 모양 — 'HH:MM' 24시간, 00:00~23:59 (INP-45/49/60). 모든 문지기가 이것만 본다. */
export const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isValidHm = (s: string | undefined | null): boolean => HM_RE.test((s ?? '').trim());
/** '7:00' 처럼 앞의 0 이 빠진 시각을 'HH:MM' 으로 — 들어오는 자리(반 저장·CSV)에서만 쓴다(INP-46). */
export function normHm(s: string | undefined | null): string {
  const t = (s ?? '').trim();
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(t);
  if (!m) return t;
  return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`;
}
/** 'HH:MM' → 자정부터 분. 모양이 아니면 null (시간표가 비어 있어도 터지지 않게). */
export function hmToMin(hm: string | undefined | null): number | null {
  const t = (hm ?? '').trim();
  if (!HM_RE.test(t)) return null;
  return +t.slice(0, 2) * 60 + +t.slice(3, 5);
}

/** '19:00' → '오후 7:00' · '00:00' → '오전 12:00' · '12:05' → '오후 12:05'. 시각이 아니면 빈 글자. */
export function fmtTime12(hm: string): string {
  const t = (hm ?? '').trim();
  if (!HM_RE.test(t)) return '';
  const h = +t.slice(0, 2);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${t.slice(3, 5)}`;
}

/** 'HH:MM' 로 맞춰 준다 — 시·분 숫자를 하나로 */
export const hm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** 한글 받침을 보고 을/를 을 붙인다 — '단어 시험을', '중간고사를' */
export function withEul(word: string): string {
  const s = word.trim();
  if (!s) return s;
  const c = s.charCodeAt(s.length - 1);
  const jong = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return s + (jong ? '을' : '를');
}

/* ── 오늘(한국 시각) ── */
/** 지금 한국 날짜 'YYYY-MM-DD' — UTC 에 9시간을 더해 자정 넘김을 맞춘다 */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}
/** 오늘에서 n 일 뒤(음수면 앞)의 한국 날짜 */
export function kstDate(offsetDays: number): string {
  return new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
}

/* 9월 4일 금요일 — 홈 제목용 */
export const DOW_FULL = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
export function fmtDateFull(iso: string): string { const [, m, dd] = iso.split('-').map(Number); return `${m}월 ${dd}일 ${DOW_FULL[dowOf(iso)]}`; }
