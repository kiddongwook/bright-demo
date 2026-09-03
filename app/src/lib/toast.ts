import { reportError } from './report';

let el: HTMLDivElement | null = null; let timer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(timer); timer = setTimeout(() => el!.classList.remove('show'), 2600);
}
export const errToast = (e: unknown) => { toast(e instanceof Error ? e.message : '실패했어요. 다시 시도해 주세요.'); void reportError(e); };
