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
  [/overpay/, '남은 금액보다 많아요. 남은 금액까지만 받을 수 있어요'],
  [/over_cap/, '금액이 너무 커요 (500만 원까지)'],
  [/below_paid/, '이미 받은 금액보다 적게는 못 바꿔요. 납부 기록을 먼저 지워 주세요'],
  [/has_payments/, '납부 기록이 있는 청구서는 면제할 수 없어요. 납부 기록을 먼저 지워 주세요'],
  [/bad_phone/, '휴대폰 번호 형식이 아니에요 (010-0000-0000)'],
  [/bad schedule/, '시간표 형식이 맞지 않아요. 시작·끝 시간을 다시 골라 주세요'],
  [/name too long|students_name/, '이름은 20자까지예요'],
  [/notices_title|title/, '제목은 1~80자예요'],
  [/attendance_note/, '사유는 100자까지예요'],
  [/bank_info/, '계좌 안내는 200자까지예요'],
  [/period_ym/, '달 형식이 맞지 않아요'],
  [/rate limit/, '잠시 뒤 다시 시도해 주세요'],
  [/duplicate key|23505/, '이미 있는 항목이에요'],
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
