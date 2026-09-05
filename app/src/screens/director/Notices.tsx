import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { listNotices, listClasses, updateNoticePhotos, noticeReaders, remindNotice, recipientCount, getContext, addCalendar, listCalendar, nextClassDaysFor, kstToday, kstDate } from '../../lib/api';
import { createNoticeScheduled, rescheduleNotice, deleteNotice, withSchedule, isScheduled, fmtPublishAt, toPublishAt, publishAtParts, defaultScheduleAt, scheduleProblem, sortWithScheduled, humanizeScheduleError, type ScheduledNotice } from '../../lib/noticeSchedule';
import { uploadNoticePhotos, MAX_PHOTOS } from '../../lib/files';
import { useNav } from '../../lib/nav';
import { atSheetEntry, openSheetEntry, setSheetClose } from '../../lib/nav-history';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast, humanizeError } from '../../lib/toast';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { BottomCta } from '../../components/BottomCta';
import { IcCamera } from '../../components/icons';
import { confirmSheet } from '../../components/Confirm';
import { NoticeBody } from '../shared/NoticeRead';
import { TEMPLATES, templateOf, missingField, type Fields, type FieldKey } from '../../lib/noticeTemplates';
import { withEul } from '../../lib/dates';
import { DateField } from '../../components/DateField';
import { Counter } from '../../components/Counter';
import { LIMITS } from '../../lib/limits';
import { TimeField } from '../../components/TimeField';
import { targetLabel, readPct, remindLabel } from '../../lib/recipients';
import '../notices.css';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
/** 목록 — 예약 칸(publish_at·fanned_at)까지 붙여 읽는다 */
const listWithSchedule = () => listNotices().then(withSchedule);

/* 예약 공지를 눌렀을 때 뜨는 행동 시트 — 확인 시트(.sheet-dim/.sheet)와 같은 틀에 단추만 세로로.
   고른 행동은 시트가 다 닫힌 뒤에 돈다(finish): 그 안에서 confirmSheet 를 다시 열어도 history 항목이 겹치지 않게. */
type SheetAction = { label: string; danger?: boolean; run: () => void };
function ActionSheet({ title, sub, actions, onPick, onCancel }: { title: string; sub?: string; actions: SheetAction[]; onPick: (a: SheetAction) => void; onCancel: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);   /* 포커스를 시트 안으로 — 탭이 뒤 화면으로 새지 않게. 열릴 때 한 번만 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  /* .app 안에 붙인다 — .sheet-dim 이 폰 틀만 덮고, 목록이 스크롤돼 있어도 어긋나지 않게(TimeField 와 같은 자리) */
  const host = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('.app') ?? document.body : null;
  if (!host) return null;
  return createPortal(
    <div className="sheet-dim" onClick={onCancel}>
      <div className="sheet acts" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <p className="st">{title}</p>
        {sub && <p className="sb">{sub}</p>}
        <div className="sa">
          {actions.map((a, i) => <button key={a.label} ref={i === 0 ? first : undefined} className={'btn' + (a.danger ? ' danger' : ' line')} onClick={() => onPick(a)}>{a.label}</button>)}
          <button className="btn line" onClick={onCancel}>닫기</button>
        </div>
      </div>
    </div>, host);
}

