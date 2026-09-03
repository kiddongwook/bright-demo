import { useState } from 'react';
import { studentDetail, monthAttendance, timeline, listNotes, addNote, deleteNote, listCalendar, monthGrid, kstToday, saveStudent, type AttStatus, type TimelineItem, type Note } from '../../lib/api';
import { formatPhone } from '../../lib/phone';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast } from '../../lib/toast';

const MARK: Record<AttStatus, string> = { present: '○', late: '△', absent: '✕', makeup: '◌' };
const KIND: Record<TimelineItem['kind'], string> = { attendance: '출결', absence: '결석', inquiry: '문의', note: '메모' };
const when = (ts: string) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });

/* 학생 상세: 출결 달력 · 기록(타임라인) · 메모 */
export function StudentDetail() {
  const nav = useNav(); const id = nav.params.id;
  const { data: s } = useLoad(() => studentDetail(id), [id]);
  const [tab, setTab] = useState<'att' | 'log' | 'note'>('att'); const [busy, setBusy] = useState(false);
  async function reenroll() {
    if (!s || !confirm(`${s.name} 학생을 다시 다니는 것으로 할까요? 반과 번호를 다시 넣게 돼요.`)) return;
    setBusy(true);
    try { await saveStudent(s.id, s.name, [], '', []); toast('다시 다녀요. 반과 번호를 넣어주세요'); nav.replace('student-edit', { id: s.id }); } catch (e) { errToast(e); setBusy(false); }
  }
  if (!s) return <section className="view on" />;
  return (
    <section className="view on">
      <div className="head">
        <h1 className="hello">{s.name}{s.status === 'left' && <span className="tag muted" style={{ marginLeft: 8, verticalAlign: 'middle' }}>퇴원</span>}</h1>
        <p className="lede">{s.classes.map(c => c.name).join(' · ') || '반 없음'}{s.student_phone ? ` · 학생 ${formatPhone(s.student_phone)}` : ''}{s.parent_phones.length ? ` · 학부모 ${s.parent_phones.map(formatPhone).join(', ')}` : ''}</p>
      </div>
      <div className="seg" style={{ marginBottom: 6 }}>
        <button className={tab === 'att' ? 'on' : ''} onClick={() => setTab('att')}>출결</button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>기록</button>
        <button className={tab === 'note' ? 'on' : ''} onClick={() => setTab('note')}>메모</button>
        {s.status === 'active' ? <button className="btn sm line" style={{ flex: '0 0 auto' }} onClick={() => nav.push('student-edit', { id })}>편집</button>
          : <button className="btn sm" style={{ flex: '0 0 auto' }} disabled={busy} onClick={reenroll}>다시 다니기</button>}
      </div>
      {tab === 'att' && <MonthCal sid={id} />}
      {tab === 'log' && <Timeline sid={id} />}
      {tab === 'note' && <Notes sid={id} />}
    </section>
  );
}

