import type { ComponentType } from 'react';
import { asset } from '../lib/asset';
import { useNav, TABS, TABMETA, ICON, type Role } from '../lib/nav';
import { IcCalendar, IcClock, IcHouse, IcList, IcPeople, IcPerson, IcPlus, IcReceipt, IcTable } from './icons';
import { SCREENS } from '../screens/registry';

/* PC 관리 모드의 좌측 내비 — 폭 1024px 이상, 원장·강사만. 하단 탭바 대신 쓴다.
   더보기의 운영 줄들을 "관리" 묶음으로 펼쳐 두어, 한 번에 눌러 들어간다. */

type Item = { view: string; label: string; Icon: ComponentType<{ size?: number }> };
const MANAGE: Item[] = [
  { view: 'roster', label: '명부', Icon: IcPeople },
  { view: 'classes', label: '반·시간표', Icon: IcClock },
  { view: 'stats', label: '반별 출결표', Icon: IcTable },
  { view: 'calendar', label: '휴원일·특강', Icon: IcCalendar },
  { view: 'teachers', label: '강사', Icon: IcPerson },
  { view: 'billing', label: '수강료', Icon: IcReceipt },
  { view: 'academy', label: '우리 학원', Icon: IcHouse },
];

/* BRIGHT 운영 — 학원 소속이 아닌 화면 묶음. 탭 둘(학원 목록·운영 설정) 사이에 "학원 만들기" 를 끼워 한 줄로 편다. */
const OPERATE: (Item & { tab?: boolean })[] = [
  { view: 'op-home', label: '학원 목록', Icon: IcList, tab: true },
  { view: 'op-new', label: '학원 만들기', Icon: IcPlus },
  { view: 'op-settings', label: '운영 설정', Icon: IcHouse, tab: true },
];

export function SideNav({ role, academyName, logoSrc, dark }: { role: Role; academyName: string; logoSrc: string | null; dark: boolean }) {
  const nav = useNav();
  const go = (v: string) => { if (nav.view !== v) nav.push(v); };
  if (role === 'operator') return (
    <aside className="sidenav">
      <div className="brandrow">
        <img className="logo" src={asset(dark ? 'logo/bright-wordmark-white.png' : 'logo/bright-wordmark.png')} alt="BRIGHT" />
      </div>
      <div className="nvlab">운영</div>
      <nav className="nvgroup">
        {OPERATE.map(({ view, label, Icon, tab }) => (
          <button key={view} className={'nv' + (view === nav.view ? ' on' : '')} onClick={() => (tab ? nav.tab(view) : go(view))}>
            <span className="nvi"><Icon size={20} /></span>{label}
          </button>))}
      </nav>
      <div className="stamp">{__BUILD__}</div>
    </aside>
  );
  const items = MANAGE.filter(m => `${role}:${m.view}` in SCREENS);   // 강사에게 없는 화면(출결표·우리 학원)은 빼고 보여준다
  const inManage = items.some(m => m.view === nav.view);   // 관리 화면에서는 탭 표시를 끈다 (두 곳이 함께 켜지지 않게)
  return (
    <aside className="sidenav">
      <div className="brandrow">
        {logoSrc
          ? <span className="an">{academyName}</span>
          : <img className="logo" src={asset(dark ? 'logo/bright-wordmark-white.png' : 'logo/bright-wordmark.png')} alt={academyName} />}
      </div>
      <nav className="nvgroup">
        {TABS[role].map(t => (
          <button key={t} className={'nv' + (!inManage && t === nav.tabBase ? ' on' : '')} onClick={() => nav.tab(t)}>
            <span className="nvi" dangerouslySetInnerHTML={{ __html: ICON[TABMETA[t][1]] }} />{TABMETA[t][0]}
          </button>))}
      </nav>
      <div className="nvlab">관리</div>
      <nav className="nvgroup">
        {items.map(({ view, label, Icon }) => (
          <button key={view} className={'nv' + (view === nav.view ? ' on' : '')} onClick={() => go(view)}>
            <span className="nvi"><Icon size={20} /></span>{label}
          </button>))}
      </nav>
      <div className="stamp">{__BUILD__}</div>
    </aside>
  );
}
