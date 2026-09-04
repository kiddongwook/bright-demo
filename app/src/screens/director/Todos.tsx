import { useEffect, useRef, useState } from 'react';
import { listClassesFull, listClassTodos, listStudents, createTodo, deleteTodo, todoDoneList, setTodoDoneBy, recentTodoTitles, nextClassDays, kstToday, kstDate, DOW, dowOf, fmtMDW, type Cls, type TodoFull } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useSession } from '../../auth/session';
import { toast, errToast, deferDelete, isPending } from '../../lib/toast';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { usePop } from '../../lib/pop';
import { DateField } from '../../components/DateField';
import { Counter } from '../../components/Counter';
import { LIMITS } from '../../lib/limits';

const KIND_LABEL: Record<'homework' | 'exam', string> = { homework: '숙제', exam: '시험' };

/* 자주 쓰는 꼴 — 누르면 칸에 들어오고 첫 밑줄(__)이 잡혀 있어 숫자만 덮어 쓰면 된다 */
const PATTERNS = ['단어장 __~__ 외우기', '워크북 p.__~__', '영작 1편 — ____'];
/** 첫 밑줄 덩이의 자리 — 없으면 null */
const blankAt = (s: string) => { const m = /_+/.exec(s); return m ? { at: m.index, len: m[0].length } : null; };

