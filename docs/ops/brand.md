# 브랜드 — 어디까지가 BRIGHT이고 어디부터가 학원인가

**BRIGHT** 는 제품이자 운영사 이름이다. 「영어의 집」은 그 위에 올라탄 **첫 고객 학원**일 뿐이다
(slug `yeongeo-jip`, 씨앗·데모 학원은 `yeongeo`). 코드 어디에도 특정 학원 이름이 기본값으로 박혀 있으면 안 된다.

한 줄 규칙: **화면에 이름·로고·색이 나오는 자리는 전부 학원 것이고, 학원이 아직 아무것도 안 정했을 때 보이는 것만 BRIGHT다.**

---

## 1. 제품(BRIGHT)인 것 — 저장소 안의 파일

| 무엇 | 어디 |
|---|---|
| 워드마크 (밝음·어두움 두 벌) | `app/public/logo/bright-wordmark.png`, `bright-wordmark-white.png` |
| 앱 아이콘 (any / maskable) | `app/public/logo/bright-icon-192.png`, `bright-icon-512.png`, `bright-icon-maskable-512.png` |
| 푸시 배지 (안드로이드 상태 표시줄) | `app/public/logo/bright-badge.png` |
| 원본 SVG + og 원본 | `assets/brand/*.svg`, `assets/brand/og.html` (같은 PNG 사본도 여기 — 소개 페이지가 이걸 쓴다) |
| 강조색 기본값 코발트 `#2F5BEA` | `app/src/lib/manifest.ts` 의 `DEFAULT_BRAND`, `app/src/theme.css` |
| 그라데이션 코발트→바이올렛 `#2F5BEA → #6A3DF0` | 아이콘 타일, 주 버튼 |
| 소개 페이지 머리(워드마크·한 줄 설명) | 저장소 루트 `index.html` 의 `.phero` |
| 원장님 사용 설명서 | `docs/manual/BRIGHT-원장님-사용설명서.docx` (원본 `build-manual.js`) |

자산을 다시 구우려면 `assets/brand/*.svg` 를 고치고 헤드리스 크로미움으로 래스터라이즈한다
(워드마크의 글꼴은 Poppins 800 — SVG 는 글꼴 이름만 들고 있고, 구울 때 웹폰트로 붙는다).

## 2. 학원인 것 — DB·저장소에 들어 있는 값

| 무엇 | 어디 |
|---|---|
| 학원 이름 | `academies.name` |
| 강조색 | `academies.brand_color` |
| 로고 | `logos` 버킷 `<academy_id>/logo.png` + `academies.logo_path` |
| 주소의 학원 | `?a=<slug>` → `academies.slug` |

로그인 전에는 `public_academy(slug)` RPC 한 방으로 이 셋(`name`·`brand_color`·`logo_path`)을 가져온다.
로그인 뒤에는 `academy()` 가 최종본이다 — `?a=` 나 기기에 남은 slug 는 낡을 수 있어서, 로그인 뒤 값이 설치 정체성을 덮어쓴다.

## 3. 기본값(BRIGHT)이 실제로 들어가는 자리

학원이 로고를 안 올렸을 때만 나온다. 로고가 있으면 전부 학원 것으로 바뀐다.

| 자리 | 파일 | 로고 없을 때 | 로고 있을 때 |
|---|---|---|---|
| 문·인증·링크·초대 화면 로고 | `screens/{Gate,Otp,LinkEntry,InviteEntry}.tsx` | BRIGHT 워드마크(어두우면 흰 판) | 학원 로고 |
| 앱바 | `App.tsx` | BRIGHT 워드마크 | 학원 이름 텍스트 |
| PC 좌측 내비 머리 | `components/SideNav.tsx` | BRIGHT 워드마크 | 학원 이름 텍스트 |
| 홈 화면 설치 미리보기 | `screens/shared/Install.tsx`, `screens/director/More.tsx` | BRIGHT 아이콘 타일 | 학원 로고 |
| 홈 화면 아이콘(매니페스트) | `lib/manifest.ts` `buildManifest` | `bright-icon-192/512` + `maskable-512` | 학원 로고 한 장(`any maskable`) |
| iOS `apple-touch-icon` | `lib/manifest.ts` `appleTouchIcon` | `bright-icon-192.png` | 학원 로고(PNG 일 때만) |
| 첫 페인트용 정적 매니페스트·제목 | `app/vite.config.ts`, `app/index.html` | 이름·짧은 이름 모두 `BRIGHT` | (곧바로 `applyInstallIdentity` 가 갈아 끼운다) |
| 푸시 알림 아이콘·배지 | `app/public/push-sw.js` | `bright-icon-192.png` / `bright-badge.png` | (서비스워커는 학원을 모른다 — 늘 BRIGHT) |
| 학원 이름을 아직 모를 때의 문구 | `screens/Gate.tsx` 등, `lib/academy.ts` | `이 학원` | 학원 이름 |
| 소개 페이지 데모 안의 학원 | 루트 `index.html` | `예시 학원` | `?a=<slug>` 의 학원 이름·로고 |