export function NoticeList() {
  const nav = useNav();
  const { data: raw, err, reload } = useLoad(listWithSchedule);
  const { data: classes } = useLoad(listClasses);
  const notices = raw ? sortWithScheduled(raw) : null;
  /* 예약 공지 행동 시트 — 열릴 때 history 항목을 하나 쌓고, 닫힘은 늘 popstate(finish) 로 끝난다 */
  const [sheetFor, setSheetFor] = useState<ScheduledNotice | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const closing = useRef(false);
  /* 시간 바꾸기 — 그 줄 아래에 날짜·시간 칸이 펼쳐진다 */
  const [editing, setEditing] = useState<string | null>(null);
  const [edDate, setEdDate] = useState(''); const [edHm, setEdHm] = useState('');
  const [busy, setBusy] = useState(false);

  function finishSheet() {
    closing.current = false; setSheetFor(null);
    const run = pending.current; pending.current = null;
    run?.();
  }
  function openSheet(n: ScheduledNotice) {
    pending.current = null; closing.current = false;
    setSheetClose(finishSheet); openSheetEntry();
    setSheetFor(n);
  }
  function closeSheet(run: (() => void) | null = null) {
    if (closing.current) return;
    pending.current = run;
    if (atSheetEntry()) { closing.current = true; history.back(); return; }   /* popstate → finishSheet */
    setSheetClose(null); finishSheet();
  }
  function actionsFor(n: ScheduledNotice): SheetAction[] {
    return [
      { label: '시간 바꾸기', run: () => { const p = publishAtParts(n.publish_at); setEdDate(p.date); setEdHm(p.hm); setEditing(n.id); } },
      { label: '지금 보내기', run: async () => {
        if (!(await confirmSheet({ title: '지금 바로 보낼까요?', body: '대상 반의 학부모와 학생에게 바로 알림이 가요.', okLabel: '지금 보내기' }))) return;
        setBusy(true);
        try { await rescheduleNotice(n.id, null); toast('공지를 올리고 알렸어요'); setEditing(null); await reload(); }
        catch (e) { toast(humanizeScheduleError(e)); }
        finally { setBusy(false); }
      } },
      { label: '삭제', danger: true, run: async () => {
        if (!(await confirmSheet({ title: '이 예약 공지를 지울까요?', body: '아직 아무에게도 나가지 않았어요. 지우면 되돌릴 수 없어요.', okLabel: '지우기', danger: true }))) return;
        setBusy(true);
        try { await deleteNotice(n.id, n.photos); toast('예약 공지를 지웠어요'); setEditing(null); await reload(); }
        catch (e) { errToast(e); }
        finally { setBusy(false); }
      } },
    ];
  }
  async function saveTime(id: string) {
    const at = toPublishAt(edDate, edHm);
    const problem = scheduleProblem(at);
    if (problem || !at) { toast(problem ?? '날짜와 시간을 골라 주세요'); return; }
    setBusy(true);
    try { await rescheduleNotice(id, at); toast(`${fmtPublishAt(at.toISOString())}에 나가요`); setEditing(null); await reload(); }
    catch (e) { toast(humanizeScheduleError(e)); }
    finally { setBusy(false); }
  }
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">공지</h1><p className="lede">올리면 대상 반의 학부모와 학생에게 <b>알림이 갑니다.</b></p></div>
      <div className="btnrow" style={{ paddingTop: 0 }}><button className="btn" onClick={() => nav.push('notice-new')}>공지 쓰기</button></div>
      <div className="lab">올린 공지<span className="r">누르면 읽은 사람</span></div>
      {!notices ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={4} />) : (notices.length === 0
        ? <div className="box"><Empty icon="notice" title="아직 공지가 없어요" hint="위 단추로 올리면 대상 반의 학부모와 학생에게 알림이 가요." /></div>
        : <div className="list">{notices.map(n => {
          const sched = isScheduled(n);
          /* Fragment — .post 가 .list 의 직계여야 한다(.post:last-child 가 마지막 줄의 금만 지운다) */
          return (
          <Fragment key={n.id}>
            <button className={'post' + (sched ? ' sched' : '')} style={{ width: '100%', textAlign: 'left' }}
              onClick={() => sched ? openSheet(n) : nav.push('readers', { id: n.id })}>
              <div className="pt">{n.photos?.length ? <IcCamera className="ic" size={16} /> : null}{n.title}</div>
              <div className="pm"><b>{targetLabel(n.class_ids, classes)}</b>
                {sched
                  ? <span className="tag">예약 · {fmtPublishAt(n.publish_at)}</span>
                  : <><span>{fmt(n.created_at)}</span><span>· {n.read_count}명 읽음</span>{n.reminded_at && <span>· 다시 알림</span>}</>}
              </div>
            </button>
            {sched && editing === n.id && (
              <div className="sched-edit">
                <span className="tf-lab">나갈 시각</span>
                <DateField value={edDate} onChange={setEdDate} min={kstToday()} label="나갈 날짜" />
                <TimeField value={edHm} onChange={setEdHm} label="나갈 시간" />
                <div className="sa">
                  <button className="btn line" disabled={busy} onClick={() => setEditing(null)}>취소</button>
                  <button className="btn" disabled={busy} onClick={() => saveTime(n.id)}>저장</button>
                </div>
              </div>)}
          </Fragment>);
        })}</div>)}
      {sheetFor && <ActionSheet title={sheetFor.title} sub={`예약 · ${fmtPublishAt(sheetFor.publish_at)}에 나가요`}
        actions={actionsFor(sheetFor)} onPick={a => closeSheet(a.run)} onCancel={() => closeSheet()} />}
    </section>
  );
}

