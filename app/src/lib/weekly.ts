import { supabase } from './supabase';
import { getContext } from './api';
import { DOW } from './dates';

/* 학부모 주간 요약(0029) — 학원 단위 설정.
   매주 정해진 요일·시(KST)에 학부모에게 "이번 주 출결·숙제·다음 수업" 한 줄이 앱 알림(푸시)으로 간다.
   설정은 academies 표의 weekly_* 열 — 원장이 academies_write 로 고친다. api.ts 의 academy() 는 건드리지 않고
   여기서 따로 읽는다(동시 작업 충돌을 피하려고). 사람 말로 바꾸는 함수는 순수라 따로 시험한다. */

export type WeeklySettings = { weekly_summary: boolean; weekly_dow: number; weekly_hour: number };

/** 요일 이름 — 번호는 Postgres extract(dow) 와 같다(0=일 … 6=토) */
export const DOW_LABELS = DOW;
/** 화면에 늘어놓는 순서 — 월요일부터 */
export const WEEKLY_DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
/** 보낼 수 있는 시 — 새벽·심야는 막는다 (DB check 와 같다) */
export const WEEKLY_HOUR_MIN = 6;
export const WEEKLY_HOUR_MAX = 22;
export const DEFAULT_WEEKLY: WeeklySettings = { weekly_summary: true, weekly_dow: 5, weekly_hour: 18 };

const two = (n: number) => String(n).padStart(2, '0');
export const clampHour = (h: number) => Math.min(WEEKLY_HOUR_MAX, Math.max(WEEKLY_HOUR_MIN, Math.round(Number.isFinite(h) ? h : DEFAULT_WEEKLY.weekly_hour)));

/** '금 18:00' · 꺼져 있으면 '꺼져 있어요' */
export function describeWeekly(s: WeeklySettings | null | undefined): string {
  if (!s || !s.weekly_summary) return '꺼져 있어요';
  const d = DOW_LABELS[s.weekly_dow] ?? DOW_LABELS[DEFAULT_WEEKLY.weekly_dow];
  return `${d} ${two(clampHour(s.weekly_hour))}:00`;
}

/** 저장한 뒤 띄우는 한 줄 — '매주 금 18:00에 학부모에게 요약이 가요' */
export function weeklyToast(s: WeeklySettings): string {
  return s.weekly_summary ? `매주 ${describeWeekly(s)}에 학부모에게 요약이 가요` : '주간 요약을 껐어요. 학부모에게 가지 않아요';
}

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export async function getWeeklySettings(): Promise<WeeklySettings> {
  const r = must(await supabase.from('academies').select('weekly_summary, weekly_dow, weekly_hour').eq('id', getContext().academyId).single()) as Partial<WeeklySettings> | null;
  return {
    weekly_summary: r?.weekly_summary ?? DEFAULT_WEEKLY.weekly_summary,
    weekly_dow: r?.weekly_dow ?? DEFAULT_WEEKLY.weekly_dow,
    weekly_hour: clampHour(r?.weekly_hour ?? DEFAULT_WEEKLY.weekly_hour),
  };
}

export async function setWeeklySettings(s: WeeklySettings): Promise<void> {
  const row = { weekly_summary: !!s.weekly_summary, weekly_dow: WEEKLY_DOW_ORDER.includes(s.weekly_dow) ? s.weekly_dow : DEFAULT_WEEKLY.weekly_dow, weekly_hour: clampHour(s.weekly_hour) };
  must(await supabase.from('academies').update(row).eq('id', getContext().academyId));
}
