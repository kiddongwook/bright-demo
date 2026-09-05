import { supabase } from './supabase';
import { DOW, kstDate, isValidIso, isValidHm } from './dates';
import { humanizeError } from './toast';
import { removeNoticePhotos } from './files';
import type { Notice } from './api';

/* 공지 예약 발송 (0027) — 화면이 부르는 얇은 함수와, 시각을 글자로 바꾸는 순수 함수들.
   시각은 늘 한국 시각(KST)으로 셈한다 — DateField·kstToday 와 같은 규칙. 기기 시간대에 흔들리지 않게
   toLocale* 는 쓰지 않는다(순수 함수는 vitest node 환경에서도 같은 답을 내야 한다). */

/** api.ts 의 Notice 에 예약 칸을 얹은 꼴. api.ts 의 select(NOTICE_COLS) 가 두 칸을 아직 안 주면 없을 수 있어 optional. */
export type ScheduledNotice = Notice & { publish_at?: string | null; fanned_at?: string | null };

const KST = 9 * 3600e3;
const pad = (n: number) => String(n).padStart(2, '0');

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/* ── 순수 함수 ── */

/** 아직 안 나간 예약 공지인가 — 나갈 시각이 미래이고 fanned_at 이 없다. 칸이 없으면(옛 select) false. */
export function isScheduled(n: { publish_at?: string | null; fanned_at?: string | null }, now: number = Date.now()): boolean {
  if (!n.publish_at || n.fanned_at) return false;
  const t = Date.parse(n.publish_at);
  return !Number.isNaN(t) && t > now;
}

/** '2026-09-06T08:00:00+09:00' → '9/6 (토) 08:00' (한국 시각). 시각이 아니면 빈 글자. */
export function fmtPublishAt(iso: string | null | undefined): string {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return '';
  const d = new Date(t + KST);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${DOW[d.getUTCDay()]}) ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 날짜 칸('YYYY-MM-DD') + 시간 칸('HH:MM') → 그 한국 시각의 Date. 모양이 아니면 null. */
export function toPublishAt(date: string, hm: string): Date | null {
  if (!isValidIso(date) || !isValidHm(hm)) return null;
  return new Date(`${date}T${hm.trim()}:00+09:00`);
}

/** 나갈 시각을 날짜 칸·시간 칸 글자로 쪼갠다(한국 시각) — 시간 바꾸기 판을 지금 값으로 채울 때. 시각이 아니면 기본값. */
export function publishAtParts(iso: string | null | undefined): { date: string; hm: string } {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return defaultScheduleAt();
  const d = new Date(t + KST);
  return { date: d.toISOString().slice(0, 10), hm: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

/** 예약 기본값 — 내일 08:00 (한국 시각). DateField·TimeField 가 받는 글자 꼴로 준다. */
export function defaultScheduleAt(): { date: string; hm: string } {
  return { date: kstDate(1), hm: '08:00' };
}

/** 예약 시각이 앉힐 수 있는 때인가 — 지금보다 뒤, 90일 안(서버 bad_time 과 같은 금). */
export function scheduleProblem(at: Date | null, now: number = Date.now()): string | null {
  if (!at || Number.isNaN(at.getTime())) return '날짜와 시간을 골라 주세요';
  if (at.getTime() <= now) return '지금보다 뒤의 시간을 골라 주세요';
  if (at.getTime() > now + 90 * 86400e3) return '예약은 90일 안까지만 돼요';
  return null;
}

/** 예약 공지가 위로, 그 안에서는 나갈 시각이 이른 것부터. 나머지는 원래 차례(만든 순 내림차순). */
export function sortWithScheduled<T extends { publish_at?: string | null; fanned_at?: string | null }>(list: T[], now: number = Date.now()): T[] {
  const sched = list.filter(n => isScheduled(n, now)).sort((a, b) => Date.parse(a.publish_at!) - Date.parse(b.publish_at!));
  return [...sched, ...list.filter(n => !isScheduled(n, now))];
}

/** 서버가 던지는 짧은 코드 → 사람 말. 여기 없는 것은 공용 humanizeError 로. */
export function humanizeScheduleError(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  if (/bad_time/.test(m)) return '예약은 지금부터 90일 안까지만 돼요';
  if (/already_published/.test(m)) return '이미 나간 공지예요';
  if (/not_published/.test(m)) return '아직 안 나간 공지예요';
  return humanizeError(e);
}

/* ── 서버 ── */

/** 공지 + 대상 반 + 나갈 시각을 한 트랜잭션에 (create_notice_v2 4인자). publishAt 이 null 이면 지금 나간다. 공지 id 를 돌려준다. */
export async function createNoticeScheduled(title: string, body: string, classIds: string[], publishAt: Date | null): Promise<string> {
  return must(await supabase.rpc('create_notice_v2', {
    p_title: title, p_body: body, p_class_ids: classIds, p_publish_at: publishAt ? publishAt.toISOString() : null,
  })) as string;
}

/** 나갈 시각 바꾸기. at 이 null 이면 지금 바로 보낸다. 이미 나간 공지는 서버가 거절한다(already_published). */
export async function rescheduleNotice(id: string, at: Date | null): Promise<void> {
  must(await supabase.rpc('reschedule_notice', { p_notice: id, p_publish_at: at ? at.toISOString() : null }));
}

/** 공지 지우기 — 행은 RLS(notices_write)가, 알림·발송 줄은 0018 트리거가 치운다. 사진은 뒤따라 지우되 실패해도 넘어간다. */
export async function deleteNotice(id: string, photos: string[] = []): Promise<void> {
  must(await supabase.from('notices').delete().eq('id', id));
  if (photos.length) await removeNoticePhotos(photos).catch(() => {});
}

/** api.ts 의 listNotices 가 publish_at·fanned_at 을 아직 안 실어 주면 예약 칸만 따로 읽어 붙인다.
 *  NOTICE_COLS 에 두 칸이 들어가면 첫 줄에 이미 있어 그냥 돌려준다(질의가 하나 줄어든다). */
export async function withSchedule(list: Notice[]): Promise<ScheduledNotice[]> {
  if (list.length === 0 || 'publish_at' in list[0]) return list as ScheduledNotice[];
  const rows = must(await supabase.from('notices').select('id, publish_at, fanned_at').is('fanned_at', null)) as { id: string; publish_at: string; fanned_at: string | null }[];
  const by = new Map(rows.map(r => [r.id, r]));
  return list.map(n => {
    const s = by.get(n.id);
    return s ? { ...n, publish_at: s.publish_at, fanned_at: s.fanned_at } : { ...n, publish_at: n.created_at, fanned_at: n.created_at };
  });
}
