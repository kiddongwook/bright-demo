import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { listClassesFull, listAbsences, closedByClass, closedFor, markMakeupAttended, todaySummary, nextClassDaysFor, type Closed, kstToday, dowOf, fmtMDW, fmtDT, type Cls, type AttStatus, type Absence } from '../../lib/api';
import { fmtDateFull } from '../../lib/dates';
import { todayAttendanceWithNotes, saveAttendanceWithNotes, pickInitialClass, kstNowMin, REASONS, type AttNoteRow } from '../../lib/attendance';
import { atSheetEntry, openSheetEntry, setSheetClose } from '../../lib/nav-history';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { useSession } from '../../auth/session';
import { toast, errToast } from '../../lib/toast';
import { FirstSteps } from '../../components/FirstSteps';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { BottomCta } from '../../components/BottomCta';
import { usePop } from '../../lib/pop';
import { Counter } from '../../components/Counter';
import { LIMITS } from '../../lib/limits';
import '../ui.css';
import '../ux.css';

/* 출석부 타일 — 이름 아래 말, 타일 색, 다음에 누르면 갈 곳 */
const LABEL: Record<AttStatus, string> = { present: '출석', late: '지각', absent: '결석', makeup: '보강' };
const CLS: Record<AttStatus, string> = { present: 'p', late: 'l', absent: 'a', makeup: 'p' };
/* 미기록 → 출석 → 지각 → 결석 → 미기록. 보강(보강 화면에서 붙는다)에서 누르면 보통 차례로 들어온다 */
const NEXT: Record<string, AttStatus | null> = { '': 'present', present: 'late', late: 'absent', absent: null, makeup: 'present' };
/* 사유 시트에서 고르는 네 자리 */
const SHEET_STATUS: { v: AttStatus | null; label: string }[] =
  [{ v: 'present', label: '출석' }, { v: 'late', label: '지각' }, { v: 'absent', label: '결석' }, { v: null, label: '미기록' }];
const LONG_PRESS_MS = 450;
/* 지금 화면의 표시 — 마지막으로 불러온(또는 저장한) 것과 견줘 "고쳤는지"를 본다. 사유도 함께 본다. */
const key = (r: { status: AttStatus | null; note: string | null }) => (r.status ?? '') + '|' + (r.note ?? '');
const snap = (rs: AttNoteRow[]): Record<string, string> => Object.fromEntries(rs.map(r => [r.student_id, key(r)]));

