import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtTime12, hm as toHm } from '../lib/dates';
import { atSheetEntry, openSheetEntry, setSheetClose } from '../lib/nav-history';
import '../screens/ui.css';

/* 시간 칸 — 누르면 아래에서 시트가 올라온다. 시·분을 굴려 고르고, 학원에서 흔한 시각은 칩으로 한 번에.
   네이티브 time 입력은 기기마다 생김새가 제각각이고 분 단위도 못 묶어서 여기서 직접 만든다.
   시트는 확인 시트와 같은 틀(.sheet-dim/.sheet)을 쓰고, 열릴 때 history 항목을 하나 쌓아
   안드로이드 뒤로가기가 화면 대신 시트를 닫게 한다. */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
/* 학원 수업이 몰리는 시각 */
const QUICK = ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
const hourLabel = (h: number) => `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시`;

export function TimeField({ value, onChange, step = 10, label = '시간', disabled = false }: {
  value: string;                       /* 'HH:MM' */
  onChange: (v: string) => void;
  step?: number;                       /* 분 눈금 — 기본 10분 */
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState(19);
  const [m, setM] = useState(0);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const closing = useRef(false);       /* history.back() 은 곧바로 돌아오지 않는다 — 두 번 눌러 화면까지 넘어가지 않게 */
  const hSel = useRef<HTMLButtonElement>(null); const mSel = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const gap = step > 0 && step <= 60 ? step : 10;
  const MINS = Array.from({ length: Math.ceil(60 / gap) }, (_, i) => i * gap).filter(x => x < 60);

  /* 시트는 .app 안에 붙인다 — .sheet-dim 이 폰 틀만 덮고, 화면이 움직여도 어긋나지 않게 */
  useLayoutEffect(() => { setHost(document.querySelector<HTMLElement>('.app')); }, []);

  function openSheet() {
    const p = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
    const ph = p ? +p[1] : 19, pm = p ? +p[2] : 0;
    setH(ph <= 23 ? ph : 19);
    /* 눈금에 없는 분(예: 19:05)은 가장 가까운 눈금으로 앉힌다 */
    setM(MINS.reduce((a, b) => Math.abs(b - pm) < Math.abs(a - pm) ? b : a, MINS[0]));
    closing.current = false;
    setSheetClose(() => { closing.current = false; setOpen(false); });
    openSheetEntry();
    setOpen(true);
  }
  function close() {
    if (closing.current) return;
    if (atSheetEntry()) { closing.current = true; history.back(); return; }   /* popstate → setSheetClose 로 넘긴 함수 */
    setSheetClose(null); setOpen(false);
  }
  function apply() { onChange(toHm(h, m)); close(); }

  useEffect(() => {
    if (!open) return;
    centre(hSel.current); centre(mSel.current);
    okRef.current?.focus();          /* 포커스를 시트 안으로 — 탭이 뒤 화면으로 새지 않게 */
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const sheet = (
    <div className="sheet-dim" onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`${label} 고르기`} onClick={e => e.stopPropagation()}>
        <p className="st">{label} 고르기</p>
        <div className="chips-row tf-quick">{QUICK.map(q => (
          <button key={q} type="button" className={toHm(h, m) === q ? 'on' : ''}
            onClick={() => { const [qh, qm] = q.split(':'); setH(+qh); setM(+qm); }}>{fmtTime12(q)}</button>))}</div>
        <div className="tf-wheels">
          <div className="seg col tf-wheel" aria-label="시">{HOURS.map(x => (
            <button key={x} type="button" ref={x === h ? hSel : undefined} className={x === h ? 'on' : ''}
              aria-pressed={x === h} onClick={() => setH(x)}>{hourLabel(x)}</button>))}</div>
          <div className="seg col tf-wheel" aria-label="분">{MINS.map(x => (
            <button key={x} type="button" ref={x === m ? mSel : undefined} className={x === m ? 'on' : ''}
              aria-pressed={x === m} onClick={() => setM(x)}>{String(x).padStart(2, '0')}분</button>))}</div>
        </div>
        <div className="sa">
          <button type="button" className="btn line" onClick={close}>취소</button>
          <button ref={okRef} type="button" className="btn" onClick={apply}>{fmtTime12(toHm(h, m))}로 하기</button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button type="button" className={'input pickfield' + (value ? '' : ' ph')} onClick={openSheet} disabled={disabled}
        aria-haspopup="dialog" aria-expanded={open} aria-label={`${label} — ${value ? fmtTime12(value) : '고르지 않음'}`}>
        <span className="pf-v">{value ? fmtTime12(value) : '시간 고르기'}</span>
      </button>
      {open && createPortal(sheet, host ?? document.body)}
    </>
  );
}

/* 고른 줄을 목록 한가운데로 — scrollIntoView 는 화면 전체까지 끌고 가서 직접 셈한다 */
function centre(el: HTMLElement | null) {
  const p = el?.parentElement;
  if (!el || !p) return;
  p.scrollTop = el.offsetTop - p.clientHeight / 2 + el.offsetHeight / 2;
}
