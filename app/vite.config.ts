import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({ registerType: 'autoUpdate', manifest: { name: '영어의 집', short_name: '영어의 집', lang: 'ko', display: 'standalone', background_color: '#FFFFFF', theme_color: '#2B5BD9', icons: [{ src: '/logo/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/logo/icon-512.png', sizes: '512x512', type: 'image/png' }] } })],
  test: { environment: 'node' }
});
