import type { ReactNode } from 'react';
import { IlBell, IlCalendar, IlChat, IlCheck, IlList, IlNotice, IlPeople } from './icons';
import '../screens/ui.css';

/* 목록이 비었을 때 — 한 줄 .muted 대신 그림 · 제목 · 한 줄 · 할 일 하나.
   그림은 로고와 같은 결의 얇은 선 일러스트(icons.tsx 의 Il*)라 빈 화면이 차갑지 않다. */
const ICONS: Record<string, ReactNode> = {
  notice: <IlNotice />, chat: <IlChat />, check: <IlCheck />,
  people: <IlPeople />, calendar: <IlCalendar />, bell: <IlBell />, list: <IlList />,
};

/* 이름이 없으면 점선 동그라미 */
const Dot = () => (
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    className="il" strokeDasharray="4 5" aria-hidden="true">
    <path d="M24 9.6c8 0 14.4 6.5 14.3 14.5C38.2 32 31.8 38.4 24 38.4 16 38.4 9.6 32 9.6 24 9.6 16.1 16 9.7 24 9.6" />
  </svg>
);

export function Empty({ icon = 'dot', title, hint, action }: { icon?: string; title: string; hint?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="empty">
      <span className="ico big">{ICONS[icon] ?? <Dot />}</span>
      <span className="et">{title}</span>
      {hint && <span className="eh">{hint}</span>}
      {action && <button className="btn line" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
