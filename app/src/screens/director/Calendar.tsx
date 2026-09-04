import { useState } from 'react';
import { listCalendar, addCalendar, addCalendarMany, removeCalendar, listClasses, listClassesFull, createClass, updateClass, assignClassTeacher, listTeachers, listStudents, listNotices, kstToday, kstDate, fmtMDW, DOW, dowOf, nextClassDaysFor, scheduleSummary, type CalItem, type Sched, type ClsFull, type Teacher } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { addDays, withEul } from '../../lib/dates';
import { groupCalendar, type CalGroup } from '../../lib/calendarGroups';
import { DOW_ORDER, DEFAULT_START, DEFAULT_END, toGroups, fromGroups, validateGroups, unassignedDows, toggleDow, dowsLabel, type Group } from '../../lib/schedule';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast, deferDelete, isPending } from '../../lib/toast';
import { confirmSheet } from '../../components/Confirm';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { DateField } from '../../components/DateField';
import { TimeField } from '../../components/TimeField';
import '../classes.css';

const KIND_LABEL: Record<CalItem['kind'], string> = { closed: '휴원', special: '특강', makeup: '보강' };
/* 한 번에 넣는 방법 — 하루 / 시작~끝 / 그 요일로 몇 주 */
const MODE_LABEL = { one: '하루', range: '기간', weekly: '매주' } as const;
type Mode = keyof typeof MODE_LABEL;
const MAX_RANGE = 31;                       /* 한 번에 넣을 수 있는 날 수 — 실수로 한 해를 통째로 막지 않게 */
const WEEK_COUNTS = [4, 8, 12] as const;
/** 두 날 사이의 날 수 (양끝 포함) */
const spanDays = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400e3) + 1;

