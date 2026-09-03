# 앱 배포 (GitHub Pages `/bright-demo/pwa/`)

앱은 정적 파일이다. 빌드 결과를 저장소의 `pwa/` 에 넣고 푸시하면 GitHub Pages(`main` 루트 서빙)가 그대로 띄운다.
주소: **https://kiddongwook.github.io/bright-demo/pwa/** (데모 `index.html` 은 그대로 루트).

## 배포
```
cd app
npm run deploy        # tsc + vite build (base=/bright-demo/pwa/) → ../pwa/ 복사, 루트 .nojekyll
cd ..
git add pwa .nojekyll && git commit -m "deploy: …" && git push
```
1~2분 뒤 주소에서 확인. 이미 열려 있던 앱은 "새 버전이 있어요" 배너 → 새로고침.

## 배포 전 로컬 확인 (Pages 와 같은 경로)
```
cd app
VITE_BASE=/bright-demo/pwa/ npx vite preview --port 4175 --strictPort
```
→ http://localhost:4175/bright-demo/pwa/ 에서 문 → 인증 → 홈. (PowerShell 은 `$env:VITE_BASE='/bright-demo/pwa/'; npx vite preview …`)

## 되돌리기
`git revert <배포 커밋>` 후 푸시. `pwa/` 는 빌드 결과라 손으로 고치지 않는다.

## 알림톡 링크 주소 (`APP_URL`)
알림톡 버튼 URL 은 `APP_URL/?l=<토큰>`. 배포 주소로 바꾸려면:
```
cd tools
node --env-file=../.env.local setup-outbox.mjs https://kiddongwook.github.io/bright-demo/pwa
```
(기존 `OUTBOX_KEY` 는 유지되고 `APP_URL` secret 만 바뀐다.) 카카오 링크 버튼 도메인 등록은 `kiddongwook.github.io` — **임시**. 도메인을 확보하면 Pages 커스텀 도메인 + `APP_URL` + 카카오 등록을 같이 바꾼다.

## Supabase 쪽
- Auth 의 Site URL / Redirect URL 은 쓰지 않는다 — 비밀번호·매직링크 `verifyOtp` 방식이라 리다이렉트가 없다.
- Edge Functions 의 CORS 는 `*` 라 주소가 바뀌어도 손댈 것 없음.
- 실 학원 프로젝트로 옮길 때: `app/.env.local` 의 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY` 만 그 프로젝트 것으로 바꾸고 다시 `npm run deploy`.

## 알아둘 것
- `pwa/` 를 커밋하면 배포마다 해시 붙은 자산이 저장소 이력에 쌓인다(회당 ~1MB). 파일럿 뒤 GitHub Actions 로 옮기면 없어진다.
- 서비스워커 scope 는 `/bright-demo/pwa/` 라 데모 페이지(루트)와 서로 건드리지 않는다.
