export type Env = 'installed' | 'kakao' | 'ios' | 'android' | 'desktop';
/** 어디서 열렸나 — 설치 안내 문구가 갈린다. 설치된 앱(standalone)이 제일 먼저. */
export function detectEnv(ua: string, standalone: boolean): Env {
  if (standalone) return 'installed';
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
export const currentEnv = (): Env => detectEnv(navigator.userAgent, matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
/** 카톡 내장 브라우저는 홈 화면 추가가 안 된다 — 기본 브라우저로 넘긴다. */
export const externalOpenUrl = (current: string, env: Env) => env === 'kakao' ? 'kakaotalk://web/openExternal?url=' + encodeURIComponent(current) : null;
export type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
declare global { interface Window { __installPrompt?: InstallPrompt } }
