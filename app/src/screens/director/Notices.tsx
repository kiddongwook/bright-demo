import { useEffect, useRef, useState } from 'react';
import { listNotices, listClasses, createNotice, updateNoticePhotos, noticeReaders, remindNotice, recipientCount, getContext, addCalendar, nextClassDaysFor, kstToday, kstDate, type Notice } from '../../lib/api';
import { uploadNoticePhotos, MAX_PHOTOS } from '../../lib/files';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast } from '../../lib/toast';
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
import { TimeField } from '../../components/TimeField';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

export function NoticeList() {
  const nav = useNav();
  const { data: notices, err, reload } = useLoad(listNotices);
  const { data: classes } = useLoad(listClasses);
  const cname = (id: string | null) => id === null ? '전체' : classes?.find(c => c.id === id)?.name ?? '반';
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">공지</h1><p className="lede">올리면 대상 반의 학부모와 학생에게 <b>알림이 갑니다.</b></p></div>
      <div className="btnrow" style={{ paddingTop: 0 }}><button className="btn" onClick={() => nav.push('notice-new')}>공지 쓰기</button></div>
      <div className="lab">올린 공지<span className="r">누르면 읽은 사람</span></div>
      {!notices ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={4} />) : (notices.length === 0
        ? <div className="box"><Empty icon="notice" title="아직 공지가 없어요" hint="위 단추로 올리면 대상 반의 학부모와 학생에게 알림이 가요." /></div>
        : <div className="list">{notices.map(n => (
          <button key={n.id} className="post" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav.push('readers', { id: n.id })}>
            <div className="pt">{n.photos?.length ? <IcCamera className="ic" size={16} /> : null}{n.title}</div>
            <div className="pm"><b>{cname(n.target_class_id)}</b><span>{fmt(n.created_at)}</span><span>· {n.read_count}명 읽음</span>{n.reminded_at && <span>· 다시 알림</span>}</div>
          </button>))}</div>)}
    </section>
  );
}

type Photo = { file: File; url: string };

export function NoticeNew() {
  const nav = useNav();
  const { data: classes } = useLoad(listClasses);
  const [target, setTarget] = useState<string | null>(null);
  const cname = target === null ? '전체' : classes?.find(c => c.id === target)?.name ?? '반';
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]); const [uploading, setUploading] = useState(false);
  const [tpl, setTpl] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({});
  /* 제목·내용을 손으로 고치면 그때부터 틀이 덮어쓰지 않는다 — 다시 채우기 링크로 되돌린다 */
  const [dirtyTitle, setDirtyTitle] = useState(false); const [dirtyBody, setDirtyBody] = useState(false);
  const [linkCal, setLinkCal] = useState(true);
  const t = templateOf(tpl);
  const picks = useRef<Photo[]>([]); picks.current = photos;
  /* 알림이 갈 사람 수 — 대상 반의 학생 번호 + 학부모 번호(겹치면 한 번). 원장만 읽을 수 있어서 실패하면 문구를 감춘다 */
  const { data: recipients, err: recipientsErr, loading: recipientsLoading } = useLoad(() => recipientCount(target), [target]);
  /* 빠른 날짜 — 오늘 · 내일 · 대상 반의 다음 수업일 */
  const nextDay = nextClassDaysFor(target ? (classes ?? []).filter(c => c.id === target) : (classes ?? []), 1)[0];
  const quickDays = [{ label: '오늘', date: kstToday() }, { label: '내일', date: kstDate(1) }, ...(nextDay ? [{ label: '다음 수업일', date: nextDay }] : [])];

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
    setBusy(true);
    let notice;
    try { notice = await createNotice(title.trim(), body.trim(), target); }
    catch (e) { errToast(e); setBusy(false); return; }
    if (photos.length) {
      setUploading(true);
      try {
        const paths = await uploadNoticePhotos(getContext().academyId, notice.id, photos.map(p => p.file));
        if (paths.length) await updateNoticePhotos(notice.id, paths);
        if (paths.length < photos.length) toast('공지는 올라갔지만 사진은 못 올렸어요');
      } catch { toast('공지는 올라갔지만 사진은 못 올렸어요'); }
      setUploading(false);
    }
    /* 휴원·특강은 달력에도 넣는다 — 공지는 이미 올라갔으니 여기서 실패해도 끝은 낸다 */
    let calErr = '';
    if (t?.calendar && linkCal) {
      const day = (fields['날짜'] ?? '').trim();
      const what = t.calendar.kind === 'closed' ? '휴원일' : '특강 날짜';
      try {
        if (t.calendar.kind === 'closed') {
          const why = (fields['사유'] ?? '').trim();
          if (day) await addCalendar(day, 'closed', why || '휴원', target);
          const mk = (fields['보강일'] ?? '').trim();
          if (mk) await addCalendar(mk, 'makeup', why ? `보강 · ${why}` : '보강', target);
        } else if (day) await addCalendar(day, 'special', title.trim(), target);
      } catch (e) { calErr = `공지는 올렸지만 ${what} 등록은 실패했어요: ${e instanceof Error ? e.message : '까닭을 알 수 없어요'}`; }
    }
    toast(calErr || '공지를 올리고 알렸어요', calErr ? { ms: 5000 } : {});
    nav.back();
  }
  return (
    <section className="view on">
      <div className="head"><p className="lede">대상을 고르고 올리면 그 반의 학부모와 학생에게 <b>알림이 갑니다.</b></p></div>
      <div className="lab first">틀 고르기<span className="r">고르면 채울 칸이 떠요</span></div>
      <div className="chips-row">{TEMPLATES.map(x => (
        <button key={x.key} className={tpl === x.key ? 'on' : ''} onClick={() => applyTemplate(x.key)}>{x.label}</button>))}</div>
      <div className="lab">대상</div>
      <div className="seg"><button className={target === null ? 'on' : ''} onClick={() => setTarget(null)}>전체</button>{classes?.map(c => <button key={c.id} className={target === c.id ? 'on' : ''} onClick={() => setTarget(c.id)}>{c.name}</button>)}</div>
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
      <div style={{ padding: '0 20px' }}><input className="input" value={title} onChange={e => { setTitle(e.target.value); setDirtyTitle(true); }} placeholder="예) 7월 수업 시간 변경 안내" /></div>
      <div className="lab">내용</div>
      <div style={{ padding: '0 20px' }}><textarea className="input" value={body} onChange={e => { setBody(e.target.value); setDirtyBody(true); }} placeholder="본문은 앱 안에서만 보여요. 카톡에는 제목만 갑니다." /></div>
      {t && t.fields.length > 0 && (dirtyTitle || dirtyBody) && <div className="tpl-refill"><button type="button" onClick={refill}>템플릿으로 다시 채우기</button></div>}
      <details className="fold"><summary>미리보기 — 학부모 화면</summary>
        <div className="notice-preview">
          <NoticeBody title={title.trim() || '(제목 없음)'} meta={`${cname} · ${fmt(new Date().toISOString())}`} body={body} photoUrls={photos.map(p => p.url)} />
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
      {!recipientsErr && <p className="muted" style={{ padding: '16px 20px 0', textAlign: 'center' }}><b style={{ color: 'var(--ink)', fontWeight: 600 }}>{recipients === null || recipientsLoading ? '…' : recipients}명</b>에게 알림이 가요</p>}
      <BottomCta primary={{ label: uploading ? '사진 올리는 중…' : '올리고 알리기', onClick: post, disabled: busy }} secondary={{ label: '취소', onClick: nav.back }} />
    </section>
  );
}

