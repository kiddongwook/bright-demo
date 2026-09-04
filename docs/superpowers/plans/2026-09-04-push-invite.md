# 푸시 알림 + 개인 초대 링크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (1) 설치한 앱에 네이티브처럼 푸시 알림이 오고(웹 푸시, 건당 비용 없음), (2) 원장이 카톡으로 보내는 **사람별 1회용 초대 링크**로 학부모·학생·강사가 문자 없이 처음 로그인한다. 첫 원장은 운영자가 같은 링크를 만들어 보낸다.

**Architecture:** 알림은 지금의 `notifications → outbox` 파이프라인에 **채널 `push`** 를 하나 더 얹는다. 푸시 구독이 있는 사용자는 푸시로, 없으면 지금처럼 알림톡·문자. 초대는 새 표 `invite_tokens` + Edge `invite-login` (기존 `link-login` 은 "이미 사용자인 사람의 제한 세션" 이라 그대로 두고, 초대는 **사용자 생성 + 정식 세션**). 서비스워커는 vite-plugin-pwa `generateSW` 에 `importScripts` 로 푸시 핸들러 파일을 붙인다.

**Tech Stack:** 기존(Supabase Postgres/Edge Deno, Vite PWA). 웹 푸시 발송은 Deno 에서 VAPID 서명이 되는 라이브러리(`npm:web-push` 가 Deno 에서 안 되면 `jsr:@negrel/webpush`) — 에이전트가 실제로 호출해 보고 고른다.

