import { useState } from 'react';
import { listCalendar, addCalendar, removeCalendar, listClasses, listClassesFull, createClass, updateClass, assignClassTeacher, listTeachers, kstToday, fmtMDW, DOW, scheduleSummary, type CalItem, type Sched, type ClsFull, type Teacher } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast, deferDelete, isPending } from '../../lib/toast';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';

const KIND_LABEL: Record<CalItem['kind'], string> = { closed: '휴원', special: '특강', makeup: '보강' };

/* 휴원일·특강: 정하면 다음 수업·결석 신청 후보에서 빠지고, 오늘 화면이 알려준다 */
export function CalendarScreen() {
  const { data, err, reload, setData } = useLoad(() => listCalendar(kstToday()));
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
  /* 지우기는 5초 뒤에 진짜로 — 되돌리기를 누르면 없던 일이 된다 */
  function del(it: CalItem) {
    setData(l => l ? l.filter(x => x.id !== it.id) : l);
    const cancel = deferDelete(`cal:${it.id}`, () => { removeCalendar(it.id).then(() => reload()).catch(e => { errToast(e); reload(); }); });
    toast(`${fmtMDW(it.date)} ${KIND_LABEL[it.kind]}을 지웠어요`, { ms: 5000, action: { label: '되돌리기', onClick: () => { cancel(); reload(); } } });
  }
  const items = data?.filter(it => !isPending(`cal:${it.id}`));   /* 되돌리기를 기다리는 줄은 다시 읽어도 숨긴 채로 */
  return (
    <section className="view on">
      <div className="head"><p className="lede">휴원일을 정하면 학부모·학생의 <b>다음 수업</b>과 <b>결석 신청</b>에서 그날이 빠져요.</p></div>
      <div className="lab first">다가오는 날<span className="r">{items ? `${items.length}개` : ''}</span></div>
      {!items ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />) : (items.length ? <div className="box">{items.map(it => <div key={it.id} className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">{fmtMDW(it.date)} · {cname(it.class_id)}</span><span className="s">{it.note || KIND_LABEL[it.kind]}</span></span><span className={'tag ' + (it.kind === 'closed' ? 'danger' : it.kind === 'special' ? 'ok' : 'warn')}>{KIND_LABEL[it.kind]}</span><button className="btn sm line" style={{ marginLeft: 8 }} onClick={() => del(it)}>지우기</button></div>)}</div>
        : <div className="box"><Empty icon="calendar" title="정해 둔 날이 없어요" hint="아래에서 휴원일·특강을 넣으면 다음 수업에서 그날이 빠져요." /></div>)}
      <div className="lab">추가</div>
      <div style={{ padding: '0 20px' }}><input className="input" type="date" value={date} min={kstToday()} onChange={e => setDate(e.target.value)} /></div>
      <div className="seg" style={{ marginTop: 8 }}>{(['closed', 'special', 'makeup'] as CalItem['kind'][]).map(k => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}</div>
      <div className="seg" style={{ marginTop: 8 }}><button className={cls === null ? 'on' : ''} onClick={() => setCls(null)}>전체</button>{classes?.map(c => <button key={c.id} className={cls === c.id ? 'on' : ''} onClick={() => setCls(c.id)}>{c.name}</button>)}</div>
      <div style={{ padding: '8px 20px 0' }}><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="메모 (예: 추석 연휴)" /></div>
      <div className="btnrow"><button className="btn" disabled={busy} onClick={add}>저장</button></div>
      <p className="muted" style={{ padding: '0 20px' }}>반을 고르면 그 반만 쉬는 날이 돼요. 전체는 모든 반의 다음 수업에서 빠져요.</p>
    </section>
  );
}

/* 반·시간표: 이름 · 요일 · 시작·끝(요일마다 다르게도) · 담당 강사. */
export function Classes() {
  const { data, err, reload } = useLoad(listClassesFull);
  const { data: teachers } = useLoad(listTeachers);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <section className="view on">
      <div className="head"><p className="lede">반을 누르면 요일·시간·담당 강사를 고쳐요. 시간표는 <b>다음 수업</b>과 <b>결석 신청</b>에 바로 쓰여요.</p></div>
      <div className="lab first">반<span className="r">{data ? `${data.length}개` : ''}</span></div>
      {!data ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />) : (data.length === 0
        ? (!adding && <div className="box"><Empty icon="calendar" title="아직 반이 없어요" hint="반을 만들면 출석부·다음 수업·할 것이 모두 여기서 시작해요." action={{ label: '반 추가', onClick: () => setAdding(true) }} /></div>)
        : <div className="box">{data.map(c => open === c.id
        ? <ClassForm key={c.id} cls={c} teachers={teachers ?? []} onDone={() => { setOpen(null); reload(); }} />
        : <button key={c.id} className="rw" onClick={() => setOpen(c.id)}><span className="bd"><span className="t">{c.name}</span><span className="s">{scheduleSummary(c.schedule)}{tname(c, teachers) ? ` · ${tname(c, teachers)}` : ''}</span></span><span className="go">›</span></button>)}</div>)}
      {adding ? <div className="box" style={{ marginTop: 12 }}><ClassForm cls={null} teachers={teachers ?? []} onDone={() => { setAdding(false); reload(); }} /></div>
        : data?.length ? <div className="btnrow"><button className="btn line" onClick={() => setAdding(true)}>반 추가</button></div> : null}
    </section>
  );
}

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