export function Today() {
  const nav = useNav(); const { active, session } = useSession();
  const today = kstToday();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [cid, setCid] = useState<string>('');
  const [rows, setRows] = useState<AttNoteRow[]>([]);
  const [base, setBase] = useState<Record<string, string>>({});   // 서버에 있는 것 — 이것과 다를 때만 저장 바가 뜬다
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);   // 저장 직후 0.9초 — 단추 안에 체크가 뜬다
  const savedT = useRef(0);
  const pop = usePop();                        // 방금 누른 ○△✕ 만 한 번 튄다
  const [closed, setClosed] = useState<Closed | undefined>();
  const [clsReady, setClsReady] = useState(false);
  const [rowsReady, setRowsReady] = useState(false); const [rowsErr, setRowsErr] = useState(false);
  const isDirector = active?.role === 'director';
  const { data: sum, reload: reloadSum } = useLoad(() => todaySummary(!!isDirector), [isDirector]);
  const absRef = useRef<HTMLDivElement>(null);
  /* 사유 시트 — 타일을 길게 누르거나(손가락·마우스 공통) 타일 오른쪽 위 "…" 를 눌러 연다 */
  type Sheet = { sid: string; name: string; status: AttStatus | null; note: string };
  const [sheet, setSheet] = useState<Sheet | null>(null);
  /* 시트는 .app 안에 붙인다 — .view 는 들어올 때 transform 으로 움직여서 그 안에 두면 자리가 어긋난다 */
  const [sheetHost, setSheetHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setSheetHost(document.querySelector<HTMLElement>('.app')); }, []);
  const lpT = useRef(0);            // 길게 누르기 타이머
  const lpFired = useRef(false);    // 시트가 떴으면 이어 오는 click 은 한 바퀴 돌리지 않는다
  useEffect(() => () => clearTimeout(savedT.current), []);
  useEffect(() => () => clearTimeout(lpT.current), []);
  useEffect(() => { (async () => {
    // 강사는 담당 반만 (반 목록은 학원 전체가 보이므로 여기서 거른다 — 학생·출결은 RLS 가 이미 막는다)
    const all = await listClassesFull();
    const cs: Cls[] = active?.role === 'teacher' ? all.filter(c => c.teacher_id === session?.user.id) : all; setClasses(cs); setClsReady(true);
    closedByClass().then(setClosed).catch(() => {});
    // 처음 열 때는 "지금 수업 중인 반" 을 보여 준다 — 고른 뒤에는 사람이 고른 것이 이긴다
    const pick = pickInitialClass(cs, dowOf(today), kstNowMin());
    if (pick) setCid(pick.id);
    setAbsences(await listAbsences());
  })().catch(errToast); }, []);
  function loadRows() {
    if (!cid) return;
    setRowsReady(false); setRowsErr(false);
    todayAttendanceWithNotes(cid, today).then(r => { setRows(r); setBase(snap(r)); setRowsReady(true); }).catch(e => { setRowsErr(true); errToast(e); });
  }
  useEffect(loadRows, [cid]);
  const cls = classes.find(c => c.id === cid);
  const hasClassToday = !!cls && (cls.schedule ?? []).some(s => s.dow === dowOf(today));
  // 타일을 누르면 다음 상태로 넘어간다 — 세 개 중 하나를 고르는 게 아니라 한 자리를 돌린다.
  // 한 바퀴 돌리면 적어 둔 사유는 지운다 (지각 "10분" 을 돌려 결석으로 만들고 "결석 · 10분" 이 남으면 거짓말이 된다).
  function mark(sid: string) {
    pop.fire(sid);
    setRows(r => r.map(x => x.student_id === sid ? { ...x, status: NEXT[x.status ?? ''] ?? null, note: null } : x));
  }
  const allPresent = rows.length > 0 && rows.every(r => r.status === 'present');
  // 전원 출석: 아직 안 누른 사람만 출석으로 (지각·결석으로 이미 표시한 사람은 건드리지 않는다).
  // 다 출석이면 같은 자리가 전체 지우기가 된다 — 잘못 누른 뒤 되돌릴 곳이 있어야 해서.
  function markAll() {
    setRows(r => r.map(x => allPresent ? { ...x, status: null, note: null } : x.status ? x : { ...x, status: 'present' }));
  }
  const dirty = rows.some(r => key(r) !== (base[r.student_id] ?? '|'));
  /* ── 사유 시트 ──
     열 때 history 항목을 하나 쌓는다(확인 시트와 같은 길) — 안드로이드 뒤로가기가 화면이 아니라 시트를 닫게. */
  function openSheet(sid: string) {
    const r = rows.find(x => x.student_id === sid); if (!r) return;
    // 보강(보강 화면이 붙인 것)은 시트에 고를 자리가 없다 — 그대로 두고, 사람이 seg 를 눌러야만 바뀐다
    setSheet({ sid, name: r.name, status: r.status, note: r.note ?? '' });
    setSheetClose(() => setSheet(null));
    openSheetEntry();
  }
  function closeSheet() {
    if (atSheetEntry()) { history.back(); return; }   // popstate → setSheetClose 가 닫는다
    setSheetClose(null); setSheet(null);
  }
  function applySheet() {
    if (!sheet) return;
    const { sid, status, note } = sheet; const n = note.trim();
    setRows(r => r.map(x => x.student_id === sid ? { ...x, status, note: status ? (n || null) : null } : x));
    closeSheet();
  }
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeSheet(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet]);
  /* 길게 누르기: pointerdown 에서 450ms 를 재고, 떼거나 벗어나면 취소한다. 손가락·마우스가 같은 길을 탄다. */
  function lpDown(sid: string) {
    lpFired.current = false; clearTimeout(lpT.current);
    lpT.current = window.setTimeout(() => { lpFired.current = true; openSheet(sid); }, LONG_PRESS_MS);
  }
  const lpUp = () => clearTimeout(lpT.current);
  function tap(sid: string) {
    if (lpFired.current) { lpFired.current = false; return; }   // 방금 시트를 열었다 — 상태를 돌리지 않는다
    mark(sid);
  }
  const count = (st: AttStatus) => rows.filter(r => r.status === st).length;
  const nPresent = count('present') + count('makeup'), nLate = count('late'), nAbsent = count('absent');
  const nNone = rows.filter(r => !r.status).length;
  async function save() {
    const marked = rows.filter(r => r.status).map(r => ({ student_id: r.student_id, status: r.status!, note: r.note }));
    if (!marked.length) { toast('아직 아무도 표시하지 않았어요'); return; }
    const sent = snap(rows);   // 저장을 누른 그 순간의 표시 — 성공하면 이것이 새 기준이 된다
    setBusy(true);
    try { await saveAttendanceWithNotes(cid, today, marked); const n = marked.filter(m => m.status !== 'present').length; toast(n ? `출결을 저장하고, 결석·지각 ${n}명의 학부모에게 알림을 보냈어요` : '출결을 저장했어요. 모두 출석이라 알림은 없어요'); reloadSum();
      setBase(sent);
      setSaved(true); clearTimeout(savedT.current); savedT.current = window.setTimeout(() => setSaved(false), 900); }
    catch (e) { errToast(e); } finally { setBusy(false); }
  }
  const pending = absences.filter(a => a.status === 'requested'), done = absences.filter(a => a.status !== 'requested');
  const isClosed = !!cid && closedFor(closed, cid).has(today);
  async function attended(a: Absence) {
    try { await markMakeupAttended(a.id); toast(`${a.student_name} 보강 출석으로 기록했어요`); setAbsences(await listAbsences()); } catch (e) { errToast(e); }
  }
  // 요약 타일: 강사는 담당 반만 센다 (todaySummary 는 학원 전체 반을 본다)
  const todayClasses = (sum?.classesToday ?? []).filter(c => classes.some(x => x.id === c.id));
  const markedCount = todayClasses.filter(c => c.marked).length;
  const nextDay = nextClassDaysFor(classes, 1, closed)[0];
  const absRow = (a: Absence) => (
    <button key={a.id} className="rw" onClick={() => nav.push('makeup', { id: a.id })}>
      <span className="nm">{a.student_name.charAt(0)}</span>
      <span className="bd"><span className="t">{a.student_name} · {fmtMDW(a.date)}</span><span className="s">{a.reason}{a.makeup_at ? ` · 보강 ${fmtDT(a.makeup_at)}` : ''}</span></span>
      {a.status === 'requested' ? <span className="tag danger">요청</span>
        : a.attended_at ? <span className="tag muted">완료</span>
        : a.makeup_kind === 'material' ? <span className="tag ok">자료 대체</span>
        : <span className="btn sm line" role="button" onClick={e => { e.stopPropagation(); attended(a); }}>보강 왔어요</span>}
    </button>);
  const noClasses = clsReady && classes.length === 0;
  return (
    <section className="view on">
      <div className="head">
        <h1 className="hello">{fmtDateFull(today)}</h1>
        {noClasses ? <p className="lede">반을 만들면 여기에 <b>출석부</b>가 생겨요. 아래 첫걸음을 따라 해 보세요.</p> : <p className="lede">{cls ? `${cls.name} · ` : ''}{isClosed ? '오늘은 휴원일이에요. 그래도 기록할 수 있어요. 저장하면 ' : hasClassToday ? '이름을 누르면 바로 표시돼요. 저장하면 ' : '오늘은 이 반 수업이 없는 날이에요. 그래도 기록할 수 있어요. 저장하면 '}<b>결석·지각 학부모 알림까지 한 번에</b> 나갑니다.</p>}
      </div>
      <FirstSteps summary={sum} />
      {sum && clsReady && !noClasses && (todayClasses.length
        ? <div className="summary">
            <div className="st"><span className="k">오늘 수업</span><span className="v">{todayClasses.length}개<em>기록 {markedCount}/{todayClasses.length}</em></span></div>
            <button className={'st' + (sum.pendingInquiries ? ' hot' : '')} onClick={() => nav.tab('inbox')}><span className="k">답변 대기</span><span className="v">{sum.pendingInquiries}</span></button>
            <button className={'st' + (sum.pendingAbsences ? ' hot' : '')} onClick={() => absRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span className="k">결석 신청</span><span className="v">{sum.pendingAbsences}</span></button>
          </div>
        : <p className="summaryline">오늘은 수업이 없어요{nextDay ? <> · 다음 수업 <b>{fmtMDW(nextDay)}</b></> : ''}</p>)}
      {!noClasses && <>
      {classes.length > 1 && <div className="seg" style={{ marginTop: 22 }}>{classes.map(c => <button key={c.id} className={c.id === cid ? 'on' : ''} onClick={() => setCid(c.id)}>{c.name}</button>)}</div>}
      <div className="lab">출석부 · 누를 때마다 출석 → 지각 → 결석
        {rowsReady && rows.length > 0 && <button className="r" onClick={markAll}>{allPresent ? '전체 지우기' : '전원 출석'}</button>}</div>
      {!rowsReady
        ? (rowsErr ? <ErrorState onRetry={loadRows} /> : <Skeleton rows={4} />)
        : rows.length === 0
          ? <p className="muted" style={{ padding: '0 20px' }}>이 반에 학생이 없어요.</p>
          : <>
            <div className="att" role="group" aria-label="출석부">
              {rows.map(r => (
                <button key={r.student_id} className={'stu' + (r.status ? ' ' + CLS[r.status] : '')} onClick={() => tap(r.student_id)}
                  onPointerDown={() => lpDown(r.student_id)} onPointerUp={lpUp} onPointerLeave={lpUp} onPointerCancel={lpUp}
                  onContextMenu={e => e.preventDefault()}
                  aria-label={`${r.name}: ${r.status ? LABEL[r.status] : '미기록'}${r.note ? ' · ' + r.note : ''}`}>
                  <span className={'av' + pop.cls(r.student_id)} onAnimationEnd={pop.end}>{r.name.charAt(0)}</span>
                  <span className="n">{r.name}</span>
                  <span className="st">{r.status ? LABEL[r.status] : '—'}{r.note ? ' · ' + r.note : ''}</span>
                  {/* 마우스로 쓰는 사람 — 길게 누르기 대신 여기를 누른다 */}
                  <span className="more" role="button" tabIndex={-1} aria-label={`${r.name} 출결·사유 고치기`}
                    onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); openSheet(r.student_id); }}>…</span>
                </button>))}
            </div>
            <p className="sum">출석 <b className="p">{nPresent}</b> · 지각 <b className="l">{nLate}</b> · 결석 <b className="a">{nAbsent}</b> · 미기록 <b>{nNone}</b></p>
          </>}
      <div className="btnrow"><button className="btn line" onClick={() => nav.push('todos', { cid })}>이번 주 할 것 관리</button></div>
      {/* 고친 게 있을 때만 바가 올라온다 — 저장 뒤 0.9초는 "알렸어요"를 보여주고 내려간다 */}
      {((rowsReady && dirty) || busy || saved) && <BottomCta primary={{ label: '저장하고 알리기', onClick: save, busy, done: saved, doneLabel: '알렸어요' }} />}

      <div className="lab" ref={absRef}>결석 신청<span className="r">학부모가 미리 알린 것</span></div>
      {pending.length ? <div className="box">{pending.map(absRow)}</div> : <p className="muted" style={{ padding: '0 20px' }}>새 결석 신청이 없어요.</p>}
      {done.length > 0 && <><div className="lab">처리됨</div><div className="box soft">{done.slice(0, 5).map(absRow)}</div></>}
      </>}
      {sheet && sheetHost && createPortal(<div className="sheet-dim" onClick={closeSheet}>
        <div className="sheet rsheet" role="dialog" aria-modal="true" aria-label={`${sheet.name} 출결과 사유`} onClick={e => e.stopPropagation()}>
          <p className="rs-name">{sheet.name}</p>
          <p className="rs-lab">출결</p>
          <div className="seg">{SHEET_STATUS.map(o => (
            <button key={o.label} className={sheet.status === o.v ? 'on' : ''}
              onClick={() => setSheet(s => s && ({ ...s, status: o.v }))}>{o.label}</button>))}</div>
          {sheet.status && REASONS[sheet.status] && <>
            <p className="rs-lab">빠른 사유</p>
            <div className="chips-row wrap">{REASONS[sheet.status]!.map(x => (
              <button key={x} className={sheet.note.trim() === x ? 'on' : ''}
                onClick={() => setSheet(s => s && ({ ...s, note: s.note.trim() === x ? '' : x }))}>{x}</button>))}</div>
          </>}
          <p className="rs-lab">사유 (직접 적어도 돼요)</p>
          <input className="input" value={sheet.note} placeholder="예: 병원 다녀와요" maxLength={LIMITS.attendanceNote}
            onChange={e => setSheet(s => s && ({ ...s, note: e.target.value }))} />
          <Counter n={sheet.note.length} max={LIMITS.attendanceNote} />
          <div className="sa">
            <button className="btn line" onClick={closeSheet}>취소</button>
            <button className="btn" onClick={applySheet}>확인</button>
          </div>
        </div>
      </div>, sheetHost)}
    </section>
  );
}
