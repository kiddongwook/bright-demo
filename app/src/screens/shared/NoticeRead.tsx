import { useEffect } from 'react';
import { listNotices, listClasses, markNoticeRead } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

/* 학부모·학생 공용: 목록 + 상세(열면 읽음) */
export function NoticeFeed({ who }: { who: string }) {
  const nav = useNav();
  const { data: notices } = useLoad(listNotices);
  const { data: classes } = useLoad(listClasses);
  const cname = (id: string | null) => id === null ? '전체' : classes?.find(c => c.id === id)?.name ?? '반';
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">공지</h1><p className="lede">전체 공지와 <b>{who}</b> 공지만 보여요.</p></div>
      {notices && (notices.length === 0 ? <p className="muted" style={{ padding: '0 20px' }}>아직 공지가 없어요.</p>
        : <div className="box">{notices.map(n => (
          <button key={n.id} className={'post' + (n.read ? '' : ' new')} style={{ width: '100%', textAlign: 'left' }} onClick={() => nav.push('notice-view', { id: n.id })}>
            <div className="pt">{n.title}</div><div className="pm"><b>{cname(n.target_class_id)}</b><span>{fmt(n.created_at)}</span>{n.read && <span>· 읽음</span>}</div>
          </button>))}</div>)}
    </section>
  );
}

export function NoticeView() {
  const nav = useNav(); const id = nav.params.id;
  const { data: notices } = useLoad(listNotices);
  const { data: classes } = useLoad(listClasses);
  const n = notices?.find(x => x.id === id);
  useEffect(() => { if (id) markNoticeRead(id).catch(() => {}); }, [id]);
  if (!n) return <section className="view on" />;
  const cname = n.target_class_id === null ? '전체' : classes?.find(c => c.id === n.target_class_id)?.name ?? '반';
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">{n.title}</h1><p className="lede">{cname} · {fmt(n.created_at)}</p></div>
      {n.body ? n.body.split(/\n\n+/).map((p, i) => <p key={i} className="para" style={{ whiteSpace: 'pre-wrap' }}>{p}</p>) : null}
      <p className="muted" style={{ padding: '20px 20px 0' }}>이 공지를 읽은 것으로 표시됐어요.</p>
    </section>
  );
}
