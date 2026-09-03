import type { ReactNode } from 'react';
import { IcBell, IcCalendar, IcChat, IcCheck, IcList, IcNotice, IcPeople } from './icons';
import '../screens/ui.css';

/* 목록이 비었을 때 — 한 줄 .muted 대신 아이콘 · 제목 · 한 줄 · 할 일 하나 */
const ICONS: Record<string, ReactNode> = {
  notice: <IcNotice />, chat: <IcChat />, check: <IcCheck />,
  people: <IcPeople />, calendar: <IcCalendar />, bell: <IcBell />, list: <IcList />,
};

/* 이름이 없으면 점선 동그라미 */
const Dot = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    strokeDasharray="3 3.5" aria-hidden="true">
    <path d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17" />
  </svg>
);

export function Empty({ icon = 'dot', title, hint, action }: { icon?: string; title: string; hint?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="empty">
      <span className="ico">{ICONS[icon] ?? <Dot />}</span>
      <span className="et">{title}</span>
      {hint && <span className="eh">{hint}</span>}
      {action && <button className="btn line" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