export function MonthCal({ sid }: { sid: string }) {
  const [ym, setYm] = useState(kstToday().slice(0, 7));
  const g = monthGrid(ym);
  const { data: att } = useLoad(() => monthAttendance(sid, ym), [sid, ym]);
  const { data: cal } = useLoad(() => listCalendar(g.days.find(Boolean)!), [ym]);
  const m = new Map((att ?? []).map(a => [a.date, a.status]));
  const closed = new Set((cal ?? []).filter(c => c.kind === 'closed' && !c.class_id).map(c => c.date));
  const cnt = (st: AttStatus) => (att ?? []).filter(a => a.status === st).length;
  const total = att?.length ?? 0; const came = cnt('present') + cnt('late') + cnt('makeup');
  const today = kstToday();
  return (
    <>
      <div className="lab first"><button className="calnav" onClick={() => setYm(g.prev)} aria-label="이전 달">‹</button>{g.label}<button className="calnav" onClick={() => setYm(g.next)} aria-label="다음 달">›</button></div>
      <div className="box"><div className="cal">
        {['월', '화', '수', '목', '금', '토', '일'].map(d => <b key={d}>{d}</b>)}
        {g.days.map((d, i) => d
          ? <i key={i} className={(m.get(d) ? 'has ' + m.get(d) : '') + (closed.has(d) ? ' closed' : '') + (d === today ? ' today' : '')}><span>{+d.slice(8)}</span>{m.get(d) && <em>{MARK[m.get(d)!]}</em>}</i>
          : <i key={i} className="pad" />)}
      </div></div>
      <div className="legend"><span><b>○</b>출석 {cnt('present')}</span><span><b>△</b>지각 {cnt('late')}</span><span><b>✕</b>결석 {cnt('absent')}</span><span><b>◌</b>보강 {cnt('makeup')}</span></div>
      <p className="muted" style={{ padding: '6px 20px 0' }}>{total ? `기록된 ${total}일 중 ${came}일 출석 · 출석률 ${Math.round(came / total * 100)}%` : '이 달에는 기록이 없어요.'}{closed.size ? ` · 휴원 ${closed.size}일` : ''}</p>
    </>
  );
}

function Timeline({ sid }: { sid: string }) {
  const { data } = useLoad(() => timeline(sid), [sid]);
  return (
    <>
      <div className="lab first">기록<span className="r">출결 · 결석 · 문의 · 메모</span></div>
      {data && (data.length ? <div className="box">{data.map(t => <div key={t.kind + t.ref + t.ts} className="tl"><span className={'k ' + t.kind}>{KIND[t.kind]}</span><span className="bd"><span className="t">{t.title}</span>{t.body && <span className="s">{t.body}</span>}<span className="d">{when(t.ts)}</span></span></div>)}</div>
        : <p className="muted" style={{ padding: '0 20px' }}>아직 기록이 없어요. 출석은 지각·결석·보강만 여기에 남아요.</p>)}
    </>
  );
}

function Notes({ sid }: { sid: string }) {
  const { data, reload } = useLoad(() => listNotes(sid), [sid]);
  const [kind, setKind] = useState<Note['kind']>('consult'); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false);
  async function add() {
    if (!body.trim()) { toast('내용을 적어주세요'); return; }
    setBusy(true);
    try { await addNote(sid, kind, body.trim()); setBody(''); toast('남겼어요'); reload(); } catch (e) { errToast(e); } finally { setBusy(false); }
  }
  async function del(id: string) { if (!confirm('이 메모를 지울까요?')) return; try { await deleteNote(id); reload(); } catch (e) { errToast(e); } }
  return (
    <>
      <div className="lab first">새 메모<span className="r">원장님·강사만 봐요</span></div>
      <div className="seg"><button className={kind === 'consult' ? 'on' : ''} onClick={() => setKind('consult')}>상담</button><button className={kind === 'memo' ? 'on' : ''} onClick={() => setKind('memo')}>메모</button></div>
      <div style={{ padding: '10px 20px 0' }}><textarea className="input" style={{ minHeight: 80 }} value={body} onChange={e => setBody(e.target.value)} placeholder={kind === 'consult' ? '예) 어머님과 통화 — 단어 암기 계획 잡음' : '예) 수업 중 집중 잘함'} /></div>
      <div className="btnrow"><button className="btn" disabled={busy} onClick={add}>남기기</button></div>
      <div className="lab">지난 메모<span className="r">{data ? `${data.length}개` : ''}</span></div>
      {data && (data.length ? <div className="box">{data.map(n => <div key={n.id} className="tl"><span className={'k ' + (n.kind === 'consult' ? 'consult' : 'note')}>{n.kind === 'consult' ? '상담' : '메모'}</span><span className="bd"><span className="t" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</span><span className="d">{n.author_name} · {when(n.created_at)}</span></span><button className="btn sm line" onClick={() => del(n.id)}>지우기</button></div>)}</div>
        : <p className="muted" style={{ padding: '0 20px' }}>아직 메모가 없어요.</p>)}
    </>
  );
}
