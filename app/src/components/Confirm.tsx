import { useEffect, useRef, useState } from 'react';
import { atSheetEntry, openSheetEntry, setSheetClose } from '../lib/nav-history';
import '../screens/ui.css';

/* 앱 안 확인 시트 — 네이티브 confirm() 대신. 취소하면 아무 일도 없다.
   `if (!(await confirmSheet({ title, body, danger }))) return;` 처럼 쓴다.

   열릴 때 history 항목을 하나 쌓는다: 안드로이드 뒤로가기가 화면을 넘기지 않고 시트만 닫게 하려고.
   취소·확인·바깥 누르기도 history.back() 으로 닫는다 — 어느 길로 닫든 항목이 하나만 사라진다. */
export type ConfirmOpts = { title: string; body?: string; okLabel?: string; cancelLabel?: string; danger?: boolean };
type Open = ConfirmOpts & { resolve: (v: boolean) => void };

let current: Open | null = null;
let notify: (s: Open | null) => void = () => {};
let answer = false;   // 버튼이 고른 값 — 시트는 뒤로가기(popstate) 때 닫히므로 여기 얹어 둔다. 제스처로 닫으면 false.
let closing = false;  // history.back() 은 곧바로 돌아오지 않는다 — 두 번 눌러 화면까지 넘어가지 않게 막는다

export function confirmSheet(opts: ConfirmOpts): Promise<boolean> {
  const stacked = !!current;   // 겹쳐 열리면 항목은 이미 쌓여 있다 — 하나만 쌓는다
  if (current) { const prev = current; current = null; prev.resolve(false); }   // 겹쳐 열리면 앞의 것은 취소
  return new Promise<boolean>(resolve => {
    current = { ...opts, resolve };
    answer = false; closing = false;
    if (!stacked) { setSheetClose(finish); openSheetEntry(); }
    notify(current);
  });
}

/* 실제로 닫는 자리 — 뒤로가기로 시트 항목이 사라진 뒤에 불린다(제스처든 버튼이든). */
function finish() { const c = current; const v = answer; current = null; answer = false; closing = false; notify(null); c?.resolve(v); }

function close(v: boolean) {
  if (!current || closing) return;
  answer = v;
  if (atSheetEntry()) { closing = true; history.back(); return; }   // popstate → finish()
  setSheetClose(null); finish();                    // 항목을 못 쌓은 자리(브라우저 밖 등)에선 바로 닫는다
}

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
