import { useRef } from 'react';
import { fmtDateLong, kstToday, kstDate } from '../lib/dates';
import '../screens/ui.css';

/* 날짜 칸 — 네이티브 date 입력을 투명하게 덮어 두고, 그 위에 "9월 11일 (금)" 을 보여준다.
   눌리는 것도 포커스가 가는 것도 진짜 <input type=date> 라서 키보드·보조기기가 그대로 돌아간다.
   showPicker() 가 없는 브라우저(옛 사파리 등)에서는 네이티브 입력 자체를 보이는 칸으로 쓴다. */

export type QuickDate = { label: string; date: string };

/* 한 번만 본다 — 렌더마다 바뀌지 않는 브라우저 능력이다 */
const CAN_PICK = typeof HTMLInputElement !== 'undefined' && 'showPicker' in HTMLInputElement.prototype;

export function DateField({ value, onChange, min, quick, placeholder = '날짜 고르기', clearable = false, label, disabled = false }: {
  value: string;                       /* 'YYYY-MM-DD' 또는 '' */
  onChange: (v: string) => void;
  min?: string;
  quick?: QuickDate[];
  placeholder?: string;
  clearable?: boolean;
  label?: string;                      /* 보조기기용 이름 */
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const name = label ?? placeholder;
  /* 부르는 쪽이 칩을 안 주면 오늘·내일만 — 다음 수업일은 반 시간표를 아는 화면만 넣어 줄 수 있다 */
  const chips = quick ?? [{ label: '오늘', date: kstToday() }, { label: '내일', date: kstDate(1) }];
  /* showPicker() 는 사용자 동작 밖에서 부르면 던진다 — 막히면 네이티브 기본 동작에 맡긴다 */
  function openPicker() { try { ref.current?.showPicker(); } catch { /* 브라우저가 알아서 연다 */ } }
  return (
    <div className="pickwrap">
      {CAN_PICK
        ? <div className={'input pickfield' + (value ? '' : ' ph') + (disabled ? ' off' : '')}>
            <span className="pf-v">{value ? fmtDateLong(value) : placeholder}</span>
            <input ref={ref} className="pf-native" type="date" value={value} min={min} aria-label={name} disabled={disabled}
              onClick={openPicker} onChange={e => onChange(e.target.value)} />
            {clearable && value !== '' && !disabled && (
              <button type="button" className="pf-clear" aria-label={`${name} 지우기`} onClick={() => onChange('')}>✕</button>)}
          </div>
        : <input className="input" type="date" value={value} min={min} aria-label={name} disabled={disabled} onChange={e => onChange(e.target.value)} />}
      {chips.length > 0 && <div className="chips-row pf-quick">{chips.map(q => (
        <button key={q.label} type="button" className={value === q.date ? 'on' : ''} disabled={disabled} onClick={() => onChange(q.date)}>{q.label}</button>))}</div>}
    </div>
  );
}
