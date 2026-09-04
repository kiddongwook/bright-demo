import { useEffect, useState } from 'react';
import { listTodos, listAbsences, setTodoDone, closedByClass, nextClassDaysFor, kstToday, type Closed, fmtMDW, fmtDayOrToday, dowOf, weekRange, type Todo, type Absence } from '../../lib/api';
import { useChild, TodoList, WeekStrip, ProgressRing, useWeekAtt } from '../parent/Child';
import { givenName } from '../../lib/name';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { toast, errToast } from '../../lib/toast';
import '../ui.css';

export function Me() {
  const { child: me, err, reload } = useChild();
  const [todos, setTodos] = useState<Todo[]>([]); const [absences, setAbsences] = useState<Absence[]>([]); const [closed, setClosed] = useState<Closed | undefined>();
  const att = useWeekAtt(me?.id ?? '');
  const load = () => { if (!me) return; listTodos(me.classes.map(c => c.id), me.id).then(setTodos).catch(errToast); listAbsences().then(setAbsences).catch(errToast); closedByClass().then(setClosed).catch(() => {}); };
  useEffect(load, [me?.id]);
  if (!me) return <section className="view on">{err ? <ErrorState onRetry={reload} /> : <Skeleton rows={4} />}</section>;
  const left = todos.filter(t => !t.done).length;
  const next = nextClassDaysFor(me.classes, 1, closed)[0];
  const nextCls = next ? me.classes.find(c => (c.schedule ?? []).some(s => s.dow === dowOf(next))) : undefined;
  const nextStart = nextCls?.schedule.find(s => s.dow === dowOf(next))?.start ?? '';
  async function toggle(t: Todo) {
    try { await setTodoDone(t.id, me!.id, !t.done); setTodos(l => l.map(x => x.id === t.id ? { ...x, done: !t.done } : x)); toast(!t.done ? `「${t.title}」 했어요로 표시했어요` : `「${t.title}」 다시 할 것으로 돌렸어요`); } catch (e) { errToast(e); }
  }
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">{givenName(me.name)}</h1><p className="lede">{fmtMDW(kstToday())} · {me.classes.map(c => c.name).join(' · ')}</p></div>
      <div className="lab first ringlab">이번 주 할 것<span className="r">{left ? `${left}개 남음` : '다 했어요'}</span><ProgressRing done={todos.length - left} total={todos.length} /></div>
      <div className="box"><TodoList todos={todos} editable onToggle={toggle} /></div>
      <p className="muted" style={{ padding: '10px 20px 0' }}>했으면 동그라미를 눌러요.</p>
      <div className="lab">다음 수업</div>
      <div className="box">{nextCls
        ? <div className="rw nextrow" style={{ cursor: 'default' }}><span className="big">{fmtDayOrToday(next)} <em>{nextStart}</em></span><span className="s">{nextCls.name}</span></div>
        : <Empty icon="calendar" title="다음 수업이 아직 없어요" hint="시간표가 정해지면 여기에 보여요." />}</div>
      <div className="lab">이번 주 출결<span className="r">{fmtMDW(weekRange().from)} – {fmtMDW(weekRange().to)}</span></div>
      <div className="box"><WeekStrip studentId={me.id} absences={absences} att={att} /></div>
      <div className="legend"><span><b>○</b>출석</span><span><b>△</b>지각</span><span><b>✕</b>결석</span><span><b>◌</b>보강</span></div>
    </section>
  );
}
