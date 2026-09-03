import '../screens/ui.css';

/* 목록이 비었을 때 — 한 줄 .muted 대신 아이콘 · 제목 · 한 줄 · 할 일 하나 */
const ICONS: Record<string, string> = {
  dot: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17',
  notice: 'M5 9v6h3l6 4V5L8 9z',
  chat: 'M4 6h16v10H9l-5 4z',
  check: 'M5 12.5 10 17.5 19 7',
  people: 'M8 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 8 11M3 20c0-2.8 2.2-5 5-5s5 2.2 5 5M16 11.5a2.6 2.6 0 1 0 0-5.2M16.5 15.2c2.5.3 4.5 2.4 4.5 4.8',
  calendar: 'M5 7h14v13H5zM5 11h14M9 4v4M15 4v4',
  bell: 'M7 17V11a5 5 0 0 1 10 0v6M4.5 17h15M10 20h4',
};

export function Empty({ icon = 'dot', title, hint, action }: { icon?: string; title: string; hint?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="empty">
      <span className="ico">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={icon === 'dot' ? '3 3.5' : undefined} aria-hidden="true">
          <path d={ICONS[icon] ?? ICONS.dot} />
        </svg>
      </span>
      <span className="et">{title}</span>
      {hint && <span className="eh">{hint}</span>}
      {action && <button className="btn line" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
