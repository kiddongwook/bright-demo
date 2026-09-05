import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// base: 로컬은 '/', GitHub Pages 배포는 '/bright-demo/pwa/' (deploy.mjs 가 VITE_BASE 로 넘긴다). 자산 경로는 asset() 헬퍼가 따라간다.
const base = process.env.VITE_BASE ?? '/';
export default defineConfig({
  base,
  // 빌드 시각 — 진단 화면의 "앱 버전", 오류 보고의 version. '2026-09-03 16:10'
  define: { __BUILD__: JSON.stringify(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')) },
  // registerType 'prompt': 새 번들이 준비되면 배너로 알리고 사용자가 새로고침한다 (autoUpdate 는 첫 새로고침에 옛 번들을 줬다)
  // workbox.importScripts: public/push-sw.js 를 생성된 sw.js 가 불러온다 — 푸시·알림 클릭 처리는 그 파일에 있다.
  // 프리캐시 목록에도 그대로 둔다: 그 파일의 해시가 sw.js 안에 들어가서, 푸시 코드만 고쳐도 서비스워커가 새로 깔린다.
  plugins: [react(), VitePWA({ registerType: 'prompt', workbox: { navigateFallbackDenylist: [/^\/functions\//], importScripts: ['push-sw.js'] }, manifest: { name: 'BRIGHT', short_name: 'BRIGHT', lang: 'ko', display: 'standalone', start_url: '.', scope: '.', background_color: '#FFFFFF', theme_color: '#2F5BEA', icons: [{ src: 'logo/bright-icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'logo/bright-icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'logo/bright-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] } })],
  test: { environment: 'node' }
});
