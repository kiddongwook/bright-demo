import { useEffect, useState } from 'react';
import { listClassesFull, listClassTodos, listStudents, createTodo, deleteTodo, todoDoneList, setTodoDoneBy, nextClassDays, kstToday, fmtMDW, type Cls, type TodoFull } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useSession } from '../../auth/session';
import { toast, errToast } from '../../lib/toast';

const KIND_LABEL: Record<'homework' | 'exam', string> = { homework: '숙제', exam: '시험' };

/* 이번 주 할 것 관리: 반별로 숙제·시험을 넣고 지운다. 넣는 즉시 학생·학부모 화면에 보인다. */
export function Todos() {
  const nav = useNav(); const { active, session } = useSession();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [cid, setCid] = useState('');
  const [todos, setTodos] = useState<TodoFull[]>([]);
  const [total, setTotal] = useState(0);
  const [kind, setKind] = useState<'homework' | 'exam'>('homework');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [doneList, setDoneList] = useState<{ student_id: string; name: string; done: boolean }[]>([]);
  useEffect(() => { (async () => {
    // 강사는 담당 반만 (오늘 화면과 같은 필터 — 넣기는 RLS 가 다시 막는다)
    const all = await listClassesFull();
    const cs: Cls[] = active?.role === 'teacher' ? all.filter(c => c.teacher_id === session?.user.id) : all;
    setClasses(cs);
    const want = nav.params.cid;
    setCid((want && cs.some(c => c.id === want) ? want : cs[0]?.id) ?? '');
  })().catch(errToast); }, []);
  const cls = classes.find(c => c.id === cid);
  function load(id = cid) {
    if (!id) return;
    listClassTodos(id, kstToday()).then(setTodos).catch(errToast);
    listStudents(id).then(l => setTotal(l.length)).catch(errToast);
  }
  useEffect(() => { setTodos([]); setTotal(0); setDue(''); setOpen(null); setDoneList([]); load(cid); }, [cid]);
  function loadDone(todoId: string) { todoDoneList(todoId, cid).then(setDoneList).catch(errToast); }
  function toggleOpen(t: TodoFull) {
    if (open === t.id) { setOpen(null); setDoneList([]); return; }
    setOpen(t.id); loadDone(t.id);
  }
  async function toggleDone(sid: string, done: boolean) {
    if (!open) return;
    try { await setTodoDoneBy(open, sid, !done); loadDone(open); load(); } catch (e) { errToast(e); }
  }
  const pick = due || nextClassDays(cls?.schedule ?? [], 1)[0] || kstToday();
  async function add() {
    if (!cid) { toast('반을 먼저 골라주세요'); return; }
    if (!title.trim()) { toast('무엇을 할지 적어주세요'); return; }
    setBusy(true);
    try { await createTodo(cid, kind, title.trim(), pick); toast('넣었어요. 학생 화면에 바로 보여요'); setTitle(''); setDue(''); load(); }
    catch (e) { errToast(e); } finally { setBusy(false); }
  }
  async function del(t: TodoFull) {
    if (!confirm(`「${t.title}」을 지울까요? 학생 화면에서도 사라져요.`)) return;
    try { await deleteTodo(t.id); toast('지웠어요'); load(); } catch (e) { errToast(e); }
  }
  return (
    <section className="view on">
      <div className="head"><p className="lede">숙제·시험을 넣으면 <b>학생·학부모 화면에 바로</b> 보여요. 학생이 직접 체크하고, 원장님이 대신 체크할 수도 있어요.</p></div>
      {classes.length > 1 && <div className="seg">{classes.map(c => <button key={c.id} className={c.id === cid ? 'on' : ''} onClick={() => setCid(c.id)}>{c.name}</button>)}</div>}
      <div className="lab first" style={classes.length > 1 ? { marginTop: 22 } : undefined}>다가오는 할 것<span className="r">{cls?.name ?? ''}</span></div>
      {todos.length ? <div className="box">{todos.map(t => (
        <div key={t.id}>
          <div className="rw" style={{ cursor: 'pointer' }} onClick={() => toggleOpen(t)}>
            <span className={'tag ' + (t.kind === 'exam' ? 'warn' : 'ok')}>{KIND_LABEL[t.kind]}</span>
            <span className="bd"><span className="t">{t.title}</span><span className="s">{fmtMDW(t.due_date)}까지 · {t.done_count}/{total} 했어요</span></span>
            <button className="btn sm line" onClick={e => { e.stopPropagation(); del(t); }}>지우기</button>
          </div>
          {open === t.id && <div className="box" style={{ margin: '0 12px 10px', borderTop: '1px solid var(--rule)' }}>
            {doneList.length ? doneList.map(d => (
              <div key={d.student_id} className="rw" style={{ cursor: 'default' }}>
                <span className="nm">{d.name.charAt(0)}</span>
                <span className="bd"><span className="t">{d.name}</span></span>
                <button className={'cb' + (d.done ? ' on' : '')} onClick={() => toggleDone(d.student_id, d.done)} aria-label="했어요">{d.done ? '✓' : ''}</button>
              </div>))
              : <p className="muted" style={{ padding: '10px 16px' }}>이 반에 학생이 없어요.</p>}
          </div>}
        </div>))}</div>
        : <p className="muted" style={{ padding: '0 20px' }}>다가오는 할 것이 없어요. 아래에서 넣어 주세요.</p>}
      <div className="lab">넣기<span className="r">{cls?.name ?? ''}</span></div>
      <div className="seg">{(['homework', 'exam'] as const).map(k => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}</div>
      <div style={{ padding: '8px 20px 0' }}><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'exam' ? '무엇을 볼까요 (예: 단어 시험 1~3과)' : '무엇을 할까요 (예: 워크북 p.32~35)'} /></div>
      <div style={{ padding: '8px 20px 0' }}><input className="input" type="date" value={pick} min={kstToday()} onChange={e => setDue(e.target.value)} /></div>
      <div className="btnrow"><button className="btn" disabled={busy} onClick={add}>넣기</button></div>
      <p className="muted" style={{ padding: '0 20px' }}>마감은 이 반 다음 수업일로 잡아 뒀어요. 원장님이 바꾸셔도 돼요.</p>
    </section>
  );
}
