import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import type { InstallPrompt } from './lib/env'
import { installErrorReporting } from './lib/report'

// 앱에서 난 오류를 서버에 남긴다 — 렌더보다 먼저 붙여야 첫 화면의 오류도 잡는다
installErrorReporting()

// Android 크롬의 설치 배너를 붙잡아 두고 "홈 화면에 추가" 화면에서 쓴다
addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__installPrompt = e as InstallPrompt; })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