export function Readers() {
  const nav = useNav(); const id = nav.params.id;
  const { data: notices } = useLoad(listNotices);
  const { data: readers, reload } = useLoad(() => noticeReaders(id), [id]);
  const n: Notice | undefined = notices?.find(x => x.id === id);
  const un = readers?.filter(r => !r.read_at) ?? [], rd = readers?.filter(r => r.read_at) ?? [];
  const [busy, setBusy] = useState(false);
  async function remind() { setBusy(true); try { const c = await remindNotice(id); toast(`안 읽은 ${c}명에게 다시 알렸어요`); await reload(); } catch (e) { errToast(e); } finally { setBusy(false); } }
  const row = (r: { user_id: string; name: string; read_at: string | null }) => (
    <div key={r.user_id} className="rw" style={{ cursor: 'default' }}><span className="nm">{r.name.charAt(0)}</span><span className="bd"><span className="t">{r.name}</span></span><span className={'tag ' + (r.read_at ? 'ok' : 'danger')}>{r.read_at ? '읽음' : '안 읽음'}</span></div>);
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">{n?.title ?? ''}</h1><p className="lede">{n ? fmt(n.created_at) : ''} · 학부모 {readers?.length ?? 0}명 중 <b>{rd.length}명 읽음</b></p></div>
      {n?.body && <p className="para" style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}>{n.body}</p>}
      <div className="lab">안 읽음<span className="r">{un.length}</span></div>
      {un.length ? <div className="box">{un.map(row)}</div> : <p className="muted" style={{ padding: '0 20px' }}>모두 읽었어요.</p>}
      <div className="lab">읽음<span className="r">{rd.length}</span></div>
      {rd.length ? <div className="box soft">{rd.map(row)}</div> : <p className="muted" style={{ padding: '0 20px' }}>아직 아무도 안 읽었어요.</p>}
      {un.length > 0 && <div className="btnrow"><button className={'btn' + (n?.reminded_at ? ' line' : '')} disabled={busy} onClick={remind}>{n?.reminded_at ? '한 번 더 알리기' : `안 읽은 ${un.length}명에게 다시 알리기`}</button></div>}
    </section>
  );
}
