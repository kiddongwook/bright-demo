import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// base: 로컬은 '/', GitHub Pages 배포는 '/bright-demo/pwa/' (deploy.mjs 가 VITE_BASE 로 넘긴다). 자산 경로는 asset() 헬퍼가 따라간다.
const base = process.env.VITE_BASE ?? '/';
export default defineConfig({
  base,
  // registerType 'prompt': 새 번들이 준비되면 배너로 알리고 사용자가 새로고침한다 (autoUpdate 는 첫 새로고침에 옛 번들을 줬다)
  plugins: [react(), VitePWA({ registerType: 'prompt', workbox: { navigateFallbackDenylist: [/^\/functions\//] }, manifest: { name: '영어의 집', short_name: '영어의 집', lang: 'ko', display: 'standalone', start_url: '.', scope: '.', background_color: '#FFFFFF', theme_color: '#2B5BD9', icons: [{ src: 'logo/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'logo/icon-512.png', sizes: '512x512', type: 'image/png' }] } })],
  test: { environment: 'node' }
});