## Global Constraints
- 비밀값(VAPID 개인키 등)은 Edge 비밀값·`.env.local` 에만. 공개키는 `VITE_VAPID_PUBLIC`. 저장소·문서에 값 금지.
- 커밋·푸시·배포는 Fable 이 한다(에이전트는 하지 않음). Edge 배포 명령은 `npx supabase functions deploy <name> --no-verify-jwt`, DB 는 `npx supabase db push`.
- 기존 회귀 스크립트(tools/*-test.mjs) 는 계속 PASS. 새 스크립트도 같은 방식(`node --env-file=../.env.local X.mjs`, 끝나면 자기 데이터 정리).
- 문구 톤(원장님·학부모·~해요) 유지.

---

### Task 1 (백엔드): 마이그레이션 · Edge · 도구 · 회귀 테스트

**Files:** Create `supabase/migrations/0013_push_invite.sql`, `supabase/functions/push-send/index.ts`(또는 `outbox-send` 확장), `supabase/functions/invite-login/index.ts`, `supabase/functions/_shared/auth.ts`(otp-verify 의 "사용자 보장 + 소속 동기화 + 세션 발급" 을 함수로 뽑아 otp-verify·invite-login 이 공유), `supabase/functions/_shared/push.ts`(페이로드 만들기 + VAPID 발송), `tools/push-test.mjs`, `tools/invite-test.mjs`; Modify `supabase/functions/otp-verify/index.ts`(공유 함수 사용, 동작 동일), `supabase/functions/outbox-send/index.ts`(채널 push 처리), `tools/new-academy.mjs`(원장 초대 링크 출력), `docs/ops/outbox.md`, `docs/ops/pilot.md`.

**계약 (클라이언트가 이 이름을 그대로 쓴다):**
- 표 `push_subscriptions(id uuid pk, user_id uuid → users, endpoint text unique, p256dh text, auth text, ua text, created_at, last_ok_at, failed_at)`. RLS: 본인 행만 select/insert/delete. 
- 표 `invite_tokens(id uuid pk, academy_id, phone text, role text, token_hash text unique, expires_at timestamptz, used_at, created_by uuid, created_at)`.
- RPC `create_invite(p_phone text) returns text` — security definer, **원장만**, 그 학원 `roster_phones` 에 있는 번호만; 7일 만료 토큰을 만들고 **원문 토큰(32 hex)** 을 돌려준다(해시만 저장). 같은 번호의 미사용 토큰은 새로 만들 때 만료 처리.
- Edge `invite-login` POST `{ token, academy }` → 토큰 검증(해시·만료·미사용) → `_shared/auth.ensureUser(admin, phone)`(otp-verify 와 같은 로직: users 행·memberships 동기화·강사 반 연결) → 정식 세션(`access_token, refresh_token, user_id, memberships`) → `used_at` 기록. 이미 쓴 토큰은 10분 안에는 다시 통한다(카톡에서 두 번 누름), 그 뒤엔 `used`. 응답 형태는 otp-verify 와 같게.
- `trg_notification_outbox` 확장: **모든** notifications 행에 대해 대상 사용자에게 `push_subscriptions` 가 하나라도 있으면 `outbox(channel='push', template_code=<종류>, params, link_view, link_ref, idempotency_key='push:'||new.id)` 를 넣는다(원장 대상 문의 접수·결석 신청 포함). 카톡 행은 지금 규칙 그대로이되, 사용자 `prefs.kakao_also` 가 `true` 가 아니고 푸시 구독이 있으면 **카톡 행을 넣지 않는다**(푸시가 대신). 
- `outbox_claim` 은 채널 무관. `outbox-send` 는 `channel='push'` 행을 `_shared/push.ts` 로 보낸다: 페이로드 `{ title: '[학원] …', body, view, ref }` — 문구는 `_shared/alimtalk.ts` TEMPLATES 를 재사용(제목 = 학원 이름, 본문 = 템플릿 첫 줄). 그 사용자의 모든 구독에 보내고, 404/410 이면 구독 삭제, 성공하면 `last_ok_at`. outbox 상태 sent/failed 규칙은 sms 와 같게(재시도 5분).
- VAPID: 비밀값 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`(mailto:). `tools/vapid-keygen.mjs` 로 만들고, `.env.local` 과 Edge 비밀값에 넣는 절차를 `docs/ops/outbox.md` 에 적는다(값은 적지 않음).
- `tools/new-academy.mjs`: 학원 생성 뒤 원장 초대 링크 `https://kiddongwook.github.io/bright-demo/pwa/?a=<slug>&i=<token>` 을 출력(운영자가 카톡으로 보냄). 토큰 생성은 서비스 키로 `invite_tokens` 에 직접.
- 테스트: `invite-test.mjs`(원장 JWT 로 `create_invite` → invite-login 200 + 세션으로 자기 소속 조회 → 두 번째 호출(10분 안) 200 → `used_at` 강제로 11분 전으로 → 401 `used`; 다른 학원 원장은 `create_invite` 실패; 명부에 없는 번호 실패), `push-test.mjs`(구독 행을 가짜 endpoint 로 넣고 공지 → outbox 에 channel push 행이 생기고 카톡 행은 안 생김(kakao_also 없음) → `kakao_also=true` 면 둘 다; 발송은 `PUSH_DRY_RUN=1` 로 어댑터가 실제 전송 없이 sent 처리). 기존 outbox-test·manage-test 등 PASS 유지.

- [ ] Step 1 마이그레이션 + RPC → Step 2 `_shared/auth.ts` 뽑기(otp-verify 회귀: otp-test PASS) → Step 3 invite-login → Step 4 push 채널(트리거·outbox-send·push.ts) → Step 5 tools/docs → Step 6 회귀 전부 PASS

---

### Task 2 (클라이언트): 알림 설정 · 서비스워커 · 초대 링크 진입 · 초대 링크 복사

**Files:** Create `app/public/push-sw.js`, `app/src/lib/push.ts`; Modify `app/vite.config.ts`(`workbox.importScripts: ['push-sw.js']`), `app/src/lib/api.ts`(`savePushSubscription`, `removePushSubscription`, `myPushSubscribed(endpoint)`, `createInvite(phone)`, `inviteLogin(token)`), `app/src/lib/link.ts`·`app/src/screens/LinkEntry.tsx`(`?i=` 처리), `app/src/auth/session.tsx`(초대 세션은 정식 세션), `app/src/screens/shared/Prefs.tsx`(이 기기로 알림 받기 스위치 + `카톡도 같이 받기` 스위치(`prefs.kakao_also`)), `app/src/screens/director/Roster.tsx`(안 들어온 사람 행에 "초대 링크 복사"), `app/src/screens/director/Roster.tsx` Teachers(강사 행에도), `app/src/lib/invite.ts`(개인 초대 문구: 학원 이름 + 링크 + "7일 안에 눌러 주세요"), `app/src/App.tsx`(알림 클릭으로 열릴 때 `?v=<view>&r=<ref>` 를 초기 화면으로).

**계약:**
- `push-sw.js`: `push` 이벤트 → `showNotification(data.title, { body, icon: 'logo/icon-192.png', badge, data: { view, ref }, tag: view+ref })`; `notificationclick` → 열린 창이 있으면 focus + postMessage `{ type: 'nav', view, ref }`, 없으면 `clients.openWindow(base + '?v=' + view + '&r=' + ref)`. 앱은 postMessage 를 받아 `nav.push` 로 이동한다.
- `lib/push.ts`: `isPushSupported()`, `permissionState()`, `subscribe()`(`Notification.requestPermission` → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC) })` → `savePushSubscription`), `unsubscribe()`. iOS 사파리 탭(설치 전) 에서는 스위치 대신 "홈 화면에 추가한 뒤 켤 수 있어요" 안내 + 설치 안내 화면 링크.
- Prefs 화면: 맨 위 카드 "이 기기로 알림 받기" 스위치(상태: 꺼짐/켜짐/브라우저에서 막음(설정에서 풀어야 함)), 그 아래 기존 카톡 항목들. 켜져 있으면 "카톡도 같이 받기" 스위치 노출(기본 꺼짐 = 푸시만).
- 초대 링크 진입: `?i=<token>` 이 있으면 Gate 대신 "초대를 확인하는 중…" → `invite-login` → 세션 저장 → 역할 선택(소속 여럿이면) → 홈. 실패(`expired`/`used`/`bad_token`)면 안내 + "전화번호로 들어가기" 로 Gate.
- 원장 명부: "아직 앱에 안 들어온 N명" 각 행의 단추를 **"초대 링크 복사"** 로(문구 + 링크를 클립보드로; 실패 시 길게 눌러 복사 안내). 기존 "초대 문구 복사"(학원 공용) 는 더보기에 그대로.
- 알림 클릭 진입 `?v=…&r=…` 는 세션이 있으면 그 화면으로 push, 없으면 Gate 뒤 그 화면.

- [ ] Step 1 push.ts + SW + vite 설정(빌드에서 `dist/push-sw.js` 와 `sw.js` 의 importScripts 확인) → Step 2 Prefs → Step 3 초대 진입 + 명부 복사 → Step 4 tsc·test·build

---

### Task 3 (Fable): 검증·배포
- [ ] DB push, VAPID 키 생성·비밀값 설정, 함수 배포, 회귀(기존 9종 + invite/push), 헤드리스로 초대 링크 흐름(원장이 링크 생성 → 새 컨텍스트에서 링크로 진입 → 학부모 홈), Prefs 화면 상태(구독 API 는 헤드리스에서 실패해도 UI 가 설명하는지), 배포 → 사용자 폰에서 푸시 허용·수신 확인 요청.

## 첫 원장 초대
운영자(지금은 Fable)가 `tools/new-academy.mjs` 로 학원을 만들면 원장 초대 링크가 출력된다. 이 링크를 카톡으로 보내면 원장은 문자 없이 들어온다. 이후 학부모·학생·강사는 원장이 명부에서 "초대 링크 복사" 로 보낸다. 운영자 화면(3단계) 이 생기면 같은 기능을 화면에서 한다.