type Photo = { file: File; url: string };

export function NoticeNew() {
  const nav = useNav();
  const { data: classes } = useLoad(listClasses);
  /* 대상 반 — 빈 배열이면 전체. 칩을 여러 개 고를 수 있다 */
  const [targets, setTargets] = useState<string[]>([]);
  const tkey = targets.join(',');
  const label = targetLabel(targets, classes);
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]); const [uploading, setUploading] = useState(false);
  const [tpl, setTpl] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({});
  /* 제목·내용을 손으로 고치면 그때부터 틀이 덮어쓰지 않는다 — 다시 채우기 링크로 되돌린다 */
  const [dirtyTitle, setDirtyTitle] = useState(false); const [dirtyBody, setDirtyBody] = useState(false);
  const [linkCal, setLinkCal] = useState(true);
  /* 보내기 — 지금 / 예약(날짜·시간, 기본 내일 08:00). 예약해도 휴원일 등은 지금 바로 달력에 들어간다(휴원은 사실이니까) */
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [sch, setSch] = useState(defaultScheduleAt);
  const schAt = when === 'later' ? toPublishAt(sch.date, sch.hm) : null;
  const t = templateOf(tpl);
  const picks = useRef<Photo[]>([]); picks.current = photos;
  /* 알림이 갈 사람 수 — 대상 반의 학생 번호 + 학부모 번호(겹치면 한 번). 원장만 읽을 수 있어서 실패하면 문구를 감춘다 */
  const { data: recipients, err: recipientsErr, loading: recipientsLoading } = useLoad(() => recipientCount(targets), [tkey]);
  /* 빠른 날짜 — 오늘 · 내일 · 대상 반의 다음 수업일 */
  const targetClasses = targets.length ? (classes ?? []).filter(c => targets.includes(c.id)) : (classes ?? []);
  const nextDay = nextClassDaysFor(targetClasses, 1)[0];
  const quickDays = [{ label: '오늘', date: kstToday() }, { label: '내일', date: kstDate(1) }, ...(nextDay ? [{ label: '다음 수업일', date: nextDay }] : [])];

  /* 칩 하나를 켜고 끈다. 하나도 안 남으면 전체로 돌아간다 */
  function toggle(id: string) {
    setTargets(targets.includes(id) ? targets.filter(x => x !== id) : [...targets, id]);
  }
  async function applyTemplate(key: string) {
    const next = templateOf(key); if (!next) return;
    const dirty = title.trim() !== '' || body.trim() !== '' || Object.values(fields).some(x => (x ?? '').trim() !== '');
    if (dirty && !(await confirmSheet({ title: '쓰던 내용을 바꿀까요?', body: '채운 칸과 제목·내용이 고른 틀로 바뀌어요.', okLabel: '바꾸기' }))) return;
    const first = next.render({});
    setTpl(key); setFields({}); setDirtyTitle(false); setDirtyBody(false); setLinkCal(true);
    setTitle(first.title); setBody(first.body);
  }
  /* 칸이 바뀔 때마다 제목·내용을 다시 짓는다 — 아직 손대지 않은 쪽만 */
  function setField(k: FieldKey, val: string) {
    const next = { ...fields, [k]: val };
    setFields(next);
    if (!t) return;
    const r = t.render(next);
    if (!dirtyTitle) setTitle(r.title);
    if (!dirtyBody) setBody(r.body);
  }
  function refill() {
    if (!t) return;
    const r = t.render(fields);
    setTitle(r.title); setBody(r.body); setDirtyTitle(false); setDirtyBody(false);
  }
  useEffect(() => () => { picks.current.forEach(p => URL.revokeObjectURL(p.url)); }, []);
  function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = '';                      /* 같은 사진을 다시 골라도 onChange 가 오게 */
    if (!chosen.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (chosen.length > room) toast(`사진은 ${MAX_PHOTOS}장까지예요`);
    if (room <= 0) return;
    setPhotos([...photos, ...chosen.slice(0, room).map(file => ({ file, url: URL.createObjectURL(file) }))]);
  }
  function dropPhoto(i: number) { URL.revokeObjectURL(photos[i].url); setPhotos(photos.filter((_, j) => j !== i)); }
  async function post() {
    if (!title.trim()) { toast('제목을 적어주세요'); return; }
    const miss = missingField(t, fields);
    if (miss) { toast(`${withEul(miss.label)} ${miss.type === 'text' ? '적어주세요' : '골라주세요'}`); return; }
    /* 예약이면 시각을 먼저 본다 — 지난 시각은 서버가 바로 뿌려 버려 "…에 나가요" 가 거짓말이 된다 */
    if (when === 'later') { const problem = scheduleProblem(schAt); if (problem) { toast(problem); return; } }
    setBusy(true);
    let noticeId: string;
    /* 공지와 대상 반(과 나갈 시각)은 한 트랜잭션에 — 반만 남고 공지가 없거나 그 반대가 되지 않게 (create_notice_v2) */
    try { noticeId = await createNoticeScheduled(title.trim(), body.trim(), targets, schAt); }
    catch (e) { toast(humanizeScheduleError(e)); setBusy(false); return; }
    const photoFail = schAt ? '공지는 예약됐지만 사진은 못 올렸어요' : '공지는 올라갔지만 사진은 못 올렸어요';
    if (photos.length) {
      setUploading(true);
      try {
        const paths = await uploadNoticePhotos(getContext().academyId, noticeId, photos.map(p => p.file));
        if (paths.length) await updateNoticePhotos(noticeId, paths);
        if (paths.length < photos.length) toast(photoFail);
      } catch { toast(photoFail); }
      setUploading(false);
    }
    /* 휴원·특강은 달력에도 넣는다 — 공지는 이미 올라갔으니 여기서 실패해도 끝은 낸다.
       대상이 여러 반이면 반마다 한 줄씩 (전체면 반 없는 한 줄) */
    let calErr = '', dupWhat = '';
    if (t?.calendar && linkCal) {
      const day = (fields['날짜'] ?? '').trim();
      const kind = t.calendar.kind;
      const what = kind === 'closed' ? '휴원일' : '특강 날짜';
      const why = (fields['사유'] ?? '').trim();
      const mk = kind === 'closed' ? (fields['보강일'] ?? '').trim() : '';
      const where: (string | null)[] = targets.length ? targets : [null];
      try {
        const already = day ? await listCalendar(day) : [];
        for (const cid of where) {
          /* 같은 날·같은 갈래·같은 반이 이미 있으면 그대로 둔다 — 덮어쓰지 않고, 그렇다고 알린다.
             전체 휴원일이 이미 있으면 반 휴원은 군더더기라 서버가 거절한다(0022 closed_by_all) — 여기서 먼저 걸러 낸다(INT-35) */
          if (day && already.some(c => c.date === day && c.kind === kind
                && ((c.class_id ?? null) === cid || (kind === 'closed' && c.class_id === null)))) { dupWhat = what; continue; }
          if (day) await addCalendar(day, kind, kind === 'closed' ? (why || '휴원') : title.trim(), cid);
        }
        for (const cid of where) if (mk) await addCalendar(mk, 'makeup', why ? `보강 · ${why}` : '보강', cid);
      } catch (e) { calErr = `공지는 ${schAt ? '예약했지만' : '올렸지만'} ${what} 등록은 실패했어요: ${humanizeError(e)}`; }
    }
    const done = schAt ? `${fmtPublishAt(schAt.toISOString())}에 나가요` : '공지를 올리고 알렸어요';
    const dupMsg = dupWhat && `${done} · ${dupWhat}${dupWhat === '휴원일' ? '은' : '는'} 이미 있어서 그대로 뒀어요`;
    toast(calErr || dupMsg || done, (calErr || dupMsg) ? { ms: 5000 } : {});
    nav.back();
  }
  return (
    <section className="view on">
      <div className="head"><p className="lede">대상을 고르고 올리면 그 반의 학부모와 학생에게 <b>알림이 갑니다.</b></p></div>
      <div className="lab first">틀 고르기<span className="r">고르면 채울 칸이 떠요</span></div>
      <div className="chips-row">{TEMPLATES.map(x => (
        <button key={x.key} className={tpl === x.key ? 'on' : ''} onClick={() => applyTemplate(x.key)}>{x.label}</button>))}</div>
      <div className="lab">대상<span className="r">반은 여러 개 고를 수 있어요</span></div>
      <div className="chips-row tgt-chips">
        <button className={'all' + (targets.length === 0 ? ' on' : '')} aria-pressed={targets.length === 0} onClick={() => setTargets([])}>전체</button>
        {classes?.map(c => (
          <button key={c.id} className={targets.includes(c.id) ? 'on' : ''} aria-pressed={targets.includes(c.id)} onClick={() => toggle(c.id)}>{c.name}</button>))}
      </div>
      <p className="tgt-pick">고른 대상 · <b>{label}</b></p>
      {t && t.fields.length > 0 && <>
        <div className="lab">{t.label} 채우기<span className="r">채우면 제목·내용이 저절로 써져요</span></div>
        <div className="tpl-fields">{t.fields.map(f => (
          <div key={f.key}>
            <span className="tf-lab">{f.label}{f.required ? '' : ' · 없으면 비워 두세요'}</span>
            {f.type === 'date'
              ? <DateField value={fields[f.key] ?? ''} onChange={v => setField(f.key, v)} min={kstToday()} quick={quickDays}
                  clearable={!f.required} placeholder={`${f.label} 고르기`} label={f.label} />
              : f.type === 'time'
                ? <TimeField value={fields[f.key] ?? ''} onChange={v => setField(f.key, v)} label={f.label} />
                : <input className="input" value={fields[f.key] ?? ''} onChange={e => setField(f.key, e.target.value)} placeholder={f.placeholder} aria-label={f.label} />}
          </div>))}</div>
        {t.calendar && <label className="tpl-link">
          <input type="checkbox" checked={linkCal} onChange={e => setLinkCal(e.target.checked)} />{t.calendar.label}</label>}
      </>}
      <div className="lab">제목</div>
      <div style={{ padding: '0 20px' }}>
        <input className="input" value={title} maxLength={LIMITS.noticeTitle} onChange={e => { setTitle(e.target.value); setDirtyTitle(true); }} placeholder="예) 7월 수업 시간 변경 안내" />
        <Counter n={title.length} max={LIMITS.noticeTitle} />
      </div>
      <div className="lab">내용</div>
      <div style={{ padding: '0 20px' }}>
        <textarea className="input" value={body} maxLength={LIMITS.noticeBody} onChange={e => { setBody(e.target.value); setDirtyBody(true); }} placeholder="본문은 앱 안에서만 보여요. 카톡에는 제목만 갑니다." />
        <Counter n={body.length} max={LIMITS.noticeBody} />
      </div>
      {t && t.fields.length > 0 && (dirtyTitle || dirtyBody) && <div className="tpl-refill"><button type="button" onClick={refill}>템플릿으로 다시 채우기</button></div>}
      <div className="lab">보내기<span className="r">{when === 'later' ? '고른 시각에 알림이 가요' : '올리는 즉시 알림이 가요'}</span></div>
      <div className="seg" role="radiogroup" aria-label="보내기">
        <button type="button" className={when === 'now' ? 'on' : ''} role="radio" aria-checked={when === 'now'} onClick={() => setWhen('now')}>지금</button>
        <button type="button" className={when === 'later' ? 'on' : ''} role="radio" aria-checked={when === 'later'} onClick={() => setWhen('later')}>예약</button>
      </div>
      {when === 'later' && <div className="sched-fields">
        <div><span className="tf-lab">나갈 날짜</span>
          <DateField value={sch.date} onChange={v => setSch({ ...sch, date: v })} min={kstToday()} label="나갈 날짜" /></div>
        <div><span className="tf-lab">나갈 시간</span>
          <TimeField value={sch.hm} onChange={v => setSch({ ...sch, hm: v })} label="나갈 시간" /></div>
        <p className="sched-note">{schAt && !scheduleProblem(schAt) ? <><b>{fmtPublishAt(schAt.toISOString())}</b>에 나가요 · 그때까지 학부모에게는 보이지 않아요</> : (scheduleProblem(schAt) ?? '')}</p>
      </div>}
      <details className="fold"><summary>미리보기 — 학부모 화면</summary>
        <div className="notice-preview">
          <NoticeBody title={title.trim() || '(제목 없음)'} meta={`${label} · ${fmt(new Date().toISOString())}`} body={body} photoUrls={photos.map(p => p.url)} />
        </div>
      </details>
      <div className="lab">사진</div>
      <div style={{ padding: '0 20px' }}>
        <label className="btn line" style={{ cursor: 'pointer' }}>사진 붙이기 (최대 {MAX_PHOTOS}장)
          <input type="file" accept="image/jpeg,image/png" multiple hidden onChange={addFiles} />
        </label>
      </div>
      {photos.length > 0 && <div className="photo-pick">{photos.map((p, i) => (
        <div key={p.url} className="ph"><img src={p.url} alt="" /><button type="button" onClick={() => dropPhoto(i)} aria-label="사진 빼기">✕</button></div>))}</div>}
      <p className="muted" style={{ padding: '8px 20px 0' }}>아이폰은 사진을 고르면 자동으로 JPEG 로 바뀌어요.</p>
      {!recipientsErr && <p className="muted" style={{ padding: '16px 20px 0', textAlign: 'center' }}><b style={{ color: 'var(--ink)', fontWeight: 600 }}>{recipients === null || recipientsLoading ? '…' : recipients}명</b>에게 {when === 'later' ? '그때 ' : ''}알림이 가요</p>}
      <BottomCta primary={{ label: uploading ? '사진 올리는 중…' : when === 'later' ? '예약하기' : '올리고 알리기', onClick: post, disabled: busy }} secondary={{ label: '취소', onClick: nav.back }} />
    </section>
  );
}

