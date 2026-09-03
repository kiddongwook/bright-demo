import { useEffect, useState } from 'react';
import { listTodos, listAbsences, setTodoDone, closedByClass, nextClassDaysFor, type Closed, fmtMDW, fmtDayOrToday, dowOf, weekRange, type Todo, type Absence } from '../../lib/api';
import { useChild, TodoList, WeekStrip } from '../parent/Child';
import { toast, errToast } from '../../lib/toast';

export function Me() {
  const me = useChild();
  const [todos, setTodos] = useState<Todo[]>([]); const [absences, setAbsences] = useState<Absence[]>([]); const [closed, setClosed] = useState<Closed | undefined>();
  const load = () => { if (!me) return; listTodos(me.classes.map(c => c.id), me.id).then(setTodos).catch(errToast); listAbsences().then(setAbsences).catch(errToast); closedByClass().then(setClosed).catch(() => {}); };
  useEffect(load, [me?.id]);
  if (!me) return <section className="view on" />;
  const left = todos.filter(t => !t.done).length;
  const next = nextClassDaysFor(me.classes, 1, closed)[0];
  const nextCls = next ? me.classes.find(c => (c.schedule ?? []).some(s => s.dow === dowOf(next))) : undefined;
  async function toggle(t: Todo) {
    try { await setTodoDone(t.id, me!.id, !t.done); setTodos(l => l.map(x => x.id === t.id ? { ...x, done: !t.done } : x)); toast(!t.done ? `「${t.title}」 했어요로 표시했어요` : `「${t.title}」 다시 할 것으로 돌렸어요`); } catch (e) { errToast(e); }
  }
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">{me.name.replace(/^[가-힣]/, '')}</h1><p className="lede">{me.classes.map(c => c.name).join(' · ')}{nextCls ? ` · 다음 수업 ${fmtDayOrToday(next)} ${nextCls.schedule.find(s => s.dow === dowOf(next))?.start ?? ''}` : ''}</p></div>
      <div className="lab first">이번 주 할 것<span className="r">{left ? `${left}개 남음` : '다 했어요'}</span></div>
      <div className="box"><TodoList todos={todos} editable onToggle={toggle} /></div>
      <p className="muted" style={{ padding: '10px 20px 0' }}>했으면 동그라미를 눌러요.</p>
      <div className="lab">이번 주 출결<span className="r">{fmtMDW(weekRange().from)} – {fmtMDW(weekRange().to)}</span></div>
      <div className="box"><WeekStrip studentId={me.id} absences={absences} /></div>
      <div className="legend"><span><b>○</b>출석</span><span><b>△</b>지각</span><span><b>✕</b>결석</span><span><b>◌</b>보강</span></div>
    </section>
  );
}
