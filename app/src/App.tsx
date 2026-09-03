import { useEffect, useState, type ComponentType } from 'react';
import { asset } from './lib/asset';
import { SessionProvider, useSession } from './auth/session';
import { Gate } from './screens/Gate';
import { Otp } from './screens/Otp';
import { PickRole } from './screens/PickRole';
import { Noti } from './screens/Noti';
import { Placeholder } from './screens/Placeholder';
import { NavProvider, useNav, TABS, TABMETA, TITLE, ICON, type Role } from './lib/nav';
import { setContext, unreadCount, kstToday, fmtMDW, academy } from './lib/api';
import { SCREENS } from './screens/registry';
import { LinkEntry, type LinkTarget } from './screens/LinkEntry';
import { takeLinkToken } from './lib/link';
import { setReportScreen } from './lib/report';
import { UpdateBanner } from './components/UpdateBanner';
import './theme.css';

// 알림톡 버튼(?l=토큰)으로 들어왔는지 — 모듈 로드 때 한 번 읽고 주소에서 지운다 (렌더 중에 history 를 만지지 않게)
const LINK_TOKEN = takeLinkToken();

function Shell() {
  const { session, active, memberships, loading, limited } = useSession();
  const [phone, setPhone] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(LINK_TOKEN);
  const [target, setTarget] = useState<LinkTarget | null>(null);
  useEffect(() => { if (active) setPhone(null); }, [active]); // 들어오면 번호 단계를 지운다 — 로그아웃 뒤 남의 인증 화면이 남지 않게
  if (loading) return null;
  if (link) return <div className="shell"><div className="app"><LinkEntry token={link} currentUserId={session && memberships.length ? session.user.id : null} onDone={t => { setLink(null); setTarget(t); }} /></div></div>;
  if (!session || !memberships.length) return <div className="shell"><div className="app">{phone ? <Otp phone={phone} onBack={() => setPhone(null)} /> : <Gate onSent={setPhone} />}</div></div>;
  if (!active) return <div className="shell"><div className="app"><PickRole /></div></div>;
  setContext(active.academy_id, session.user.id);
  const initial: { view: string; params: Record<string, string> } | undefined = target && target.academy_id === active.academy_id ? { view: target.view, params: target.ref_id ? { id: target.ref_id } : {} } : undefined;
  return <NavProvider key={active.id} role={active.role as Role} initial={initial} limited={limited}><Frame /></NavProvider>;
}

function Frame() {
  const { active, endLimited } = useSession(); const nav = useNav();
  const role = active!.role as Role;
  const [badge, setBadge] = useState(0);
  const refreshBadge = () => unreadCount().then(setBadge).catch(() => {});
  useEffect(() => { refreshBadge(); }, [nav.view]);
  useEffect(() => { setReportScreen(nav.view); }, [nav.view]);   // 오류 보고에 "어느 화면에서" 를 싣는다
  useEffect(() => { academy().then(a => { document.documentElement.style.setProperty('--brand', a.brand_color); document.title = active!.academy_name ?? a.name; }).catch(() => {}); }, [active!.academy_id]);
  const key = `${role}:${nav.view}`;
  const Screen: ComponentType<any> = nav.view === 'noti' ? (() => <Noti onRead={refreshBadge} />) : (SCREENS[key] ?? SCREENS[`*:${nav.view}`] ?? (() => <Placeholder name={nav.view} />));
  const title = TITLE[nav.view];
  return (
    <div className="shell"><div className="app">
      <UpdateBanner />
      <header className="appbar">
        {nav.isTab
          ? <><img className="logo" src={asset('logo/yeongeo-jip-bold-white.png')} alt={active!.academy_name} /><span className="ad">{fmtMDW(kstToday())}</span></>
          : <><button className="bk" onClick={nav.back} aria-label="뒤로">&lsaquo;</button><span className="an">{title?.[0] ?? ''}</span><span className="ad">{title?.[1] ?? ''}</span></>}
        {nav.view !== 'noti' && !nav.limited && <button className="bell" onClick={() => nav.push('noti')} aria-label="알림">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
          <span className="badge">{badge ? String(badge) : ''}</span>
        </button>}
      </header>
      <Screen key={key + JSON.stringify(nav.params)} />
      {nav.limited
        ? <div className="limited-bar"><span>카톡에서 열었어요</span><button onClick={() => { endLimited(); }}>전체 기능은 번호로 들어가기 ›</button></div>
        : <nav className="tabbar">
          {TABS[role].map(t => <a key={t} href="#" className={t === nav.tabBase ? 'on' : ''} onClick={e => { e.preventDefault(); nav.tab(t); }}><span dangerouslySetInnerHTML={{ __html: ICON[TABMETA[t][1]] }} />{TABMETA[t][0]}</a>)}
        </nav>}
    </div></div>
  );
}

export default function App() { return <SessionProvider><Shell /></SessionProvider>; }