/* 읽음률 도넛 — 학부모 가운데 몇 명이 읽었나. 색은 토큰만(--brand 호, --rule 바탕). */
function ReadDonut({ read, total }: { read: number; total: number }) {
  const pct = readPct(read, total);
  const r = 34, c = 2 * Math.PI * r, on = c * (pct / 100);
  return (
    <svg className="donut" viewBox="0 0 80 80" width="80" height="80" role="img"
      aria-label={`학부모 ${total}명 가운데 ${read}명이 읽었어요. ${pct}퍼센트`}>
      <circle className="tr" cx="40" cy="40" r={r} />
      <circle className="ar" cx="40" cy="40" r={r} strokeDasharray={`${on} ${c - on}`}
        strokeLinecap={read > 0 && read < total ? 'round' : 'butt'} transform="rotate(-90 40 40)" />
      <text className="pc" x="40" y="41" textAnchor="middle" dominantBaseline="central">{pct}%</text>
    </svg>
  );
}

export function Readers() {
  const nav = useNav(); const id = nav.params.id;
  const { data: notices } = useLoad(listWithSchedule);
  const { data: classes } = useLoad(listClasses);
  const { data: readers, reload } = useLoad(() => noticeReaders(id), [id]);
  const n: ScheduledNotice | undefined = notices?.find(x => x.id === id);
  const un = readers?.filter(r => !r.read_at) ?? [], rd = readers?.filter(r => r.read_at) ?? [];
  const total = readers?.length ?? 0;
  const [busy, setBusy] = useState(false);
  /* 아직 안 나간 공지(fanned_at 없음)는 읽은 사람이 있을 수 없다(서버도 not_published 로 막는다) — 목록에서 눌러 오는 길은 없지만 뒤로가기로 올 수 있다.
     publish_at 이 아니라 fanned_at 을 본다: 시각은 지났는데 크론이 아직 안 뿌린 1분 사이에도 "0명 읽음" 이라고 하지 않게.
     훅은 모두 위에서 불렀으니 여기서 갈라도 된다. */
  if (n && n.publish_at != null && n.fanned_at == null) {
    return (
      <section className="view on">
        <div className="head"><h1 className="hello">{n.title}</h1><p className="lede">{targetLabel(n.class_ids, classes)} · 예약 · {fmtPublishAt(n.publish_at)}</p></div>
        <div className="box"><Empty icon="notice" title="아직 안 나간 공지예요" hint={`${fmtPublishAt(n.publish_at)}에 나가요. 나간 뒤에 누가 읽었는지 여기서 볼 수 있어요.`} /></div>
        <div className="btnrow"><button className="btn line" onClick={nav.back}>목록으로</button></div>
      </section>
    );
  }
  async function remind() { setBusy(true); try { const c = await remindNotice(id); toast(`안 읽은 ${c}명에게 다시 알렸어요`); await reload(); } catch (e) { errToast(e); } finally { setBusy(false); } }
  const row = (r: { user_id: string; name: string; read_at: string | null }) => (
    <div key={r.user_id} className="rw" style={{ cursor: 'default' }}><span className="nm">{r.name.charAt(0)}</span><span className="bd"><span className="t">{r.name}</span></span><span className={'tag ' + (r.read_at ? 'ok' : 'danger')}>{r.read_at ? '읽음' : '안 읽음'}</span></div>);
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">{n?.title ?? ''}</h1><p className="lede">{n ? `${targetLabel(n.class_ids, classes)} · ${fmt(n.created_at)}` : ''}</p></div>
      <div className="box donut-card">
        <ReadDonut read={rd.length} total={total} />
        <div className="dn-txt">
          <p className="dn-big">학부모 {total}명 중 <b>{rd.length}명 읽음</b></p>
          <p className="dn-sub">{total === 0 ? '알림을 받을 학부모가 아직 없어요' : un.length === 0 ? '모두 읽었어요' : `${un.length}명이 아직 안 읽었어요`}</p>
        </div>
      </div>
      {n?.body && <p className="para" style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}>{n.body}</p>}
      <div className="lab">안 읽음<span className="r">{un.length}</span></div>
      {un.length ? <div className="box">{un.map(row)}</div> : <p className="muted" style={{ padding: '0 20px' }}>모두 읽었어요.</p>}
      <div className="lab">읽음<span className="r">{rd.length}</span></div>
      {rd.length ? <div className="box soft">{rd.map(row)}</div> : <p className="muted" style={{ padding: '0 20px' }}>아직 아무도 안 읽었어요.</p>}
      <div className="btnrow">
        <button className={'btn' + (n?.reminded_at ? ' line' : '')} disabled={busy || un.length === 0} onClick={remind}>
          {remindLabel(un.length, !!n?.reminded_at)}</button>
      </div>
    </section>
  );
}