/* 휴원일·특강: 정하면 다음 수업·결석 신청 후보에서 빠지고, 오늘 화면이 알려준다 */
export function CalendarScreen() {
  const { data, err, reload, setData } = useLoad(() => listCalendar(kstToday()));
  const { data: classes } = useLoad(listClasses);
  const [date, setDate] = useState(''); const [kind, setKind] = useState<CalItem['kind']>('closed'); const [note, setNote] = useState(''); const [cls, setCls] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('one');
  const [end, setEnd] = useState('');                       /* 기간의 끝나는 날 */
  const [dowPick, setDowPick] = useState<number | null>(null);   /* 매주 — 안 고르면 시작 날의 요일 */
  const [weeks, setWeeks] = useState<number>(4);
  const [busy, setBusy] = useState(false);
  const cname = (id: string | null) => id ? classes?.find(c => c.id === id)?.name ?? '반' : '전체';
  /* 빠른 날짜 — 고른 반의 다음 수업일까지 (전체면 아무 반이나 가장 이른 날) */
  const nextDay = nextClassDaysFor(cls ? (classes ?? []).filter(c => c.id === cls) : (classes ?? []), 1)[0];
  const quickDays = [{ label: '오늘', date: kstToday() }, { label: '내일', date: kstDate(1) }, ...(nextDay ? [{ label: '다음 수업일', date: nextDay }] : [])];
  const wdow = dowPick ?? dowOf(date || kstToday());
  /** 이번에 넣을 날들 — 잘못 고른 게 있으면 문구를 대신 돌려준다 */
  function pickDays(): string[] | string {
    if (!date) return mode === 'one' ? '날짜를 골라주세요' : '시작 날짜를 골라주세요';
    if (mode === 'one') return [date];
    if (mode === 'range') {
      if (!end) return '끝나는 날짜를 골라주세요';
      if (end < date) return '끝나는 날이 시작보다 늦어야 해요';
      const n = spanDays(date, end);
      if (n > MAX_RANGE) return `한 번에 ${MAX_RANGE}일까지 넣을 수 있어요`;
      return Array.from({ length: n }, (_, i) => addDays(date, i));
    }
    let first = date;                                        /* 시작 날짜 이후로 그 요일이 처음 오는 날부터 */
    for (let i = 0; i < 7 && dowOf(first) !== wdow; i++) first = addDays(first, 1);
    return Array.from({ length: weeks }, (_, i) => addDays(first, i * 7));
  }
  async function add() {
    const days = pickDays();
    if (typeof days === 'string') { toast(days); return; }
    setBusy(true);
    try {
      if (days.length === 1) {
        await addCalendar(days[0], kind, note.trim(), cls);
        toast(kind === 'closed' ? '저장했어요. 그날은 다음 수업·결석 신청에서 빠져요' : '저장했어요');
      } else {
        /* 이미 있는 날은 건너뛴다 — (날짜·종류·반) 이 겹치면 서버가 막고, 메모를 덮어쓰는 것도 원하는 바가 아니다 */
        const had = new Set((await listCalendar(days[0])).filter(x => x.kind === kind && x.class_id === cls).map(x => x.date));
        const fresh = days.filter(d => !had.has(d));
        if (!fresh.length) { toast('이미 다 들어가 있어요'); setBusy(false); return; }
        /* 서버가 겹치는 날을 건너뛰고 실제로 넣은 수를 돌려준다 — 다른 탭이 방금 넣은 날 때문에 전부 없던 일이 되지 않게(INT-05) */
        const inserted = await addCalendarMany(fresh, kind, note.trim(), cls);
        const skipped = days.length - inserted;
        if (!inserted) toast('이미 다 들어가 있어요');
        else toast(`${inserted}일을 넣었어요` + (skipped ? ` (이미 있던 ${skipped}일은 건너뜀)` : ''));
      }
      setDate(''); setEnd(''); setNote(''); setDowPick(null); reload();
    }
    catch (e) { errToast(e); } finally { setBusy(false); }
  }
  /* 지우기는 5초 뒤에 진짜로 — 되돌리기를 누르면 없던 일이 된다. 묶인 줄은 한 번에 다 지운다. */
  async function del(g: CalGroup<CalItem>) {
    const n = g.items.length;
    const span = n > 1 ? `${fmtMDW(g.from)} – ${fmtMDW(g.to)}` : fmtMDW(g.from);
    if (n > 1 && !(await confirmSheet({ title: `${n}일을 모두 지울까요?`, body: `${span} · ${g.note || KIND_LABEL[g.kind]}`, okLabel: '지우기', danger: true }))) return;
    const ids = g.items.map(x => x.id);
    setData(l => l ? l.filter(x => !ids.includes(x.id)) : l);
    const cancels = ids.map(id => deferDelete(`cal:${id}`, () => { removeCalendar(id).then(() => reload()).catch(e => { errToast(e); reload(); }); }));
    toast(`${span} ${KIND_LABEL[g.kind]}${n > 1 ? ` ${n}일` : ''}을 지웠어요`, { ms: 5000, action: { label: '되돌리기', onClick: () => { cancels.forEach(c => c()); reload(); } } });
  }
  const items = data?.filter(it => !isPending(`cal:${it.id}`));   /* 되돌리기를 기다리는 줄은 다시 읽어도 숨긴 채로 */
  const groups = items && groupCalendar(items);                   /* 연달아 붙은 같은 날은 한 줄로 */
  const plan = pickDays();                                        /* 지금 고른 대로면 몇 날이 들어가는지 — 누르기 전에 보여 준다 */
  return (
    <section className="view on">
      <div className="head"><p className="lede">휴원일을 정하면 학부모·학생의 <b>다음 수업</b>과 <b>결석 신청</b>에서 그날이 빠져요.</p></div>
      <div className="lab first">다가오는 날<span className="r">{items ? `${items.length}개` : ''}</span></div>
      {!groups ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />) : (groups.length ? <div className="box">{groups.map(g => <div key={g.items[0].id} className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">{fmtMDW(g.from)}{g.to !== g.from ? ` – ${fmtMDW(g.to)}` : ''} · {cname(g.class_id)}</span><span className="s">{g.note || KIND_LABEL[g.kind]}{g.items.length > 1 ? ` · ${g.items.length}일` : ''}</span></span><span className={'tag ' + (g.kind === 'closed' ? 'danger' : g.kind === 'special' ? 'ok' : 'warn')}>{KIND_LABEL[g.kind]}</span><button className="btn sm line" style={{ marginLeft: 8 }} onClick={() => del(g)}>지우기</button></div>)}</div>
        : <div className="box"><Empty icon="calendar" title="정해 둔 날이 없어요" hint="아래에서 휴원일·특강을 넣으면 다음 수업에서 그날이 빠져요." /></div>)}
      <div className="lab">추가</div>
      <div className="seg">{(Object.keys(MODE_LABEL) as Mode[]).map(m => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>)}</div>
      <div style={{ padding: '8px 20px 0' }}><DateField value={date} onChange={setDate} min={kstToday()} quick={quickDays} clearable label={mode === 'one' ? '날짜' : '시작 날짜'} placeholder={mode === 'one' ? '날짜 고르기' : '시작 날짜 고르기'} /></div>
      {mode === 'range' && <div style={{ padding: '8px 20px 0' }}><DateField value={end} onChange={setEnd} min={date || kstToday()} quick={[]} clearable label="끝나는 날짜" placeholder="끝나는 날짜 고르기" /></div>}
      {mode === 'weekly' && <>
        <div className="seg" style={{ marginTop: 8 }}>{DOW_ORDER.map(d => <button key={d} className={wdow === d ? 'on' : ''} onClick={() => setDowPick(d)}>{DOW[d]}</button>)}</div>
        <div className="seg" style={{ marginTop: 8 }}>{WEEK_COUNTS.map(n => <button key={n} className={weeks === n ? 'on' : ''} onClick={() => setWeeks(n)}>{n}주</button>)}</div>
      </>}
      <div className="seg" style={{ marginTop: 8 }}>{(['closed', 'special', 'makeup'] as CalItem['kind'][]).map(k => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}</div>
      <div className="seg" style={{ marginTop: 8 }}><button className={cls === null ? 'on' : ''} onClick={() => setCls(null)}>전체</button>{classes?.map(c => <button key={c.id} className={cls === c.id ? 'on' : ''} onClick={() => setCls(c.id)}>{c.name}</button>)}</div>
      <div style={{ padding: '8px 20px 0' }}><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder={mode === 'weekly' ? '메모 (예: 매주 일요일 휴원)' : '메모 (예: 추석 연휴)'} /></div>
      <div className="btnrow"><button className="btn" disabled={busy} onClick={add}>저장</button></div>
      <p className="muted" style={{ padding: '0 20px' }}>
        {typeof plan !== 'string' && plan.length > 1 ? `${fmtMDW(plan[0])}부터 ${plan.length}일을 넣어요. 이미 있는 날은 건너뛰어요. ` : ''}
        반을 고르면 그 반만 쉬는 날이 돼요. 전체는 모든 반의 다음 수업에서 빠져요.
      </p>
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

/* 반을 지우는 길 — api.ts 는 다른 손이 잡고 있어 여기 둔다(다음 정리 때 api.ts 로 옮길 것).
   딸린 것은 서버가 정리한다: 휴원일·특강·요금제·할 것·출석 기록은 함께 지워지고(0004·0018 cascade),
   반 대상 공지와 등록된 학생은 서버가 막는다(restrict) — 그래서 부르기 전에 먼저 세어 본다. */
async function deleteClass(id: string) {
  const { error } = await supabase.from('classes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
/* 이 반을 붙잡고 있는 공지 수 — 옛 꼴(notices.target_class_id)과 여러 반 꼴(notice_targets, 0021)을 합쳐 한 번만 센다.
   notice_targets 가 아직 안 올라간 서버에서는 조용히 넘어간다(없는 표를 물어도 삭제를 막지 않게). */
async function countBlockingNotices(classId: string, notices: { id: string; target_class_id: string | null }[]) {
  const ids = new Set(notices.filter(n => n.target_class_id === classId).map(n => n.id));
  const { data } = await supabase.from('notice_targets').select('notice_id').eq('class_id', classId);
  for (const r of (data ?? []) as { notice_id: string }[]) ids.add(r.notice_id);
  return ids.size;
}

/* 담당 강사 이름: 번호로 맞춰 보고, 옛 데이터를 위해 user_id 로도 맞춰 본다 */
const tname = (c: ClsFull, teachers: Teacher[] | null) =>
  teachers?.find(t => (c.teacher_phone && t.phone === c.teacher_phone) || (!c.teacher_phone && c.teacher_id && t.user_id === c.teacher_id))?.name ?? '';

function ClassForm({ cls, teachers, onDone }: { cls: ClsFull | null; teachers: Teacher[]; onDone: () => void }) {
  const [name, setName] = useState(cls?.name ?? '');
  /* 시간표는 "요일 시간 묶음" 으로 고친다 — 월·수·금 7시 / 토 10시 = 묶음 둘. 저장 직전에 요일 줄로 편다. */
  const [groups, setGroups] = useState<Group[]>(() => {
    const g = toGroups(cls?.schedule);
    return g.length ? g : [{ dows: [], start: DEFAULT_START, end: DEFAULT_END }];
  });
  const [teacher, setTeacher] = useState(cls?.teacher_phone ?? '');
  const [busy, setBusy] = useState(false);
  const setTime = (i: number, field: 'start' | 'end', v: string) => setGroups(l => l.map((g, gi) => gi === i ? { ...g, [field]: v } : g));
  const addGroup = () => setGroups(l => [...l, { dows: unassignedDows(l), start: DEFAULT_START, end: DEFAULT_END }]);
  const peek = scheduleSummary(fromGroups(groups));   /* 지금 고른 대로면 반 목록에 이렇게 보인다 */
  async function save() {
    if (!name.trim()) { toast('반 이름을 적어주세요'); return; }
    const bad = validateGroups(groups);
    if (bad) { toast(bad); return; }
    const schedule: Sched[] = fromGroups(groups);
    setBusy(true);
    try {
      let id = cls?.id;
      if (cls) await updateClass(cls.id, name.trim(), schedule); else id = await createClass(name.trim(), schedule);
      if (id) await assignClassTeacher(id, teacher || null);
      toast('저장했어요'); onDone();
    }
    catch (e) { errToast(e); setBusy(false); }
  }
  /* 반 없애기 — 학생·공지가 걸려 있으면 서버가 막는다. 막힐 걸 먼저 세어 이유부터 말해 준다. */
  async function removeClassFlow() {
    if (!cls) return;
    setBusy(true);
    let stuCount = 0, noticeCount = 0;
    try {
      const [students, notices] = await Promise.all([listStudents(cls.id), listNotices()]);
      stuCount = students.length;
      noticeCount = await countBlockingNotices(cls.id, notices);
    } catch (e) { errToast(e); setBusy(false); return; }
    setBusy(false);
    if (stuCount || noticeCount) {
      const why = [stuCount ? `이 반에 학생 ${stuCount}명이 있어요` : '', noticeCount ? `이 반 대상 공지 ${noticeCount}건이 있어요` : ''].filter(Boolean).join('. ');
      await confirmSheet({
        title: `${cls.name} 반은 아직 없앨 수 없어요`,
        body: `${why}. 학생은 명부에서 다른 반으로 옮기고, 공지는 지운 뒤에 반을 없앨 수 있어요.`,
        okLabel: '알겠어요', cancelLabel: '닫기',
      });
      return;
    }
    if (!(await confirmSheet({
      title: `${withEul(cls.name)} 없앨까요?`,
      body: '이 반의 휴원일·특강, 수강료 기준, 할 것, 출석 기록이 함께 지워져요. 되돌릴 수 없어요.',
      okLabel: '없애기', danger: true,
    }))) return;
    setBusy(true);
    try { await deleteClass(cls.id); toast('반을 없앴어요'); onDone(); }
    catch (e) { errToast(e); setBusy(false); }
  }
  return (
    <div style={{ padding: '12px 16px', display: 'grid', gap: 10 }}>
      <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="반 이름 (예: 고1 A)" />
      <div className="sgrp">
        {groups.map((g, i) => (
          <div key={i} className="grp">
            <div className="grp-dows">
              <div className="dows">{DOW_ORDER.map(d => {
                const on = g.dows.includes(d);
                const taken = !on && groups.some((o, oi) => oi !== i && o.dows.includes(d));
                return <button key={d} type="button" className={on ? 'on' : taken ? 'taken' : ''} aria-pressed={on}
                  aria-label={`${DOW[d]}요일${taken ? ' · 다른 묶음에 있어요' : ''}`}
                  onClick={() => setGroups(l => toggleDow(l, i, d))}>{DOW[d]}</button>;
              })}</div>
              {groups.length > 1 && <button type="button" className="grp-x" aria-label="이 시간 묶음 지우기"
                onClick={() => setGroups(l => l.filter((_, gi) => gi !== i))}>✕</button>}
            </div>
            <div className="grp-time">
              <TimeField value={g.start} onChange={v => setTime(i, 'start', v)} label={`${dowsLabel(g.dows) || `${i + 1}번째 묶음`} 시작`} />
              <span className="muted">–</span>
              <TimeField value={g.end} onChange={v => setTime(i, 'end', v)} label={`${dowsLabel(g.dows) || `${i + 1}번째 묶음`} 끝`} />
            </div>
          </div>
        ))}
        <button type="button" className="grp-add" onClick={addGroup}>+ 다른 시간 묶음</button>
      </div>
      <p className="sched-peek">요일마다 시간이 다르면 묶음을 더 만들어요 · 지금: {peek}</p>
      <select className="input" value={teacher} onChange={e => setTeacher(e.target.value)}>
        <option value="">담당 강사 없음 (원장님)</option>
        {teachers.map(t => <option key={t.phone} value={t.phone}>{t.name}{t.user_id ? '' : ' · 아직 안 들어옴'}</option>)}
      </select>
      <p className="muted" style={{ padding: 0 }}>강사가 앱에 들어오면 자동으로 연결돼 담당 반만 보게 돼요.</p>
      <div className="btnrow" style={{ padding: 0 }}><button className="btn line" onClick={onDone}>취소</button><button className="btn" disabled={busy} onClick={save}>저장</button></div>
      {cls && <div className="cls-danger">
        <button className="btn line danger" disabled={busy} onClick={removeClassFlow}>반 없애기</button>
        <p>학생이 있거나 이 반 대상 공지가 있으면 없앨 수 없어요. 먼저 옮기고 지워 주세요.</p>
      </div>}
    </div>
  );
}
