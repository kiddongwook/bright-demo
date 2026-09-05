import { reportError } from './report';

let el: HTMLDivElement | null = null; let timer: ReturnType<typeof setTimeout> | undefined;

type ToastOpts = { action?: { label: string; onClick: () => void }; ms?: number };

export function toast(msg: string, opts: ToastOpts = {}) {
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  const box = el;
  const text = document.createElement('span'); text.className = 'tt'; text.textContent = msg;
  const kids: Node[] = [text];
  if (opts.action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ta'; b.textContent = opts.action.label;
    const act = opts.action.onClick;
    b.addEventListener('click', () => { clearTimeout(timer); box.classList.remove('show'); act(); });
    kids.push(b);
  }
  box.replaceChildren(...kids);
  box.classList.add('show');
  clearTimeout(timer); timer = setTimeout(() => box.classList.remove('show'), opts.ms ?? 2600);
}

/* 서버가 던지는 짧은 코드 → 사람 말 */
const SERVER_MSG: [RegExp, string][] = [
  /* BRIGHT 운영자 화면 (0023) — 아래의 느슨한 규칙(title·duplicate key)보다 먼저 본다 */
  [/not_operator/, '운영자만 할 수 있어요'],
  [/slug_taken/, '이미 쓰는 주소예요. 다른 주소로 바꿔 주세요'],
  [/slug_mismatch|bad_confirm/, '주소(slug)가 달라요. 화면에 보이는 그대로 입력해 주세요'],
  [/bad_slug/, '주소는 영어 소문자·숫자·붙임표만, 2~40자예요'],
  [/bad_director_name/, '원장 이름을 넣어 주세요 (20자까지)'],
  [/bad_name/, '학원 이름을 넣어 주세요 (40자까지)'],
  [/bad_color/, '강조색 형식이 아니에요'],
  [/bad_provider/, '발신 모드는 console 이나 http 만 돼요'],
  [/bad_key/, '발신키가 너무 길어요 (200자까지)'],
  [/no_director/, '이 학원에 원장 번호가 없어요. 명부를 먼저 넣어 주세요'],
  [/academy_locked/, '이 학원은 지금 이용이 정지되어 있어요'],
  [/bad_academy|not_found/, '학원을 찾지 못했어요. 목록을 새로 불러와 주세요'],
  [/overpay/, '남은 금액보다 많아요. 남은 금액까지만 받을 수 있어요'],
  [/over_cap/, '금액이 너무 커요 (500만 원까지)'],
  [/below_paid/, '이미 받은 금액보다 적게는 못 바꿔요. 납부 기록을 먼저 지워 주세요'],
  [/has_payments/, '납부 기록이 있는 청구서는 면제할 수 없어요. 납부 기록을 먼저 지워 주세요'],
  [/bad_phone/, '휴대폰 번호 형식이 아니에요 (010-0000-0000)'],
  [/bad schedule/, '시간표 형식이 맞지 않아요. 시작·끝 시간을 다시 골라 주세요'],
  [/closed_by_all/, '이미 전체 휴원일이에요. 그날은 모든 반이 쉬어요'],
  [/name too long|students_name/, '이름은 20자까지예요'],
  [/notices_title|title/, '제목은 1~80자예요'],
  [/attendance_note/, '사유는 100자까지예요'],
  [/bank_info/, '계좌 안내는 200자까지예요'],
  [/period_ym/, '달 형식이 맞지 않아요'],
  [/rate limit/, '잠시 뒤 다시 시도해 주세요'],
  [/duplicate key|23505/, '이미 있는 항목이에요'],
  /* 반을 없앨 때 서버가 막는 두 자리 — 화면이 먼저 세어 보고 막지만, 그 사이에 다른 손이 넣었을 수 있다 */
  [/notices_target_class_id_fkey|notice_targets_class_id_fkey/, '이 반을 대상으로 한 공지가 있어 없앨 수 없어요. 공지를 먼저 지워 주세요'],
  [/enrollments_class_id_fkey/, '이 반에 다니는 학생이 있어 없앨 수 없어요. 학생을 다른 반으로 먼저 옮겨 주세요'],
  /* 나머지 걸림은 두루뭉술하게 — 맨 뒤에 둬서 위의 또렷한 안내를 가리지 않는다 */
  [/violates foreign key|23503/, '연결된 기록이 있어 지울 수 없어요. 먼저 정리해 주세요'],
];
export function humanizeError(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  for (const [re, txt] of SERVER_MSG) if (re.test(m)) return txt;
  return m || '실패했어요. 다시 시도해 주세요.';
}
export const errToast = (e: unknown) => { toast(humanizeError(e)); void reportError(e); };

/* 되돌리기용 지연 삭제 — 화면이 사라져도 타이머는 남아 진짜 삭제가 돈다 */
const pending = new Map<string, ReturnType<typeof setTimeout>>();
export const isPending = (key: string) => pending.has(key);
export function deferDelete(key: string, run: () => void, ms = 5000) {
  const prev = pending.get(key);
  if (prev) clearTimeout(prev);
  pending.set(key, setTimeout(() => { pending.delete(key); run(); }, ms));
  return () => { const t = pending.get(key); if (t) { clearTimeout(t); pending.delete(key); } };
}
