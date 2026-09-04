/* 학원별 설치 정체성 — 한 PWA 가 여러 학원을 서빙하므로, 홈 화면에 놓이는 이름·아이콘·색이 ?a=<slug> 에 따라 달라야 한다.
   GitHub Pages 는 정적이라 서버가 매니페스트를 만들어 줄 수 없다 → 학원을 알아낸 뒤 data: 매니페스트를 만들어 링크를 갈아 끼운다.
   빌드가 넣어 준 정적 매니페스트(영어의 집)는 첫 페인트용 대비책으로 index.html 에 그대로 둔다. */

export type ManifestIcon = { src: string; sizes: string; type: string; purpose?: string };
export type WebManifest = {
  id: string; name: string; short_name: string; lang: string;
  display: 'standalone'; start_url: string; scope: string;
  background_color: string; theme_color: string; icons: ManifestIcon[];
};
/** buildManifest 는 순수하다 — location·document 를 읽지 않고 전부 인자로 받는다(단위 시험용). */
export type IdentityInput = {
  name: string;
  brandColor: string;
  logoUrl: string | null;   // 학원이 올린 로고의 공개 URL (없으면 null)
  slug: string;
  base: string;             // import.meta.env.BASE_URL — '/' 또는 '/bright-demo/pwa/'
  origin: string;           // location.origin
};

const DEFAULT_BRAND = '#2F5BEA';
const PNG_RE = /\.png(\?|$)/i;
/** 올린 로고는 image/png 인가 — apple-touch-icon 은 PNG 여야 한다(uploadLogo 는 항상 PNG 로 저장한다). */
export const isPng = (url: string | null): boolean => !!url && PNG_RE.test(url);

/** data: 매니페스트 안의 주소는 전부 절대여야 한다 — data: 를 기준으로 한 상대 경로는 조용히 깨진다. */
function absBase(base: string, origin: string): string {
  const b = new URL(base || '/', origin).href;
  return b.endsWith('/') ? b : b + '/';
}

export function buildManifest(i: IdentityInput): WebManifest {
  const root = absBase(i.base, i.origin);
  const start = `${root}?a=${encodeURIComponent(i.slug)}`;
  // 로고가 있으면 그것만 쓴다. 기본 아이콘을 maskable 로 함께 넣으면 안드로이드가 maskable 을 우선해
  // 학원 로고 대신 기본 아이콘을 홈 화면에 놓는다 — 고치려던 바로 그 증상이다.
  const icons: ManifestIcon[] = i.logoUrl
    ? [{ src: i.logoUrl, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
       { src: i.logoUrl, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
    : [{ src: `${root}logo/icon-192.png`, sizes: '192x192', type: 'image/png' },
       { src: `${root}logo/icon-512.png`, sizes: '512x512', type: 'image/png' }];
  const name = i.name.trim() || '우리 학원';
  return {
    id: start,                 // 학원마다 다른 앱으로 센다 — 같은 기기에 두 학원을 따로 설치할 수 있다
    name, short_name: name, lang: 'ko',
    display: 'standalone', start_url: start, scope: root,
    background_color: '#FFFFFF',
    theme_color: /^#[0-9a-f]{6}$/i.test(i.brandColor) ? i.brandColor : DEFAULT_BRAND,
    icons,
  };
}

/** iOS 는 매니페스트가 아니라 페이지의 meta/link 를 읽는다 — apple-touch-icon 은 PNG 만. */
export function appleTouchIcon(i: IdentityInput): string {
  return isPng(i.logoUrl) ? i.logoUrl! : `${absBase(i.base, i.origin)}logo/icon-192.png`;
}

export const manifestHref = (m: WebManifest): string =>
  'data:application/manifest+json;charset=utf-8,' + encodeURIComponent(JSON.stringify(m));

/* ── 여기부터는 DOM 부수효과 ── */
type Applied = 'public' | 'authoritative' | null;
let applied: Applied = null;

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
  el.setAttribute('href', href);
}

/**
 * 학원이 정해지면 부른다. authoritative=true 는 로그인 뒤 academies 행에서 온 값 —
 * 뒤늦게 도착한 로그인 전 값(?a= 나 기기에 남은 slug 는 낡을 수 있다)이 이걸 덮어쓰지 않게 막는다.
 */
export function applyInstallIdentity(a: { name: string; brandColor: string; logoUrl: string | null; slug: string }, authoritative = false) {
  if (typeof document === 'undefined') return;
  if (applied === 'authoritative' && !authoritative) return;
  const i: IdentityInput = { ...a, base: import.meta.env.BASE_URL, origin: location.origin };
  const m = buildManifest(i);
  upsertLink('manifest', manifestHref(m));
  upsertLink('apple-touch-icon', appleTouchIcon(i));
  document.title = m.name;
  // 밝은 화면용 theme-color 만 바꾼다 — 어두운 화면 것은 바탕색이라 학원 색과 무관하다
  const tc = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"][media*="light"]')
    ?? document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (tc) tc.content = m.theme_color;
  let apple = document.head.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  if (!apple) { apple = document.createElement('meta'); apple.name = 'apple-mobile-web-app-title'; document.head.appendChild(apple); }
  apple.content = m.short_name;
  applied = authoritative ? 'authoritative' : 'public';
}

/** 시험용 — 모듈 상태를 되돌린다. */
export const __resetInstallIdentity = () => { applied = null; };
