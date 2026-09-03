import { useEffect, useState } from 'react';
import { listNotices, listClasses, markNoticeRead } from '../../lib/api';
import { signedUrls } from '../../lib/files';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { IcCamera } from '../../components/icons';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

/* 학부모·학생 공용: 목록 + 상세(열면 읽음) */
export function NoticeFeed({ who }: { who: string }) {
  const nav = useNav();
  const { data: notices, err, reload } = useLoad(listNotices);
  const { data: classes } = useLoad(listClasses);
  const cname = (id: string | null) => id === null ? '전체' : classes?.find(c => c.id === id)?.name ?? '반';
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">공지</h1><p className="lede">전체 공지와 <b>{who}</b> 공지만 보여요.</p></div>
      {!notices ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={4} />) : (notices.length === 0 ? <div className="box"><Empty icon="notice" title="아직 공지가 없어요" hint="원장님이 공지를 올리면 여기에 바로 보여요." /></div>
        : <div className="list">{notices.map(n => (
          <button key={n.id} className={'post' + (n.read ? '' : ' new')} style={{ width: '100%', textAlign: 'left' }} onClick={() => nav.push('notice-view', { id: n.id })}>
            <div className="pt">{n.photos?.length ? <IcCamera className="ic" size={16} /> : null}{n.title}</div><div className="pm"><b>{cname(n.target_class_id)}</b><span>{fmt(n.created_at)}</span>{n.read && <span>· 읽음</span>}</div>
          </button>))}</div>)}
    </section>
  );
}

export function NoticeView() {
  const nav = useNav(); const id = nav.params.id;
  const { data: notices, err, reload } = useLoad(listNotices);
  const { data: classes } = useLoad(listClasses);
  const n = notices?.find(x => x.id === id);
  const paths = n?.photos ?? [];
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => { if (id) markNoticeRead(id).catch(() => {}); }, [id]);
  useEffect(() => {
    if (!paths.length) { setUrls([]); return; }
    let alive = true;
    signedUrls(paths).then(u => { if (alive) setUrls(u); }).catch(() => {});
    return () => { alive = false; };
  }, [paths.join('|')]);
  if (!n) return (
    <section className="view on">
      {err ? <ErrorState onRetry={reload} />
        : notices ? <div className="box" style={{ marginTop: 20 }}><Empty icon="notice" title="공지를 찾을 수 없어요" hint="지워졌거나 우리 반 공지가 아닐 수 있어요." /></div>
        : <Skeleton rows={4} />}
    </section>
  );
  const cname = n.target_class_id === null ? '전체' : classes?.find(c => c.id === n.target_class_id)?.name ?? '반';
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">{n.title}</h1><p className="lede">{cname} · {fmt(n.created_at)}</p></div>
      {n.body ? n.body.split(/\n\n+/).map((p, i) => <p key={i} className="para" style={{ whiteSpace: 'pre-wrap' }}>{p}</p>) : null}
      {urls.length > 0 && <div className="photos" style={{ marginTop: 14 }}>{urls.filter(Boolean).map(u => (
        <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" /></a>))}</div>}
      <p className="muted" style={{ padding: '20px 20px 0' }}>이 공지를 읽은 것으로 표시됐어요.</p>
    </section>
  );
}
