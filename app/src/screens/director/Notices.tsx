import { useEffect, useRef, useState } from 'react';
import { listNotices, listClasses, createNotice, updateNoticePhotos, noticeReaders, remindNotice, getContext, type Notice } from '../../lib/api';
import { uploadNoticePhotos, MAX_PHOTOS } from '../../lib/files';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast } from '../../lib/toast';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { IcCamera } from '../../components/icons';

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
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]); const [uploading, setUploading] = useState(false);
  const picks = useRef<Photo[]>([]); picks.current = photos;
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
    toast('공지를 올리고 알렸어요');
    nav.back();
  }
  return (
    <section className="view on">
      <div className="head"><p className="lede">대상을 고르고 올리면 그 반의 학부모와 학생에게 <b>알림이 갑니다.</b></p></div>
      <div className="lab first">대상</div>
      <div className="seg"><button className={target === null ? 'on' : ''} onClick={() => setTarget(null)}>전체</button>{classes?.map(c => <button key={c.id} className={target === c.id ? 'on' : ''} onClick={() => setTarget(c.id)}>{c.name}</button>)}</div>
      <div className="lab">제목</div>
      <div style={{ padding: '0 20px' }}><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="예) 7월 수업 시간 변경 안내" /></div>
      <div className="lab">내용</div>
      <div style={{ padding: '0 20px' }}><textarea className="input" value={body} onChange={e => setBody(e.target.value)} placeholder="본문은 앱 안에서만 보여요. 카톡에는 제목만 갑니다." /></div>
      <div className="lab">사진</div>
      <div style={{ padding: '0 20px' }}>
        <label className="btn line" style={{ cursor: 'pointer' }}>사진 붙이기 (최대 {MAX_PHOTOS}장)
          <input type="file" accept="image/jpeg,image/png" multiple hidden onChange={addFiles} />
        </label>
      </div>
      {photos.length > 0 && <div className="photo-pick">{photos.map((p, i) => (
        <div key={p.url} className="ph"><img src={p.url} alt="" /><button type="button" onClick={() => dropPhoto(i)} aria-label="사진 빼기">✕</button></div>))}</div>}
      <p className="muted" style={{ padding: '8px 20px 0' }}>아이폰은 사진을 고르면 자동으로 JPEG 로 바뀌어요.</p>
      <div className="btnrow"><button className="btn line" onClick={nav.back}>취소</button><button className="btn" disabled={busy} onClick={post}>{uploading ? '사진 올리는 중…' : '올리고 알리기'}</button></div>
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