/* 담당 강사 이름: 번호로 맞춰 보고, 옛 데이터를 위해 user_id 로도 맞춰 본다 */
const tname = (c: ClsFull, teachers: Teacher[] | null) =>
  teachers?.find(t => (c.teacher_phone && t.phone === c.teacher_phone) || (!c.teacher_phone && c.teacher_id && t.user_id === c.teacher_id))?.name ?? '';

function ClassForm({ cls, teachers, onDone }: { cls: ClsFull | null; teachers: Teacher[]; onDone: () => void }) {
  const [name, setName] = useState(cls?.name ?? '');
  const [dows, setDows] = useState<number[]>(cls ? [...new Set(cls.schedule.map(s => s.dow))] : []);
  const [start, setStart] = useState(cls?.schedule[0]?.start ?? '19:00'); const [end, setEnd] = useState(cls?.schedule[0]?.end ?? '21:00');
  const [perDowOn, setPerDowOn] = useState(() => !!cls && new Set(cls.schedule.map(s => `${s.start}-${s.end}`)).size > 1);
  const [perDow, setPerDow] = useState<Record<number, { start: string; end: string }>>(() => {
    const m: Record<number, { start: string; end: string }> = {};
    for (const s of cls?.schedule ?? []) m[s.dow] = { start: s.start, end: s.end };
    return m;
  });
  const [teacher, setTeacher] = useState(cls?.teacher_phone ?? '');
  const [busy, setBusy] = useState(false);
  function togglePerDowOn() {
    setPerDowOn(v => {
      const next = !v;
      if (next) setPerDow(p => { const np = { ...p }; for (const d of dows) if (!np[d]) np[d] = { start, end }; return np; });
      return next;
    });
  }
  function setPerDowField(d: number, field: 'start' | 'end', value: string) {
    setPerDow(p => ({ ...p, [d]: { ...(p[d] ?? { start, end }), [field]: value } }));
  }
  async function save() {
    if (!name.trim()) { toast('반 이름을 적어주세요'); return; }
    const sorted = [...dows].sort((a, b) => DOW_ORDER.indexOf(a) - DOW_ORDER.indexOf(b));
    const schedule: Sched[] = sorted.map(dow => { const t = perDowOn ? (perDow[dow] ?? { start, end }) : { start, end }; return { dow, start: t.start, end: t.end }; });
    if (schedule.some(s => s.start >= s.end)) { toast('끝나는 시간이 시작보다 늦어야 해요'); return; }
    setBusy(true);
    try {
      let id = cls?.id;
      if (cls) await updateClass(cls.id, name.trim(), schedule); else id = await createClass(name.trim(), schedule);
      if (id) await assignClassTeacher(id, teacher || null);
      toast('저장했어요'); onDone();
    }
    catch (e) { errToast(e); setBusy(false); }
  }
  return (
    <div style={{ padding: '12px 16px', display: 'grid', gap: 10 }}>
      <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="반 이름 (예: 고1 A)" />
      <div className="seg" style={{ padding: 0 }}>{DOW_ORDER.map(d => <button key={d} className={dows.includes(d) ? 'on' : ''} onClick={() => setDows(l => l.includes(d) ? l.filter(x => x !== d) : [...l, d])}>{DOW[d]}</button>)}</div>
      <label className="muted"><input type="checkbox" checked={perDowOn} onChange={togglePerDowOn} /> 요일마다 시간이 달라요</label>
      {perDowOn
        ? <div style={{ display: 'grid', gap: 8 }}>{DOW_ORDER.filter(d => dows.includes(d)).map(d => { const t = perDow[d] ?? { start, end }; return (
            <div key={d} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ width: 20 }}>{DOW[d]}</span>
              <input className="input" type="time" value={t.start} onChange={e => setPerDowField(d, 'start', e.target.value)} />
              <span className="muted">–</span>
              <input className="input" type="time" value={t.end} onChange={e => setPerDowField(d, 'end', e.target.value)} />
            </div>
          ); })}</div>
        : <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input className="input" type="time" value={start} onChange={e => setStart(e.target.value)} /><span className="muted">–</span><input className="input" type="time" value={end} onChange={e => setEnd(e.target.value)} /></div>}
      <select className="input" value={teacher} onChange={e => setTeacher(e.target.value)}>
        <option value="">담당 강사 없음 (원장님)</option>
        {teachers.map(t => <option key={t.phone} value={t.phone}>{t.name}{t.user_id ? '' : ' · 아직 안 들어옴'}</option>)}
      </select>
      <p className="muted" style={{ padding: 0 }}>강사가 앱에 들어오면 자동으로 연결돼 담당 반만 보게 돼요.</p>
      <div className="btnrow" style={{ padding: 0 }}><button className="btn line" onClick={onDone}>취소</button><button className="btn" disabled={busy} onClick={save}>저장</button></div>
    </div>
  );
}
