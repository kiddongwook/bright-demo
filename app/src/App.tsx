import { useEffect, useState, type ComponentType } from 'react';
import { asset } from './lib/asset';
import { useDark, useMedia, applyBrand } from './lib/theme';
import { SessionProvider, useSession } from './auth/session';
import { Gate } from './screens/Gate';
import { Otp } from './screens/Otp';
import { PickRole } from './screens/PickRole';
import { Noti } from './screens/Noti';
import { Placeholder } from './screens/Placeholder';
import { NavProvider, useNav, TABS, TABMETA, TITLE, ICON, WIDE_VIEWS, type Role } from './lib/nav';
import { setContext, unreadCount, academy, type Academy } from './lib/api';
import { logoUrl } from './lib/logo';
import { applyInstallIdentity } from './lib/manifest';
import { SCREENS } from './screens/registry';
import { LinkEntry, type LinkTarget } from './screens/LinkEntry';
import { InviteEntry } from './screens/InviteEntry';
import { takeInviteToken, takeLinkToken, takeNavParam } from './lib/link';
import { pushToNav } from './lib/push';
import { setReportScreen } from './lib/report';
import { UpdateBanner } from './components/UpdateBanner';
import { ConfirmHost } from './components/Confirm';
import { SideNav } from './components/SideNav';
import { useScrollTitle } from './lib/useScrollTitle';
import { IcBack } from './components/icons';
import './theme.css';

// 주소로 들어온 것들 — 모듈 로드 때 한 번 읽고 주소에서 지운다 (렌더 중에 history 를 만지지 않게)
const LINK_TOKEN = takeLinkToken();          // 알림톡 버튼 ?l=<토큰>
const INVITE_TOKEN = takeInviteToken();      // 개인 초대 링크 ?i=<토큰> (?a= 는 남긴다)
const PUSH_NAV = takeNavParam();             // 푸시 알림을 눌러 앱이 새로 열림 ?v=<화면>&r=<id>

function Shell() {
  const { session, active, memberships, loading, limited } = useSession();
  const [phone, setPhone] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(LINK_TOKEN);
  const [invite, setInvite] = useState<string | null>(INVITE_TOKEN);
  const [target, setTarget] = useState<LinkTarget | null>(null);
  useEffect(() => { if (active) setPhone(null); }, [active]); // 들어오면 번호 단계를 지운다 — 로그아웃 뒤 남의 인증 화면이 남지 않게
  if (loading) return null;
  if (link) return <div className="shell"><div className="app"><LinkEntry token={link} currentUserId={session && memberships.length ? session.user.id : null} onDone={t => { setLink(null); setTarget(t); }} /></div></div>;
  if (invite) return <div className="shell"><div className="app"><InviteEntry token={invite} onDone={() => setInvite(null)} onGate={() => setInvite(null)} /></div></div>;
  if (!session || !memberships.length) return <div className="shell"><div className="app">{phone ? <Otp phone={phone} onBack={() => setPhone(null)} /> : <Gate onSent={setPhone} />}</div></div>;
  if (!active) return <div className="shell"><div className="app"><PickRole /></div></div>;
  setContext(active.academy_id, session.user.id);
  // 첫 화면: 알림톡 링크가 정해 준 자리 > 푸시 알림이 정해 준 자리(?v=&r=) > 기본 탭
  const initial: { view: string; params: Record<string, string> } | undefined = target && target.academy_id === active.academy_id
    ? { view: target.view, params: target.ref_id ? { id: target.ref_id } : {} }
    : (PUSH_NAV ? pushToNav(PUSH_NAV.view, PUSH_NAV.ref, active.role as Role) ?? undefined : undefined);
  return <NavProvider key={active.id} role={active.role as Role} initial={initial} limited={limited}><Frame /></NavProvider>;
}

