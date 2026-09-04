import { useEffect, useState } from 'react';
import { listAbsences, confirmMakeup, studentDetail, closedByClass, closedFor, nextClassDays, fmtMD, fmtMDW, kstToday, DOW, dowOf, type Closed, type Cls } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast } from '../../lib/toast';
import { DateField } from '../../components/DateField';
import { TimeField } from '../../components/TimeField';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import '../ux.css';

/* 보강 후보 한 칸 — 그 학생 반의 다음 수업 (날짜 + 그날 수업 시작 시각) */
type Slot = { date: string; time: string };
const slotLabel = (s: Slot) => `${fmtMD(s.date)} (${DOW[dowOf(s.date)]}) ${s.time}`;

/** 그 학생이 듣는 반들의 다음 수업 네 번 — 휴원일은 빼고(nextClassDays 가 걸러 준다), 결석한 날도 뺀다. */
export function makeupSlots(classes: Cls[], closed: Closed | undefined, count: number, skipDate?: string): Slot[] {
  const seen = new Set<string>(); const out: Slot[] = [];
  for (const c of classes) {
    for (const d of nextClassDays(c.schedule ?? [], count, closedFor(closed, c.id))) {
      if (d === skipDate) continue;
      const start = (c.schedule ?? []).filter(s => s.dow === dowOf(d)).map(s => s.start).sort()[0];
      if (!start) continue;
      const k = d + 'T' + start;
      if (seen.has(k)) continue;
      seen.add(k); out.push({ date: d, time: start });
    }
  }
  out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return out.slice(0, count);
}

export function Makeup() {
  const nav = useNav(); const id = nav.params.id;
  const { data, err, reload } = useLoad(() => listAbsences().then(l => l.find(a => a.id === id) ?? null), [id]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [material, setMaterial] = useState(false);
  const [date, setDate] = useState(''); const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const sid = data?.student_id;
  useEffect(() => {
    if (!sid) return;
    let live = true;
    (async () => {
      const [st, closed] = await Promise.all([studentDetail(sid), closedByClass().catch(() => undefined)]);
      if (!live) return;
      const s = makeupSlots(st.classes, closed, 4, data?.date);
      setSlots(s);
      // 아직 아무것도 안 골랐으면 첫 후보를 미리 채워 둔다 — 대부분 이걸 그대로 쓴다
      setDate(d => d || (s[0]?.date ?? '')); setTime(t => t || (s[0]?.time ?? ''));
    })().catch(errToast);
    return () => { live = false; };
  }, [sid, data?.date]);
  const picked = (s: Slot) => !material && s.date === date && s.time === time;
  function choose(s: Slot) { setMaterial(false); setDate(s.date); setTime(s.time); }
  async function confirm() {
    if (!material && !(date && time)) { toast('보강 날짜와 시각을 정해 주세요'); return; }
    setBusy(true);
    try {
      await confirmMakeup(id, material ? 'material' : 'saturday', material ? null : `${date}T${time}:00+09:00`);
      toast(`${data?.student_name} 학부모에게 ${material ? '자료 대체' : '보강 일정'}을 알렸어요`); nav.back();
    } catch (e) { errToast(e); setBusy(false); }
  }
  if (!data) return <section className="view on">{err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />}</section>;
  return (
    <section className="view on">
      <div className="head"><p className="lede">{data.student_name} · <b>{fmtMDW(data.date)}</b> 결석<br />{data.reason}</p></div>
      {data.status !== 'requested' && <p className="muted" style={{ padding: '0 20px 14px' }}>이미 처리된 신청이에요. 다시 정하면 덮어씁니다.</p>}
      <div className="lab first">보강<span className="r">이 학생 반의 다음 수업</span></div>
      {slots.length > 0
        ? <div className="chips-row wrap">{slots.map(s => (
            <button key={s.date + s.time} className={picked(s) ? 'on' : ''} onClick={() => choose(s)}>{slotLabel(s)}</button>))}
            <button className={material ? 'on' : ''} onClick={() => setMaterial(true)}>자료로 대체</button>
          </div>
        : <div className="chips-row wrap"><button className={material ? 'on' : ''} onClick={() => setMaterial(true)}>자료로 대체</button></div>}
      <div className="lab">날짜와 시각</div>
      <div className="mk-manual">
        {/* 후보 칩은 바로 위에 있다 — 여기에 오늘·내일 칩을 또 두지 않는다 */}
        <DateField value={date} onChange={v => { setMaterial(false); setDate(v); }} quick={[]} min={kstToday()}
          label="보강 날짜" placeholder="보강 날짜" disabled={material} />
        <TimeField value={time} onChange={v => { setMaterial(false); setTime(v); }} label="보강 시각" disabled={material} />
      </div>
      <div className="btnrow"><button className="btn line" onClick={nav.back}>나중에</button><button className="btn" disabled={busy} onClick={confirm}>확정하고 알리기</button></div>
    </section>
  );
}
