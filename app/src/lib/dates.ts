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

/** '2026-09-11' → '9월 11일 (금)' — 날짜 칸과 공지 본문이 쓰는 긴 꼴 */
export function fmtDateLong(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [, m, d] = iso.split('-');
  return `${+m}월 ${+d}일 (${DOW[dowOf(iso)]})`;
}

/** '19:00' → '오후 7:00' · '00:00' → '오전 12:00' · '12:05' → '오후 12:05' */
export function fmtTime12(hm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return hm;
  const h = +m[1];
  if (h > 23) return hm;
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${m[2]}`;
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
