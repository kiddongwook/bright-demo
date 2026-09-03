import { useState } from 'react';
import { listCalendar, addCalendar, removeCalendar, listClasses, listClassesFull, createClass, updateClass, listTeachers, kstToday, fmtMDW, DOW, type CalItem, type Sched, type ClsFull } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast } from '../../lib/toast';

const KIND_LABEL: Record<CalItem['kind'], string> = { closed: '휴원', special: '특강', makeup: '보강' };

/* 휴원일·특강: 정하면 다음 수업·결석 신청 후보에서 빠지고, 오늘 화면이 알려준다 */
export function CalendarScreen() {
  const { data, reload } = useLoad(() => listCalendar(kstToday()));
  const { data: classes } = useLoad(listClasses);
  const [date, setDate] = useState(''); const [kind, setKind] = useState<CalItem['kind']>('closed'); const [note, setNote] = useState(''); const [cls, setCls] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cname = (id: string | null) => id ? classes?.find(c => c.id === id)?.name ?? '반' : '전체';
  async function add() {
    if (!date) { toast('날짜를 골라주세요'); return; }
    setBusy(true);
    try { await addCalendar(date, kind, note.trim(), cls); toast(kind === 'closed' ? '저장했어요. 그날은 다음 수업·결석 신청에서 빠져요' : '저장했어요'); setDate(''); setNote(''); reload(); }
    catch (e) { errToast(e); } finally { setBusy(false); }
  }
  async function del(it: CalItem) { if (!confirm(`${fmtMDW(it.date)} ${KIND_LABEL[it.kind]}을 지울까요?`)) return; try { await removeCalendar(it.id); reload(); } catch (e) { errToast(e); } }
  return (
    <section className="view on">
      <div className="head"><p className="lede">휴원일을 정하면 학부모·학생의 <b>다음 수업</b>과 <b>결석 신청</b>에서 그날이 빠져요.</p></div>
      <div className="lab first">다가오는 날<span className="r">{data ? `${data.length}개` : ''}</span></div>
      {data && (data.length ? <div className="box">{data.map(it => <div key={it.id} className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">{fmtMDW(it.date)} · {cname(it.class_id)}</span><span className="s">{it.note || KIND_LABEL[it.kind]}</span></span><span className={'tag ' + (it.kind === 'closed' ? 'danger' : it.kind === 'special' ? 'ok' : 'warn')}>{KIND_LABEL[it.kind]}</span><button className="btn sm line" style={{ marginLeft: 8 }} onClick={() => del(it)}>지우기</button></div>)}</div>
        : <p className="muted" style={{ padding: '0 20px' }}>정해 둔 날이 없어요.</p>)}
      <div className="lab">추가</div>
      <div style={{ padding: '0 20px' }}><input className="input" type="date" value={date} min={kstToday()} onChange={e => setDate(e.target.value)} /></div>
      <div className="seg" style={{ marginTop: 8 }}>{(['closed', 'special', 'makeup'] as CalItem['kind'][]).map(k => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}</div>
      <div className="seg" style={{ marginTop: 8 }}><button className={cls === null ? 'on' : ''} onClick={() => setCls(null)}>전체</button>{classes?.map(c => <button key={c.id} className={cls === c.id ? 'on' : ''} onClick={() => setCls(c.id)}>{c.name}</button>)}</div>
      <div style={{ padding: '8px 20px 0' }}><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="메모 (예: 추석 연휴)" /></div>
      <div className="btnrow"><button className="btn" disabled={busy} onClick={add}>저장</button></div>
      <p className="muted" style={{ padding: '0 20px' }}>반별 휴원은 저장만 되고, 다음 수업에서 빼는 건 다음 단계예요. 지금은 전체 휴원만 반영돼요.</p>
    </section>
  );
}

/* 반·시간표: 이름 · 요일 · 시작·끝 · 담당 강사. 요일별 다른 시간은 다음 단계. */
export function Classes() {
  const { data, reload } = useLoad(listClassesFull);
  const { data: teachers } = useLoad(listTeachers);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const summary = (s: Sched[]) => s.length ? `${[...new Set(s.map(x => x.dow))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DOW[d]).join('')} ${s[0].start}–${s[0].end}` : '시간표 없음';
  return (
    <section className="view on">
      <div className="head"><p className="lede">반을 누르면 요일·시간·담당 강사를 고쳐요. 시간표는 <b>다음 수업</b>과 <b>결석 신청</b>에 바로 쓰여요.</p></div>
      <div className="lab first">반<span className="r">{data ? `${data.length}개` : ''}</span></div>
      {data && <div className="box">{data.map(c => open === c.id
        ? <ClassForm key={c.id} cls={c} teachers={teachers ?? []} onDone={() => { setOpen(null); reload(); }} />
        : <button key={c.id} className="rw" onClick={() => setOpen(c.id)}><span className="bd"><span className="t">{c.name}</span><span className="s">{summary(c.schedule)}{c.teacher_id ? ` · ${teachers?.find(t => t.user_id === c.teacher_id)?.name ?? '강사'}` : ''}</span></span><span className="go">›</span></button>)}</div>}
      {adding ? <div className="box" style={{ marginTop: 12 }}><ClassForm cls={null} teachers={teachers ?? []} onDone={() => { setAdding(false); reload(); }} /></div>
        : <div className="btnrow"><button className="btn line" onClick={() => setAdding(true)}>반 추가</button></div>}
    </section>
  );
}

function ClassForm({ cls, teachers, onDone }: { cls: ClsFull | null; teachers: { user_id: string | null; name: string }[]; onDone: () => void }) {
  const [name, setName] = useState(cls?.name ?? '');
  const [dows, setDows] = useState<number[]>(cls ? [...new Set(cls.schedule.map(s => s.dow))] : []);
  const [start, setStart] = useState(cls?.schedule[0]?.start ?? '19:00'); const [end, setEnd] = useState(cls?.schedule[0]?.end ?? '21:00');
  const [teacher, setTeacher] = useState<string | null>(cls?.teacher_id ?? null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) { toast('반 이름을 적어주세요'); return; }
    if (start >= end) { toast('끝나는 시간이 시작보다 늦어야 해요'); return; }
    const schedule: Sched[] = dows.sort((a, b) => a - b).map(dow => ({ dow, start, end }));
    setBusy(true);
    try { if (cls) await updateClass(cls.id, name.trim(), schedule, teacher); else await createClass(name.trim(), schedule); toast('저장했어요'); onDone(); }
    catch (e) { errToast(e); setBusy(false); }
  }
  return (
    <div style={{ padding: '12px 16px', display: 'grid', gap: 10 }}>
      <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="반 이름 (예: 고1 A)" />
      <div className="seg" style={{ padding: 0 }}>{[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} className={dows.includes(d) ? 'on' : ''} onClick={() => setDows(l => l.includes(d) ? l.filter(x => x !== d) : [...l, d])}>{DOW[d]}</button>)}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input className="input" type="time" value={start} onChange={e => setStart(e.target.value)} /><span className="muted">–</span><input className="input" type="time" value={end} onChange={e => setEnd(e.target.value)} /></div>
      <select className="input" value={teacher ?? ''} onChange={e => setTeacher(e.target.value || null)}>
        <option value="">담당 강사 없음 (원장님)</option>
        {teachers.filter(t => t.user_id).map(t => <option key={t.user_id!} value={t.user_id!}>{t.name}</option>)}
      </select>
      {teachers.some(t => !t.user_id) && <p className="muted" style={{ padding: 0 }}>아직 안 들어온 강사는 들어온 뒤에 고를 수 있어요.</p>}
      <div className="btnrow" style={{ padding: 0 }}><button className="btn line" onClick={onDone}>취소</button><button className="btn" disabled={busy} onClick={save}>저장</button></div>
    </div>
  );
}
