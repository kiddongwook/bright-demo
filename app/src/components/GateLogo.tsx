import { asset } from '../lib/asset';
import { logoUrl } from '../lib/logo';
import type { PublicAcademy } from '../lib/academy';

/* 문(로그인 전·동의) 화면의 로고 한 장.
   화면 밝기에 맞는 가로 로고가 있으면 그것 → 네모 로고만 있으면 앱 아이콘처럼(둥근 모서리·흰 판) → 아무것도 없으면 BRIGHT.
   어두운 화면에서 흰 배경 네모 로고가 회색 판처럼 떠 보이던 것을 막는다. */
export function GateLogo({ academy, dark, alt }: { academy: PublicAcademy | null | undefined; dark: boolean; alt: string }) {
  const wm = dark ? academy?.wordmark_dark_path : academy?.wordmark_path;
  if (wm) return <img className="gate-logo" src={logoUrl(wm)!} alt={alt} />;
  if (academy?.logo_path) return <img className="gate-logo square" src={logoUrl(academy.logo_path)!} alt={alt} />;
  return <img className="gate-logo" src={asset(dark ? 'logo/bright-wordmark-white.png' : 'logo/bright-wordmark.png')} alt={alt} />;
}
