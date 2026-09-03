import { useEffect, useState } from 'react';
import { myChildren, weekAttendance, listTodos, listAbsences, requestAbsence, closedDays, weekRange, nextClassDays, fmtMDW, fmtDT, fmtDayOrToday, kstDay, DOW, dowOf, type Student, type Todo, type Absence, type AttStatus } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useSession } from '../../auth/session';
import { toast, errToast } from '../../lib/toast';

const WK: Record<AttStatus, string> = { present: 'p', late: 'l', absent: 'a', makeup: 'm' };
export function useChild() {
  const { active } = useSession();
  const [child, setChild] = useState<Student | null>(null);
  useEffect(() => { myChildren().then(l => setChild(l.find(s => s.id === active?.student_id) ?? l[0] ?? null)).catch(errToast); }, [active?.student_id]);
  return child;
}
export function TodoList({ todos, editable, onToggle }: { todos: Todo[]; editable: boolean; onToggle?: (t: Todo) => void }) {
  if (!todos.length) return <p className="muted" style={{ padding: '14px 16px' }}>이번 주 할 것이 아직 없어요.</p>;
  return <>{todos.map(t => (
    <div key={t.id} className={'todo' + (t.done ? ' done' : '')}>
      {editable ? <button className="cb" onClick={() => onToggle?.(t)} aria-label="했어요">{t.done ? '✓' : ''}</button> : <span className="cb">{t.done ? '✓' : ''}</span>}
      <div className="bd"><div className={'k' + (t.kind === 'exam' ? ' exam' : '')}>{t.kind === 'exam' ? '시험' : '숙제'}</div><div className="t">{t.title}</div><div className="s">{fmtMDW(t.due_date)}까지</div></div>
    </div>))}</>;
}
export function WeekStrip({ studentId, absences }: { studentId: string; absences: Absence[] }) {
  const { from, to, days } = weekRange();
  const [att, setAtt] = useState<Record<string, AttStatus>>({});
  useEffect(() => { weekAttendance(studentId, from, to).then(l => setAtt(Object.fromEntries(l.map(a => [a.date, a.status])))).catch(errToast); }, [studentId]);
  const cls = (d: string) => {
    if (att[d]) return WK[att[d]];
    const ab = absences.find(a => a.student_id === studentId && a.date === d && a.status !== 'declined'); if (ab) return 'a';
    if (absences.some(a => a.student_id === studentId && a.makeup_at && kstDay(a.makeup_at) === d)) return 'm';
    return '';
  };
  return <div className="week">{days.map(d => <i key={d} className={cls(d)}>{DOW[dowOf(d)]}</i>)}</div>;
}

export function Child() {
  const nav = useNav(); const child = useChild();
  const [todos, setTodos] = useState<Todo[]>([]); const [absences, setAbsences] = useState<Absence[]>([]); const [closed, setClosed] = useState<Set<string>>(new Set());
  useEffect(() => { if (!child) return; listTodos(child.classes.map(c => c.id), child.id).then(setTodos).catch(errToast); listAbsences().then(setAbsences).catch(errToast); closedDays().then(setClosed).catch(() => {}); }, [child?.id]);
  if (!child) return <section className="view on" />;
  const sched = child.classes.flatMap(c => c.schedule ?? []);
  const next = nextClassDays(sched, 1, closed)[0];
  const nextCls = next ? child.classes.find(c => (c.schedule ?? []).some(s => s.dow === dowOf(next))) : undefined;
  const mine = absences.filter(a => a.student_id === child.id);
  const short = child.name.replace(/^[가-힣]/, '');
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">{short}이</h1><p className="lede">{child.classes.map(c => c.name).join(' · ')}{nextCls ? ` · 다음 수업 ${fmtDayOrToday(next)} ${nextCls.schedule.find(s => s.dow === dowOf(next))?.start ?? ''}` : ''}</p></div>
      <div className="lab first">이번 주<span className="r">{fmtMDW(weekRange().from)} – {fmtMDW(weekRange().to)}</span></div>
      <div className="box"><WeekStrip studentId={child.id} absences={absences} /></div>
      <div className="legend"><span><b>○</b>출석</span><span><b>△</b>지각</span><span><b>✕</b>결석</span><span><b>◌</b>보강</span></div>
      <div className="lab">이번 주 할 것<span className="r">{short}이가 체크해요</span></div>
      <div className="box soft"><TodoList todos={todos} editable={false} /></div>
      <div className="lab">미리 알린 결석<span className="r">보강은 원장님이 잡아요</span></div>
      {mine.length ? <div className="box">{mine.map(a => <div key={a.id} className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">{fmtMDW(a.date)} 결석</span><span className="s">{a.reason}{a.makeup_at ? ` · 보강 ${fmtDT(a.makeup_at)}` : ''}</span></span>
        {a.status === 'requested' ? <span className="tag warn">원장님 확인 중</span> : a.status === 'declined' ? <span className="tag muted">보류</span> : <span className="tag ok">{a.makeup_kind === 'material' ? '자료로 대체' : '보강'}</span>}</div>)}</div>
        : <p className="muted" style={{ padding: '0 20px' }}>미리 알린 결석이 없어요. 알려주시면 보강을 잡아드려요.</p>}
      <div className="btnrow" style={{ paddingTop: 12 }}><button className="btn line" onClick={() => nav.push('absence')}>결석 미리 알리기</button></div>
    </section>
  );
}

export function Absence() {
  const nav = useNav(); const child = useChild();
  const [date, setDate] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  useEffect(() => { closedDays().then(setClosed).catch(() => {}); }, []);
  if (!child) return <section className="view on" />;
  const opts = nextClassDays(child.classes.flatMap(c => c.schedule ?? []), 3, closed);
  const pick = date || opts[0];
  async function send() {
    if (!reason.trim()) { toast('사유를 적어주세요'); return; }
    setBusy(true);
    try { await requestAbsence(child!.id, pick, reason.trim()); toast('원장님께 알렸어요. 보강을 잡아주시면 알림이 와요'); nav.back(); } catch (e) { errToast(e); setBusy(false); }
  }
  return (
    <section className="view on">
      <div className="head"><p className="lede">미리 알려주시면 원장님이 <b>보강을 잡아드려요.</b></p></div>
      <div className="lab first">결석할 날<span className="r">수업일</span></div>
      <div className="seg col">{opts.map(d => <button key={d} className={d === pick ? 'on' : ''} onClick={() => setDate(d)}>{fmtMDW(d)}</button>)}</div>
      <div className="lab">사유</div>
      <div style={{ padding: '0 20px' }}><textarea className="input" style={{ minHeight: 90 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="예) 병원 진료" /></div>
      <div className="btnrow"><button className="btn line" onClick={nav.back}>취소</button><button className="btn" disabled={busy} onClick={send}>원장님께 알리기</button></div>
    </section>
  );
}