**어두운 화면 주의.** BRIGHT 워드마크는 밝음·어두움 두 벌이 있지만 **학원이 올린 로고는 한 장뿐**이다.
그래서 앱바는 로고가 있으면 그림 대신 학원 이름 텍스트를 쓰고, 문 화면은 그 한 장을 그대로 쓴다 —
학원 로고는 **불투명 배경(대개 흰색)의 정사각 PNG** 여야 어두운 화면에서도 살아남는다.

## 4. 학원에 로고를 주는 법

원장님이 직접: **더보기 → 우리 학원 → 로고**. 앱이 가운데 정사각으로 잘라 512×512 PNG 로 줄여 올린다(`lib/logo.ts`).

운영자가 대신:

```
cd tools
node --env-file=../.env.local set-academy-logo.mjs <slug> <png 경로>
```

- `logos` 버킷 `<academy_id>/logo.png` 에 덮어쓰고 `academies.logo_path` 를 채운 뒤, `public_academy(slug)` 결과를 찍어 준다.
- 넣는 그림은 **512×512 정사각·불투명 PNG**. 가로로 긴 워드마크를 그냥 넣으면 앱이 세 자리에서 다르게 자른다
  (문 로고 / 홈 화면 아이콘 `any maskable` / 설치 미리보기 `objectFit:cover`).
  가로 로고밖에 없으면 흰 정사각 판에 여백을 주고 앉혀서 올린다 — `assets/logo/yeongeo-jip-square-512.png` 가 그 예다.
- 버킷 한도는 1MB, `image/png`·`image/jpeg` 만 받는다.
- **설치 안내를 보내기 전에 심는다.** 홈 화면 아이콘은 설치 시점의 매니페스트로 굳어서, 뒤에 로고를 바꿔도 이미 깔린 앱은 안 바뀐다.
- 같은 경로를 덮어썼으므로 CDN 이 옛 그림을 한동안(최대 1시간) 더 줄 수 있다.

## 5. 새 학원을 받을 때 확인할 것

1. `new-academy.mjs` 로 개설 → 이름·강조색이 들어갔는지.
2. `set-academy-logo.mjs` 로 로고 심기(없으면 BRIGHT 기본값으로 뜬다 — 그것도 정상이다).
3. `?a=<slug>` 로 소개 페이지와 앱을 열어 이름·색·로고 셋이 다 그 학원 것인지 눈으로 본다.
4. 어두운 화면(폰 다크 모드)에서도 로고가 보이는지 — 안 보이면 흰 배경 정사각으로 다시 만든다.

## 6. 아직 「영어의 집」이 남아 있는 곳 (남아 있어야 정상인 곳)

- DB: `academies` 두 행(`yeongeo`, `yeongeo-jip`)의 이름과 `logos` 버킷의 그 두 파일 — 고객 데이터다.
- `assets/logo/yeongeo-jip*.png` — 그 학원 로고 원본. 저장소에 남기지만 **코드에서 참조하지 않는다**.
- `app/public/logo/yeongeo-jip-*.png` — 옛 기본값. 지금은 아무도 안 쓴다(다음 정리 때 지운다).
- `docs/superpowers/**` — 지나간 설계·계획 문서. 그때의 기록이라 그대로 둔다.
- `tools/seed-demo.mjs`, `tools/*-test.mjs` 의 `@auth.yeongeo.local` 이메일 규칙 — 씨앗·시험 데이터다.
