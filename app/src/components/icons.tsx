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


/* ── 빈 상태 일러스트 한 벌 (48px · 1.5 굵기 · currentColor) ──
   로고가 손으로 그은 결이라 여기도 선을 아주 조금씩 흔들어 놓았다(반듯한 원·직선을 쓰지 않는다).
   24px 아이콘(Ic*)과 달리 빈 화면 한가운데에서 크게 서는 그림이라 획을 얇게(1.5) 잡았다. */
function Il({ size = 48, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" className="il"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

/* 명부 — 앞뒤로 선 두 사람 */
export const IlPeople = (p: IconProps) => <Il {...p}>
  <path d="M19.4 13.3c3.8-.4 6.7 2.3 6.6 5.9-.1 3.4-2.7 6-6.1 5.9-3.4 0-6-2.6-5.9-6 0-3.1 2.2-5.5 5.4-5.8z" />
  <path d="M9.4 36.7c.4-5.4 4.6-8.9 10-8.9 5.4 0 9.5 3.4 10.1 8.7" />
  <path d="M31.2 16.5c2.9-.6 5.4 1.4 5.4 4.1 0 2.6-2.1 4.4-4.7 4.1" />
  <path d="M33.2 28.5c4.2.4 7.2 3.4 7.5 7.8" />
</Il>;
/* 공지 — 소리가 퍼지는 확성기 */
export const IlNotice = (p: IconProps) => <Il {...p}>
  <path d="M11.2 20.6h6.2l9.4-6.7c.7-.5 1.6 0 1.6.8l-.2 20.2c0 .8-.9 1.2-1.5.7l-9.2-7.2h-6.2c-.9 0-1.6-.7-1.6-1.5l.1-4.7c0-.9.6-1.6 1.4-1.6z" />
  <path d="M33.4 19.4c2.8 2.9 2.9 8.1.1 11.1" />
  <path d="M37.4 15.8c4.4 4.6 4.5 12.3.2 16.9" />
</Il>;
/* 문의 — 말풍선 하나와 점 셋 */
export const IlChat = (p: IconProps) => <Il {...p}>
  <path d="M8.8 15c0-1.7 1.3-3 3-3.1l24-.5c1.7 0 3.1 1.3 3.1 3l-.1 12.9c0 1.6-1.3 3-2.9 3l-13.7.3-6.6 5.2c-.8.6-1.9 0-1.8-1l.3-4.5c-2.3 0-3.5-1.2-3.5-3z" />
  <path d="M16.8 21.2h.02M23.6 21.1h.02M30.4 21.2h.02" strokeWidth="2.6" />
</Il>;
/* 할 것 — 집게가 달린 판과 체크 */
export const IlCheck = (p: IconProps) => <Il {...p}>
  <path d="M17.4 11.6h-3.6c-1.5 0-2.7 1.2-2.7 2.7l-.2 21.3c0 1.5 1.2 2.8 2.7 2.8l20.7-.1c1.5 0 2.7-1.2 2.7-2.7V14.2c0-1.5-1.2-2.7-2.7-2.7h-3.5" />
  <path d="M19.2 8.6h9.8c.8 0 1.4.6 1.4 1.3l-.1 2.7c0 .8-.6 1.4-1.4 1.4l-9.8.1c-.7 0-1.3-.6-1.3-1.4V10c0-.8.6-1.4 1.4-1.4z" />
  <path d="m17.2 25.4 4.5 4.6 9.6-10.3" />
</Il>;
/* 달력 — 고리 둘과 날짜 점 */
export const IlCalendar = (p: IconProps) => <Il {...p}>
  <path d="M10.6 15.8c0-1.5 1.2-2.7 2.7-2.8l21.4-.1c1.5 0 2.8 1.2 2.8 2.7l-.2 19.2c0 1.5-1.2 2.7-2.7 2.8l-21.2.1c-1.5 0-2.8-1.2-2.8-2.7z" />
  <path d="M10.8 21.4c8.9-.3 17.7-.4 26.5-.2" />
  <path d="M17.6 9.4v6.3M30.4 9.3v6.2" />
  <path d="M18 27.4h.02M24.2 27.3h.02M30.4 27.5h.02M18.2 32.6h.02M24.4 32.5h.02" strokeWidth="2.6" />
</Il>;
/* 알림 — 매달린 종 */
export const IlBell = (p: IconProps) => <Il {...p}>
  <path d="M15.4 30.8c-.3-3.6-.4-6.1-.2-7.5.4-5 4-8.7 8.8-8.8 4.8 0 8.6 3.6 8.9 8.6.1 1.4 0 3.9-.3 7.6" />
  <path d="M11.8 31h24.5c.8 0 1.4.6 1.4 1.4 0 .8-.6 1.5-1.5 1.5l-24.4.1c-.8 0-1.5-.6-1.5-1.4 0-.9.7-1.6 1.5-1.6z" />
  <path d="M20.6 35.4c.4 2 2 3.2 3.6 3.2 1.6 0 3.1-1.2 3.4-3.2" />
  <path d="M24 11.4v3.2" />
</Il>;
/* 목록 — 점이 앞에 붙은 세 줄 */
export const IlList = (p: IconProps) => <Il {...p}>
  <path d="M18.4 15.4c6.1-.2 12.1-.2 18.1 0" />
  <path d="M18.2 24.2c6.1-.2 12.2-.2 18.2 0" />
  <path d="M18.6 32.9c5.9-.2 11.8-.2 17.6 0" />
  <path d="M11.6 15.4h.02M11.4 24.2h.02M11.7 32.9h.02" strokeWidth="2.8" />
</Il>;
