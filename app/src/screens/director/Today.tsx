import { useEffect, useState } from 'react';
import { listClassesFull, todayAttendance, saveAttendance, listAbsences, closedByClass, closedFor, markMakeupAttended, type Closed, kstToday, dowOf, fmtMDW, fmtDT, type Cls, type AttRow, type AttStatus, type Absence } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useSession } from '../../auth/session';
import { toast, errToast } from '../../lib/toast';

const MARK: Record<AttStatus, string> = { present: '○', late: '△', absent: '✕', makeup: '◌' };
const CLS: Record<AttStatus, string> = { present: 'p', late: 'l', absent: 'a', makeup: 'p' };

export function Today() {
  const nav = useNav(); const { active, session } = useSession();
  const today = kstToday();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [cid, setCid] = useState<string>('');
  const [rows, setRows] = useState<AttRow[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<Closed | undefined>();
  useEffect(() => { (async () => {
    // 강사는 담당 반만 (반 목록은 학원 전체가 보이므로 여기서 거른다 — 학생·출결은 RLS 가 이미 막는다)
    const all = await listClassesFull();
    const cs: Cls[] = active?.role === 'teacher' ? all.filter(c => c.teacher_id === session?.user.id) : all; setClasses(cs);
    closedByClass().then(setClosed).catch(() => {});
    const todayDow = dowOf(today);
    const pick = cs.find(c => (c.schedule ?? []).some(s => s.dow === todayDow)) ?? cs[0];
    if (pick) setCid(pick.id);
    setAbsences(await listAbsences());
  })().catch(errToast); }, []);
  useEffect(() => { if (cid) todayAttendance(cid, today).then(setRows).catch(errToast); }, [cid]);
  const cls = classes.find(c => c.id === cid);
  const hasClassToday = !!cls && (cls.schedule ?? []).some(s => s.dow === dowOf(today));
  const mark = (sid: string, st: AttStatus) => setRows(r => r.map(x => x.student_id === sid ? { ...x, status: x.status === st ? null : st } : x));
  async function save() {
    const marked = rows.filter(r => r.status).map(r => ({ student_id: r.student_id, status: r.status! }));
    if (!marked.length) { toast('아직 아무도 표시하지 않았어요'); return; }
    setBusy(true);
    try { await saveAttendance(cid, today, marked); const n = marked.filter(m => m.status !== 'present').length; toast(n ? `출결을 저장하고, 결석·지각 ${n}명의 학부모에게 알림을 보냈어요` : '출결을 저장했어요. 모두 출석이라 알림은 없어요'); }
    catch (e) { errToast(e); } finally { setBusy(false); }
  }
  const pending = absences.filter(a => a.status === 'requested'), done = absences.filter(a => a.status !== 'requested');
  const isClosed = !!cid && closedFor(closed, cid).has(today);
  async function attended(a: Absence) {
    try { await markMakeupAttended(a.id); toast(`${a.student_name} 보강 출석으로 기록했어요`); setAbsences(await listAbsences()); } catch (e) { errToast(e); }
  }
  const absRow = (a: Absence) => (
    <button key={a.id} className="rw" onClick={() => nav.push('makeup', { id: a.id })}>
      <span className="nm">{a.student_name.charAt(0)}</span>
      <span className="bd"><span className="t">{a.student_name} · {fmtMDW(a.date)}</span><span className="s">{a.reason}{a.makeup_at ? ` · 보강 ${fmtDT(a.makeup_at)}` : ''}</span></span>
      {a.status === 'requested' ? <span className="tag danger">요청</span>
        : a.attended_at ? <span className="tag muted">완료</span>
        : a.makeup_kind === 'material' ? <span className="tag ok">자료 대체</span>
        : <span className="btn sm line" role="button" onClick={e => { e.stopPropagation(); attended(a); }}>보강 왔어요</span>}
    </button>);
  return (
    <section className="view on">
      <div className="head">
        <h1 className="hello">오늘 · {fmtMDW(today)}</h1>
        <p className="lede">{cls ? `${cls.name} · ` : ''}{isClosed ? '오늘은 휴원일이에요. 그래도 기록할 수 있어요. 저장하면 ' : hasClassToday ? '이름 옆을 누르면 바로 표시돼요. 저장하면 ' : '오늘은 이 반 수업이 없는 날이에요. 그래도 기록할 수 있어요. 저장하면 '}<b>결석·지각 학부모 알림까지 한 번에</b> 나갑니다.</p>
      </div>
      {classes.length > 1 && <div className="seg">{classes.map(c => <button key={c.id} className={c.id === cid ? 'on' : ''} onClick={() => setCid(c.id)}>{c.name}</button>)}</div>}
      <div className="lab">출석부</div>
      <div className="box">
        {rows.length === 0 && <p className="muted" style={{ padding: '14px 16px' }}>이 반에 학생이 없어요.</p>}
        {rows.map(r => (
          <div key={r.student_id} className="rw" style={{ padding: '12px 16px' }}>
            <span className="nm">{r.name.charAt(0)}</span><span className="bd"><span className="t">{r.name}</span></span>
            <span className="marks">{(['present', 'late', 'absent'] as AttStatus[]).map(st => <button key={st} className={r.status === st ? 'on ' + CLS[st] : ''} onClick={() => mark(r.student_id, st)} aria-label={st}>{MARK[st]}</button>)}</span>
          </div>))}
      </div>
      <div className="legend"><span><b>○</b>출석</span><span><b>△</b>지각</span><span><b>✕</b>결석</span></div>
      <div className="btnrow"><button className="btn" disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장하고 알리기'}</button></div>
      <div className="btnrow" style={{ paddingTop: 0 }}><button className="btn line" onClick={() => nav.push('todos', { cid })}>이번 주 할 것 관리</button></div>

      <div className="lab">결석 신청<span className="r">학부모가 미리 알린 것</span></div>
      {pending.length ? <div className="box">{pending.map(absRow)}</div> : <p className="muted" style={{ padding: '0 20px' }}>새 결석 신청이 없어요.</p>}
      {done.length > 0 && <><div className="lab">처리됨</div><div className="box soft">{done.slice(0, 5).map(absRow)}</div></>}
    </section>
  );
}
