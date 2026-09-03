import { useEffect, useState } from 'react';
import { listNotifications, markAllRead, type Noti as N } from '../lib/api';
import { useNav, linkToNav, TABS, type Role } from '../lib/nav';
import { useSession } from '../auth/session';

export function Noti({ onRead }: { onRead: () => void }) {
  const nav = useNav(); const { active } = useSession();
  const [list, setList] = useState<N[] | null>(null);
  useEffect(() => { (async () => { const l = await listNotifications(); setList(l); if (l.some(n => !n.read_at)) { await markAllRead(); onRead(); } })(); }, []);
  const role = (active?.role ?? 'parent') as Role;
  function open(n: N) {
    const t = linkToNav(n.link, role); if (!t) return;
    if (TABS[role].includes(t.view)) nav.tab(t.view); else nav.replace(t.view, t.params);
  }
  return (
    <section className="view on">
      <div className="lab first" style={{ marginTop: 20 }}>최근</div>
      {list === null ? null : list.length === 0
        ? <p className="muted" style={{ padding: '0 20px' }}>아직 알림이 없어요.</p>
        : <div className="list">{list.map(n => (
            <button key={n.id} className={'post' + (n.read_at ? '' : ' new')} style={{ width: '100%', textAlign: 'left' }} onClick={() => open(n)}>
              <div className="pt">{n.title}</div><div className="pm"><span>{n.body}</span><span>· {new Date(n.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
            </button>))}</div>}
    </section>
  );
}