/* 이번 주 할 것 관리: 반별로 숙제·시험을 넣고 지운다. 넣는 즉시 학생·학부모 화면에 보인다. */
export function Todos() {
  const nav = useNav(); const { active, session } = useSession();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [cid, setCid] = useState('');
  const pop = usePop();                        // 방금 체크한 동그라미만 한 번 튄다
  const [todos, setTodos] = useState<TodoFull[]>([]);
  const [total, setTotal] = useState(0);
  const [kind, setKind] = useState<'homework' | 'exam'>('homework');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [ready, setReady] = useState(false); const [loadErr, setLoadErr] = useState(false);
  const [doneList, setDoneList] = useState<{ student_id: string; name: string; done: boolean }[]>([]);
  const [recent, setRecent] = useState<string[]>([]);   // 이 학원에서 최근에 쓴 제목 (넉넉히 받아 이 반에 이미 걸린 것을 뺀다)
  const addRef = useRef<HTMLDivElement>(null); const titleRef = useRef<HTMLInputElement>(null);
  const focusAdd = () => { addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => titleRef.current?.focus(), 350); };
  function loadClasses() {
    setLoadErr(false);
    (async () => {
      // 강사는 담당 반만 (오늘 화면과 같은 필터 — 넣기는 RLS 가 다시 막는다)
      const all = await listClassesFull();
      const cs: Cls[] = active?.role === 'teacher' ? all.filter(c => c.teacher_id === session?.user.id) : all;
      setClasses(cs);
      const want = nav.params.cid;
      setCid((want && cs.some(c => c.id === want) ? want : cs[0]?.id) ?? '');
      setReady(true);
    })().catch(e => { setLoadErr(true); errToast(e); });
  }
  useEffect(loadClasses, []);
  const cls = classes.find(c => c.id === cid);
  function load(id = cid) {
    if (!id) return;
    listClassTodos(id, kstToday()).then(setTodos).catch(errToast);
    listStudents(id).then(l => setTotal(l.length)).catch(errToast);
  }
  const loadRecent = () => { recentTodoTitles(30).then(setRecent).catch(() => setRecent([])); };   /* 거들기라서 실패해도 조용히 — 칩만 안 뜬다 */
  useEffect(() => { setTodos([]); setTotal(0); setDue(''); setOpen(null); setDoneList([]); load(cid); loadRecent(); }, [cid]);
  /* 이 반에 이미 걸린 제목은 다시 넣을 일이 없다 — 빼고 여섯 개까지 */
  const recentShown = recent.filter(t => !todos.some(x => x.title === t)).slice(0, 6);
  /* 꼴을 넣고 첫 밑줄을 잡아 준다 — 칸에 값이 들어간 뒤라야 자리를 잡을 수 있어 한 박자 뒤에 */
  function fillTitle(text: string) {
    setTitle(text);
    const b = blankAt(text);
    setTimeout(() => { const el = titleRef.current; if (!el) return; el.focus(); if (b) el.setSelectionRange(b.at, b.at + b.len); }, 0);
  }
  function loadDone(todoId: string) { todoDoneList(todoId, cid).then(setDoneList).catch(errToast); }
  function toggleOpen(t: TodoFull) {
    if (open === t.id) { setOpen(null); setDoneList([]); return; }
    setOpen(t.id); loadDone(t.id);
  }
  async function toggleDone(sid: string, done: boolean) {
    if (!open) return;
    try {
      await setTodoDoneBy(open, sid, !done);
      // 서버를 다시 읽기 전에 눈앞의 동그라미부터 채운다 — 체크와 튐이 같이 보이게
      setDoneList(l => l.map(d => d.student_id === sid ? { ...d, done: !done } : d));
      if (!done) pop.fire(sid);
      loadDone(open); load();
    } catch (e) { errToast(e); }
  }
  const nextDay = nextClassDays(cls?.schedule ?? [], 1)[0];
  const pick = due || nextDay || kstToday();
  /* 빠른 마감 — 이 반 다음 수업일(기본값) · 내일 · 다음 주 같은 요일 */
  const weekLater = kstDate(7);
  const quickDue = [...(nextDay ? [{ label: '다음 수업일', date: nextDay }] : []), { label: '내일', date: kstDate(1) }, { label: `다음 주 ${DOW[dowOf(weekLater)]}`, date: weekLater }];
  async function add() {
    if (!cid) { toast('반을 먼저 골라주세요'); return; }
    if (!title.trim()) { toast('무엇을 할지 적어주세요'); return; }
    setBusy(true);
    try { await createTodo(cid, kind, title.trim(), pick); toast('넣었어요. 학생 화면에 바로 보여요'); setTitle(''); setDue(''); load(); loadRecent(); }
    catch (e) { errToast(e); } finally { setBusy(false); }
  }
  /* 지우기는 5초 뒤에 진짜로 — 그 사이 되돌리기를 누르면 없던 일이 된다 (화면을 떠나도 삭제는 돈다) */
  function del(t: TodoFull) {
    setTodos(l => l.filter(x => x.id !== t.id));
    const cancel = deferDelete(`todo:${t.id}`, () => { deleteTodo(t.id).then(() => load()).catch(e => { errToast(e); load(); }); });
    toast(`「${t.title}」을 지웠어요`, { ms: 5000, action: { label: '되돌리기', onClick: () => { cancel(); load(); } } });
  }
  const shown = todos.filter(t => !isPending(`todo:${t.id}`));   /* 되돌리기를 기다리는 줄은 다시 읽어도 숨긴 채로 */
  return (
    <section className="view on">
      <div className="head"><p className="lede">숙제·시험을 넣으면 <b>학생·학부모 화면에 바로</b> 보여요. 학생이 직접 체크하고, 원장님이 대신 체크할 수도 있어요.</p></div>
      {!ready
        ? (loadErr ? <ErrorState onRetry={loadClasses} /> : <Skeleton rows={4} />)
        : <>
      {classes.length > 1 && <div className="seg">{classes.map(c => <button key={c.id} className={c.id === cid ? 'on' : ''} onClick={() => setCid(c.id)}>{c.name}</button>)}</div>}
      <div className="lab first" style={classes.length > 1 ? { marginTop: 22 } : undefined}>다가오는 할 것<span className="r">{cls?.name ?? ''}</span></div>
      {shown.length ? <div className="box">{shown.map(t => (
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
                <button className={'cb' + (d.done ? ' on' : '') + pop.cls(d.student_id)} onClick={() => toggleDone(d.student_id, d.done)} onAnimationEnd={pop.end} aria-label="했어요">{d.done ? '✓' : ''}</button>
              </div>))
              : <p className="muted" style={{ padding: '10px 16px' }}>이 반에 학생이 없어요.</p>}
          </div>}
        </div>))}</div>
        : <div className="box"><Empty icon="check" title="다가오는 할 것이 없어요" hint="숙제·시험을 넣으면 학생·학부모 화면에 바로 보여요." action={{ label: '할 것 넣기', onClick: focusAdd }} /></div>}
      <div className="lab" ref={addRef}>넣기<span className="r">{cls?.name ?? ''}</span></div>
      <div className="seg">{(['homework', 'exam'] as const).map(k => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}</div>
      <div className="chips-row" style={{ paddingTop: 8 }}>
        {recentShown.map(t => <button key={'r:' + t} type="button" className={title === t ? 'on' : ''} onClick={() => fillTitle(t)}>{t}</button>)}
        {PATTERNS.map(p => <button key={'p:' + p} type="button" className="pat" onClick={() => fillTitle(p)}>{p}</button>)}
      </div>
      <div style={{ padding: '8px 20px 0' }}>
        <input className="input" ref={titleRef} value={title} maxLength={LIMITS.todoTitle} onChange={e => setTitle(e.target.value)} placeholder={kind === 'exam' ? '무엇을 볼까요 (예: 단어 시험 1~3과)' : '무엇을 할까요 (예: 워크북 p.32~35)'} />
        <Counter n={title.length} max={LIMITS.todoTitle} />
      </div>
      <div style={{ padding: '8px 20px 0' }}><DateField value={pick} onChange={setDue} min={kstToday()} quick={quickDue} label="마감" /></div>
      <div className="btnrow"><button className="btn" disabled={busy} onClick={add}>넣기</button></div>
      <p className="muted" style={{ padding: '0 20px' }}>마감은 이 반 다음 수업일로 잡아 뒀어요. 원장님이 바꾸셔도 돼요.</p>
      </>}
    </section>
  );
}
