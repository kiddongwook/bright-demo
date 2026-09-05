import { describe, it, expect } from 'vitest';
import { buildManifest, appleTouchIcon, isPng, manifestHref, type IdentityInput } from './manifest';

const BASE: IdentityInput = {
  name: '햇살 영어', brandColor: '#0FA37F', logoUrl: null,
  slug: 'haetsal', base: '/bright-demo/pwa/', origin: 'https://kiddongwook.github.io',
};
const LOGO = 'https://wq.supabase.co/storage/v1/object/public/logos/abc/logo.png';

describe('buildManifest', () => {
  it('로고가 없으면 BRIGHT 기본 아이콘 세 장(any 두 장 + maskable 한 장)을 쓴다', () => {
    const m = buildManifest(BASE);
    expect(m.icons.map(i => i.src)).toEqual([
      'https://kiddongwook.github.io/bright-demo/pwa/logo/bright-icon-192.png',
      'https://kiddongwook.github.io/bright-demo/pwa/logo/bright-icon-512.png',
      'https://kiddongwook.github.io/bright-demo/pwa/logo/bright-icon-maskable-512.png',
    ]);
    expect(m.icons.map(i => i.purpose)).toEqual([undefined, undefined, 'maskable']);
  });
  it('로고가 있으면 로고만 쓴다 — 기본 아이콘을 maskable 로 섞으면 안드로이드가 그걸 고른다', () => {
    const m = buildManifest({ ...BASE, logoUrl: LOGO });
    expect(m.icons).toEqual([
      { src: LOGO, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: LOGO, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ]);
  });
  it('주소는 전부 절대다 — data: 매니페스트에서 상대 경로는 깨진다', () => {
    const m = buildManifest(BASE);
    for (const u of [m.id, m.start_url, m.scope, ...m.icons.map(i => i.src)]) expect(u.startsWith('https://')).toBe(true);
  });
  it('start_url·scope·id 는 학원을 물고 간다', () => {
    const m = buildManifest(BASE);
    expect(m.scope).toBe('https://kiddongwook.github.io/bright-demo/pwa/');
    expect(m.start_url).toBe('https://kiddongwook.github.io/bright-demo/pwa/?a=haetsal');
    expect(m.id).toBe(m.start_url);
    expect(m.display).toBe('standalone');
  });
  it('base 가 로컬 개발의 / 여도 슬래시가 한 번만 붙는다', () => {
    const m = buildManifest({ ...BASE, base: '/', origin: 'http://localhost:5173' });
    expect(m.start_url).toBe('http://localhost:5173/?a=haetsal');
    expect(m.icons[0].src).toBe('http://localhost:5173/logo/bright-icon-192.png');
  });
  it('이름·강조색을 그대로 싣고, 색이 이상하면 기본색으로 되돌린다', () => {
    expect(buildManifest(BASE).theme_color).toBe('#0FA37F');
    expect(buildManifest({ ...BASE, brandColor: 'red' }).theme_color).toBe('#2F5BEA');
    const m = buildManifest(BASE);
    expect(m.name).toBe('햇살 영어');
    expect(m.short_name).toBe('햇살 영어');
  });
  it('이름이 비면 우리 학원으로 채운다', () => {
    expect(buildManifest({ ...BASE, name: '   ' }).name).toBe('우리 학원');
  });
  it('slug 는 주소에 안전하게 실린다', () => {
    expect(buildManifest({ ...BASE, slug: 'a b' }).start_url).toContain('?a=a%20b');
  });
});

describe('appleTouchIcon', () => {
  it('PNG 로고면 그 로고, 아니면 기본 아이콘', () => {
    expect(appleTouchIcon({ ...BASE, logoUrl: LOGO })).toBe(LOGO);
    expect(appleTouchIcon({ ...BASE, logoUrl: LOGO + '?v=17' })).toBe(LOGO + '?v=17');
    expect(appleTouchIcon({ ...BASE, logoUrl: 'https://x/logo.svg' })).toBe('https://kiddongwook.github.io/bright-demo/pwa/logo/bright-icon-192.png');
    expect(appleTouchIcon(BASE)).toBe('https://kiddongwook.github.io/bright-demo/pwa/logo/bright-icon-192.png');
  });
  it('isPng 는 쿼리가 붙은 주소도 본다', () => {
    expect(isPng(LOGO)).toBe(true);
    expect(isPng(LOGO + '?v=1')).toBe(true);
    expect(isPng(null)).toBe(false);
    expect(isPng('https://x/a.pngx')).toBe(false);
  });
});

describe('manifestHref', () => {
  it('data: URL 을 되읽으면 같은 JSON 이다', () => {
    const m = buildManifest({ ...BASE, logoUrl: LOGO });
    const href = manifestHref(m);
    expect(href.startsWith('data:application/manifest+json;charset=utf-8,')).toBe(true);
    expect(JSON.parse(decodeURIComponent(href.split(',').slice(1).join(',')))).toEqual(m);
  });
  it('한글 이름과 # 이 들어가도 깨지지 않는다', () => {
    const href = manifestHref(buildManifest(BASE));
    expect(href).not.toContain('#');
    expect(JSON.parse(decodeURIComponent(href.split(',').slice(1).join(','))).name).toBe('햇살 영어');
  });
});
