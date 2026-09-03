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
