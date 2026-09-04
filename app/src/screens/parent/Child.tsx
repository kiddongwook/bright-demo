import { useEffect, useState } from 'react';
import { myChildren, weekAttendance, listTodos, listAbsences, listNotices, requestAbsence, closedByClass, nextClassDaysFor, weekRange, kstToday, type Closed, fmtMDW, fmtDT, fmtDayOrToday, kstDay, DOW, dowOf, type Student, type Todo, type Absence, type AttStatus } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { useSession } from '../../auth/session';
import { toast, errToast } from '../../lib/toast';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { BottomCta } from '../../components/BottomCta';
import { usePop } from '../../lib/pop';
import { IcBook, IcTarget } from '../../components/icons';
import '../ui.css';

const WK: Record<AttStatus, string> = { present: 'p', late: 'l', absent: 'a', makeup: 'm' };
const ATT_TODAY: Record<AttStatus, string> = { present: '오늘 출석했어요', late: '오늘 조금 늦게 왔어요', absent: '오늘 결석했어요', makeup: '오늘 보강에 왔어요' };
export function useChild() {
  const { active } = useSession();
  const { data: child, err, reload } = useLoad<Student | null>(() => myChildren().then(l => l.find(s => s.id === active?.student_id) ?? l[0] ?? null), [active?.student_id]);
  return { child, err, reload };
}
export function TodoList({ todos, editable, onToggle }: { todos: Todo[]; editable: boolean; onToggle?: (t: Todo) => void | Promise<void> }) {
  const pop = usePop();                        // 방금 체크한 동그라미만 한 번 튄다
  if (!todos.length) return <Empty icon="check" title="할 것이 아직 없어요" hint="숙제·시험이 나오면 여기에 바로 보여요." />;
  return <>{todos.map(t => (
    <div key={t.id} className={'todo' + (t.done ? ' done' : '')}>
      {editable ? <button className={'cb' + pop.cls(t.id)} onClick={async () => { await onToggle?.(t); if (!t.done) pop.fire(t.id); }} onAnimationEnd={pop.end} aria-label="했어요">{t.done ? '✓' : ''}</button> : <span className="cb">{t.done ? '✓' : ''}</span>}
      <div className="bd"><div className={'k' + (t.kind === 'exam' ? ' exam' : '')}>{t.kind === 'exam' ? <><IcTarget size={13} style={{ verticalAlign: -2, marginRight: 3 }} />시험</> : <><IcBook size={13} style={{ verticalAlign: -2, marginRight: 3 }} />숙제</>}</div><div className="t">{t.title}</div><div className="s">{fmtMDW(t.due_date)}까지</div></div>
    </div>))}</>;
}
/** 이번 주 출결 — 주 스트립과 "오늘 출결" 줄이 같이 쓴다 (홈에서 한 번만 읽는다) */
export function useWeekAtt(studentId: string) {
  const { from, to } = weekRange();
  const [att, setAtt] = useState<Record<string, AttStatus>>({});
  useEffect(() => {
    if (!studentId) { setAtt({}); return; }
    weekAttendance(studentId, from, to).then(l => setAtt(Object.fromEntries(l.map(a => [a.date, a.status])))).catch(errToast);
  }, [studentId]);
  return att;
}
export function WeekStrip({ studentId, absences, att }: { studentId: string; absences: Absence[]; att: Record<string, AttStatus> }) {
  const { days } = weekRange();
  const cls = (d: string) => {
    if (att[d]) return WK[att[d]];
    const ab = absences.find(a => a.student_id === studentId && a.date === d && a.status !== 'declined'); if (ab) return 'a';
    if (absences.some(a => a.student_id === studentId && a.makeup_at && kstDay(a.makeup_at) === d)) return 'm';
    return '';
  };
  return <div className="week">{days.map(d => <i key={d} className={cls(d)}>{DOW[dowOf(d)]}</i>)}</div>;
}

