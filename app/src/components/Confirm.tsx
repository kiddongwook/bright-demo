import { useEffect, useRef, useState } from 'react';
import '../screens/ui.css';

/* 앱 안 확인 시트 — 네이티브 confirm() 대신. 취소하면 아무 일도 없다.
   `if (!(await confirmSheet({ title, body, danger }))) return;` 처럼 쓴다. */
export type ConfirmOpts = { title: string; body?: string; okLabel?: string; cancelLabel?: string; danger?: boolean };
type Open = ConfirmOpts & { resolve: (v: boolean) => void };

let current: Open | null = null;
let notify: (s: Open | null) => void = () => {};

export function confirmSheet(opts: ConfirmOpts): Promise<boolean> {
  if (current) { const prev = current; current = null; prev.resolve(false); }   // 겹쳐 열리면 앞의 것은 취소
  return new Promise<boolean>(resolve => { current = { ...opts, resolve }; notify(current); });
}

function close(v: boolean) { const c = current; current = null; notify(null); c?.resolve(v); }

export function ConfirmHost() {
  const [s, setS] = useState<Open | null>(current);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { notify = setS; setS(current); return () => { notify = () => {}; }; }, []);
  useEffect(() => {
    if (!s) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [s]);
  if (!s) return null;
  return (
    <div className="sheet-dim" onClick={() => close(false)}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={s.title} onClick={e => e.stopPropagation()}>
        <p className="st">{s.title}</p>
        {s.body && <p className="sb">{s.body}</p>}
        <div className="sa">
          <button className="btn line" onClick={() => close(false)}>{s.cancelLabel ?? '취소'}</button>
          <button ref={okRef} className={'btn' + (s.danger ? ' danger' : '')} onClick={() => close(true)}>{s.okLabel ?? '확인'}</button>
        </div>
      </div>
    </div>
  );
}
