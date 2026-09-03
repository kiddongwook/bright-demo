import { useEffect, useState, type ComponentType } from 'react';
import { SessionProvider, useSession } from './auth/session';
import { Gate } from './screens/Gate';
import { Otp } from './screens/Otp';
import { PickRole } from './screens/PickRole';
import { Noti } from './screens/Noti';
import { Placeholder } from './screens/Placeholder';
import { NavProvider, useNav, TABS, TABMETA, TITLE, ICON, type Role } from './lib/nav';
import { setContext, unreadCount, kstToday, fmtMDW, academy } from './lib/api';
import { SCREENS } from './screens/registry';
import './theme.css';

function Shell() {
  const { session, active, memberships, loading } = useSession();
  const [phone, setPhone] = useState<string | null>(null);
  if (loading) return null;
  if (!session) return <div className="shell"><div className="app">{phone ? <Otp phone={phone} onBack={() => setPhone(null)} /> : <Gate onSent={setPhone} />}</div></div>;
  if (!active) return <div className="shell"><div className="app">{memberships.length ? <PickRole /> : <Gate onSent={setPhone} />}</div></div>;
  setContext(active.academy_id, session.user.id);
  return <NavProvider key={active.id} role={active.role as Role}><Frame /></NavProvider>;
}

function Frame() {
  const { active } = useSession(); const nav = useNav();
  const role = active!.role as Role;
  const [badge, setBadge] = useState(0);
  const refreshBadge = () => unreadCount().then(setBadge).catch(() => {});
  useEffect(() => { refreshBadge(); }, [nav.view]);
  useEffect(() => { academy().then(a => document.documentElement.style.setProperty('--brand', a.brand_color)).catch(() => {}); }, [active!.academy_id]);
  const key = `${role}:${nav.view}`;
  const Screen: ComponentType<any> = nav.view === 'noti' ? (() => <Noti onRead={refreshBadge} />) : (SCREENS[key] ?? SCREENS[`*:${nav.view}`] ?? (() => <Placeholder name={nav.view} />));
  const title = TITLE[nav.view];
  return (
    <div className="shell"><div className="app">
      <header className="appbar">
        {nav.isTab
          ? <><img className="logo" src="/logo/yeongeo-jip-bold-white.png" alt={active!.academy_name} /><span className="ad">{fmtMDW(kstToday())}</span></>
          : <><button className="bk" onClick={nav.back} aria-label="뒤로">&lsaquo;</button><span className="an">{title?.[0] ?? ''}</span><span className="ad">{title?.[1] ?? ''}</span></>}
        {nav.view !== 'noti' && <button className="bell" onClick={() => nav.push('noti')} aria-label="알림">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
          <span className="badge">{badge ? String(badge) : ''}</span>
        </button>}
      </header>
      <Screen key={key + JSON.stringify(nav.params)} />
      <nav className="tabbar">
        {TABS[role].map(t => <a key={t} href="#" className={t === nav.tabBase ? 'on' : ''} onClick={e => { e.preventDefault(); nav.tab(t); }}><span dangerouslySetInnerHTML={{ __html: ICON[TABMETA[t][1]] }} />{TABMETA[t][0]}</a>)}
      </nav>
    </div></div>
  );
}

export default function App() { return <SessionProvider><Shell /></SessionProvider>; }