export function Child() {
  const nav = useNav(); const { child, err, reload } = useChild();
  const [todos, setTodos] = useState<Todo[]>([]); const [absences, setAbsences] = useState<Absence[]>([]); const [closed, setClosed] = useState<Closed | undefined>();
  const att = useWeekAtt(child?.id ?? '');
  const { data: notices } = useLoad(listNotices);
  useEffect(() => { if (!child) return; listTodos(child.classes.map(c => c.id), child.id).then(setTodos).catch(errToast); listAbsences().then(setAbsences).catch(errToast); closedByClass().then(setClosed).catch(() => {}); }, [child?.id]);
  if (!child) return <section className="view on">{err ? <ErrorState onRetry={reload} /> : <Skeleton rows={4} />}</section>;
  const next = nextClassDaysFor(child.classes, 1, closed)[0];
  const nextCls = next ? child.classes.find(c => (c.schedule ?? []).some(s => s.dow === dowOf(next))) : undefined;
  const nextStart = nextCls?.schedule.find(s => s.dow === dowOf(next))?.start ?? '';
  const mine = absences.filter(a => a.student_id === child.id);
  const short = child.name.replace(/^[가-힣]/, '');
  const todayAtt = att[kstToday()];
  const recent = notices?.[0];
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">{short}이</h1><p className="lede">{fmtMDW(kstToday())} · {child.classes.map(c => c.name).join(' · ')}</p></div>
      <div className="lab first">다음 수업</div>
      <div className="box">{nextCls
        ? <div className="rw nextrow" style={{ cursor: 'default' }}><span className="big">{fmtDayOrToday(next)} <em>{nextStart}</em></span><span className="s">{nextCls.name}</span></div>
        : <Empty icon="calendar" title="다음 수업이 아직 없어요" hint="시간표가 정해지면 여기에 보여요." />}</div>
      {todayAtt && <p className="summaryline" style={{ marginTop: 10 }}><b>{ATT_TODAY[todayAtt]}</b></p>}
      <div className="lab">이번 주<span className="r">{fmtMDW(weekRange().from)} – {fmtMDW(weekRange().to)}</span></div>
      <div className="box"><WeekStrip studentId={child.id} absences={absences} att={att} /></div>
      <div className="legend"><span><b>○</b>출석</span><span><b>△</b>지각</span><span><b>✕</b>결석</span><span><b>◌</b>보강</span><button className="more" onClick={() => nav.push('child-month')}>이번 달 달력 ›</button></div>
      <div className="lab">이번 주 할 것<span className="r">{short}이가 체크해요</span></div>
      <div className="box soft"><TodoList todos={todos} editable={false} /></div>
      {recent && <><div className="lab">최근 공지</div>
        <div className="box"><button className="rw" onClick={() => nav.push('notice-view', { id: recent.id })}>
          <span className="bd"><span className="t">{recent.title}</span><span className="s">{fmtMDW(kstDay(recent.created_at))}</span></span>
          <span className={'tag ' + (recent.read ? 'muted' : 'danger')}>{recent.read ? '읽음' : '안 읽음'}</span>
        </button></div></>}
      <div className="lab">미리 알린 결석<span className="r">보강은 원장님이 잡아요</span></div>
      {mine.length ? <div className="box">{mine.map(a => <div key={a.id} className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">{fmtMDW(a.date)} 결석</span><span className="s">{a.reason}{a.makeup_at ? ` · 보강 ${fmtDT(a.makeup_at)}` : ''}</span></span>
        {a.status === 'requested' ? <span className="tag warn">원장님 확인 중</span> : a.status === 'declined' ? <span className="tag muted">보류</span> : <span className="tag ok">{a.makeup_kind === 'material' ? '자료로 대체' : '보강'}</span>}</div>)}</div>
        : <div className="box"><Empty icon="calendar" title="미리 알린 결석이 없어요" hint="알려주시면 원장님이 보강을 잡아드려요." /></div>}
      <div className="btnrow" style={{ paddingTop: 12 }}><button className="btn line" onClick={() => nav.push('absence')}>결석 미리 알리기</button></div>
    </section>
  );
}

export function Absence() {
  const nav = useNav(); const { child, err, reload } = useChild();
  const [date, setDate] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<Closed | undefined>();
  useEffect(() => { closedByClass().then(setClosed).catch(() => {}); }, []);
  if (!child) return <section className="view on">{err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />}</section>;
  const opts = nextClassDaysFor(child.classes, 3, closed);
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
      <BottomCta primary={{ label: '원장님께 알리기', onClick: send, disabled: busy }} secondary={{ label: '취소', onClick: nav.back }} />
    </section>
  );
}