function Frame() {
  const { active, endLimited } = useSession(); const nav = useNav();
  const dark = useDark();   // 어두운 화면에서는 흰 로고로 — 브라우저 자동 반전에 맡기지 않는다
  const role = active!.role as Role;
  const [badge, setBadge] = useState(0);
  const [acad, setAcad] = useState<Academy | null>(null);
  const refreshBadge = () => unreadCount().then(setBadge).catch(() => {});
  useEffect(() => { refreshBadge(); }, [nav.view]);
  useEffect(() => { setReportScreen(nav.view); }, [nav.view]);   // 오류 보고에 "어느 화면에서" 를 싣는다
  // 앱이 열려 있을 때 푸시 알림을 누르면 서비스워커가 { type:'nav', view, ref } 를 보낸다 → 그 화면으로 민다.
  // startMessages 없이 addEventListener 만 걸면 브라우저가 메시지를 계속 쟁여 두고 안 준다.
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const h = (e: MessageEvent) => {
      const d = e.data as { type?: string; view?: string; ref?: string } | null;
      if (!d || d.type !== 'nav' || !d.view) return;
      const t = pushToNav(d.view, d.ref || null, role);
      if (t) nav.push(t.view, t.params);
    };
    sw.addEventListener('message', h);
    sw.startMessages();
    return () => sw.removeEventListener('message', h);
  }, [role]);
  // 관리 화면은 넓은 화면에서 대시보드로 펼친다
  useEffect(() => { document.body.classList.toggle('wide', WIDE_VIEWS.has(nav.view)); return () => document.body.classList.remove('wide'); }, [nav.view]);
  // PC 관리 모드: 폭 1024px 이상 + 원장·강사 → 폰 틀을 벗고 좌측 내비. 학부모·학생은 PC 에서도 폰 틀 그대로.
  const pc = useMedia('(min-width:1024px)') && (role === 'director' || role === 'teacher') && !nav.limited;
  useEffect(() => { document.body.classList.toggle('pc', pc); return () => document.body.classList.remove('pc'); }, [pc]);
  // 밀고 들어간 화면(공지 쓰기·학생 편집…)에는 탭바를 그리지 않는다 — 돌아가는 길은 앱바의 뒤로 꺾쇠.
  // 제한 세션은 자리에 .limited-bar 가 그대로 남으므로 여백을 줄이지 않는다.
  const noTab = !nav.isTab && !nav.limited;
  useEffect(() => { document.body.classList.toggle('no-tab', noTab); return () => document.body.classList.remove('no-tab'); }, [noTab]);
  useEffect(() => { window.scrollTo(0, 0); }, [nav.view]);   // 화면이 바뀌면 맨 위부터
  // 로그인 뒤의 학원 값이 최종본이다 — 설치 정체성(이름·아이콘·색)도 여기 값으로 굳힌다(?a= 나 기기에 남은 slug 는 낡을 수 있다)
  useEffect(() => { academy().then(a => { setAcad(a); applyBrand(a.brand_color); document.title = active!.academy_name ?? a.name; applyInstallIdentity({ name: active!.academy_name ?? a.name, brandColor: a.brand_color, logoUrl: logoUrl(a.logo_path), slug: a.slug }, true); }).catch(() => {}); }, [active!.academy_id]);
  const key = `${role}:${nav.view}`;
  // 큰 제목이 위로 지나가면 앱바에 작은 제목을 띄운다 (탭 루트에서만 — 진입 화면 앱바는 이미 제목이다)
  const { title: scrollTitle, scrolled } = useScrollTitle(key + JSON.stringify(nav.params));
  const showScrollTitle = nav.isTab && scrolled && !!scrollTitle;
  const Screen: ComponentType<any> = nav.view === 'noti' ? (() => <Noti onRead={refreshBadge} />) : (SCREENS[key] ?? SCREENS[`*:${nav.view}`] ?? (() => <Placeholder name={nav.view} />));
  const title = TITLE[nav.view];
  // 학원이 올린 로고가 있으면 앱바는 학원 이름 텍스트로 대신한다 — 올린 로고의 배경·비율을 앱바가 보장할 수 없어서.
  const logoSrc = acad?.logo_path ? logoUrl(acad.logo_path) : null;
  return (
    <div className="shell"><div className="app framed">
      <UpdateBanner />
      <ConfirmHost />
      {pc && <SideNav role={role} academyName={active!.academy_name ?? ''} logoSrc={logoSrc} dark={dark} />}
      <header className={'appbar' + (showScrollTitle ? ' scrolled' : '')}>
        {nav.isTab
          ? <>
            {logoSrc ? <span className="an">{active!.academy_name}</span> : <img className="logo" src={asset(dark ? 'logo/yeongeo-jip-bold-white.png' : 'logo/yeongeo-jip-bold.png')} alt={active!.academy_name} />}
            <span className={'sct' + (showScrollTitle ? ' on' : '')} aria-hidden={!showScrollTitle}>{scrollTitle}</span>
          </>
          : <><button className="bk" onClick={nav.back} aria-label="뒤로"><IcBack /></button><span className="an">{title?.[0] ?? ''}</span><span className="ad">{title?.[1] ?? ''}</span></>}
        {/* 종은 탭 루트에서만 — 진입 화면 앱바는 뒤로·제목 자리다 (noti 는 탭이 아니라 nav.isTab 이 이미 거른다) */}
        {nav.isTab && !nav.limited && <button className="bell" onClick={() => nav.push('noti')} aria-label="알림">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
          <span className="badge">{badge ? String(badge) : ''}</span>
        </button>}
      </header>
      <Screen key={key + JSON.stringify(nav.params)} />
      {nav.limited
        ? <div className="limited-bar"><span>카톡에서 열었어요</span><button onClick={() => { endLimited(); }}>전체 기능은 번호로 들어가기 ›</button></div>
        : nav.isTab && <nav className="tabbar">
          {TABS[role].map(t => <a key={t} href="#" className={t === nav.tabBase ? 'on' : ''} onClick={e => { e.preventDefault(); nav.tab(t); }}><span dangerouslySetInnerHTML={{ __html: ICON[TABMETA[t][1]] }} />{TABMETA[t][0]}</a>)}
        </nav>}
    </div></div>
  );
}

export default function App() { return <SessionProvider><Shell /></SessionProvider>; }
