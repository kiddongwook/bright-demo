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

export const errToast = (e: unknown) => { toast(e instanceof Error ? e.message : '실패했어요. 다시 시도해 주세요.'); void reportError(e); };

/* 되돌리기용 지연 삭제 — 화면이 사라져도 타이머는 남아 진짜 삭제가 돈다 */
const pending = new Map<string, ReturnType<typeof setTimeout>>();
export const isPending = (key: string) => pending.has(key);
export function deferDelete(key: string, run: () => void, ms = 5000) {
  const prev = pending.get(key);
  if (prev) clearTimeout(prev);
  pending.set(key, setTimeout(() => { pending.delete(key); run(); }, ms));
  return () => { const t = pending.get(key); if (t) { clearTimeout(t); pending.delete(key); } };
}
