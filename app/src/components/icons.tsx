import type { ReactNode, SVGProps } from 'react';

/* 앱 아이콘 한 벌 — 24px · currentColor · 1.75 굵기 · 둥근 끝.
   색은 쓰는 자리에서 정한다(글자색을 따라간다). 이모지 대신 이걸 쓴다. */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function Ic({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IcBack = (p: IconProps) => <Ic {...p}><path d="M14.5 5 7.5 12l7 7" /></Ic>;
export const IcBell = (p: IconProps) => <Ic {...p}><path d="M7 17V11a5 5 0 0 1 10 0v6M4.5 17h15M10 20h4" /></Ic>;
export const IcCamera = (p: IconProps) => <Ic {...p}><path d="M4 8.5h3.6L9 6.3h6l1.4 2.2H20v11H4z" /><path d="M12 16.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6" /></Ic>;
export const IcCheck = (p: IconProps) => <Ic {...p}><path d="M5 12.5 10 17.5 19 7" /></Ic>;
export const IcPlus = (p: IconProps) => <Ic {...p}><path d="M12 5v14M5 12h14" /></Ic>;
export const IcDownload = (p: IconProps) => <Ic {...p}><path d="M12 4v10.5M8 11l4 4 4-4M5 19.5h14" /></Ic>;
export const IcCopy = (p: IconProps) => <Ic {...p}><path d="M9 8.5h10.5V20H9z" /><path d="M15.5 8.5V4H4.5v11.5H9" /></Ic>;
export const IcWarn = (p: IconProps) => <Ic {...p}><path d="M12 4.6 20.8 19.4H3.2z" /><path d="M12 10.2v4.1M12 17.1h.01" /></Ic>;
export const IcCalendar = (p: IconProps) => <Ic {...p}><path d="M5 7h14v13H5zM5 11h14M9 4v4M15 4v4" /></Ic>;
export const IcNotice = (p: IconProps) => <Ic {...p}><path d="M5 9v6h3l6 4V5L8 9z" /><path d="M17.5 9.5a3.6 3.6 0 0 1 0 5" /></Ic>;
export const IcChat = (p: IconProps) => <Ic {...p}><path d="M4 6h16v10H9l-5 4z" /></Ic>;
export const IcHouse = (p: IconProps) => <Ic {...p}><path d="M3.8 11.2 12 4.5l8.2 6.7" /><path d="M6.4 9.6V19.5h11.2V9.6" /></Ic>;
export const IcList = (p: IconProps) => <Ic {...p}><path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" /></Ic>;
export const IcPeople = (p: IconProps) => <Ic {...p}><path d="M8 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 8 11M3 20c0-2.8 2.2-5 5-5s5 2.2 5 5M16 11.5a2.6 2.6 0 1 0 0-5.2M16.5 15.2c2.5.3 4.5 2.4 4.5 4.8" /></Ic>;
export const IcClose = (p: IconProps) => <Ic {...p}><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" /></Ic>;
/* PC 좌측 내비용 — 반·시간표 / 출결표 / 강사 */
export const IcClock = (p: IconProps) => <Ic {...p}><path d="M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4" /><path d="M12 7.6V12l3 1.8" /></Ic>;
export const IcTable = (p: IconProps) => <Ic {...p}><path d="M4 5.5h16v13H4z" /><path d="M4 10h16M4 14.2h16M10 10v8.5" /></Ic>;
export const IcPerson = (p: IconProps) => <Ic {...p}><path d="M12 11.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8" /><path d="M5 20c0-3.2 3.1-5.4 7-5.4s7 2.2 7 5.4" /></Ic>;

/* 실무 및 화면 디테일 강화 아이콘 한 벌 */
export const IcPhone = (p: IconProps) => <Ic {...p}><path d="M6.5 4h3l1.5 3.5-2 1.8a12.5 12.5 0 0 0 5.7 5.7l1.8-2 3.5 1.5v3c0 1.1-.9 2-2 2A15 15 0 0 1 4.5 6c0-1.1.9-2 2-2" /></Ic>;
export const IcShareIos = (p: IconProps) => <Ic {...p}><path d="M12 3.5v10.5M8 7.5l4-4 4 4M5 10.5v8A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-8" /></Ic>;
export const IcMoreVertical = (p: IconProps) => <Ic {...p}><circle cx="12" cy="5" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="19" r="1.3" fill="currentColor" /></Ic>;
export const IcBook = (p: IconProps) => <Ic {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H12v-13H6.5A2.5 2.5 0 0 0 4 6.5zM20 19.5A2.5 2.5 0 0 0 17.5 17H12v-13h5.5A2.5 2.5 0 0 1 20 6.5z" /></Ic>;
export const IcTarget = (p: IconProps) => <Ic {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></Ic>;
export const IcNote = (p: IconProps) => <Ic {...p}><path d="M16 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V8z" /><path d="M15 4v4h4M8 12h8M8 16h5" /></Ic>;
export const IcPalette = (p: IconProps) => <Ic {...p}><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5c0-1.4-1.1-2.5-2.5-2.5h-1.5a2 2 0 0 1-2-2V6a2.5 2.5 0 0 0-2.5-2.5z" /><circle cx="7.5" cy="10.5" r="1" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1" fill="currentColor" /><circle cx="14.5" cy="7.5" r="1" fill="currentColor" /></Ic>;
export const IcHelp = (p: IconProps) => <Ic {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.2c0 1.3-1.8 1.8-1.8 3M12 17.2h.01" /></Ic>;
export const IcReceipt = (p: IconProps) => <Ic {...p}><path d="M5 4h14v16.5l-2.5-1.5-2.2 1.5-2.3-1.5-2.3 1.5-2.2-1.5L5 20.5z" /><path d="M8 8.5h8M8 12.5h8M8 16h5" /></Ic>;
export const IcSparkle = (p: IconProps) => <Ic {...p}><path d="m12 3.5 2.2 5.3 5.3 2.2-5.3 2.2L12 18.5l-2.2-5.3L4.5 11l5.3-2.2zM19 18l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" /></Ic>;
export const IcMail = (p: IconProps) => <Ic {...p}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" /><path d="m5 7 7 5 7-5" /></Ic>;
export const IcTrendingUp = (p: IconProps) => <Ic {...p}><path d="M4 17l6-6 4 4 6-6" /><path d="M15 9h5v5" /></Ic>;

