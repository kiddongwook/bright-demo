# 알림 줄(outbox) 운영 — 푸시 · 카톡 · 문자

## 어떻게 도는가
알림(`notifications`) → 트리거 → `outbox`(queued) → 매분 `outbox_tick()` → Edge `outbox-send` → sent → (카톡만) 대행사 콜백 `outbox-callback` → delivered | failed → failed 면 문자 줄(sms) → 다음 틱에 발송.
발송 실패는 5분 뒤 재시도, 5회면 dead(카톡이면 문자 줄). 채널 셋 다 이 규칙이 같다.

채널이 셋이다.
- `push` — 웹 푸시. **건당 비용이 없다.** 그 사람에게 `push_subscriptions` 행이 하나라도 있으면 모든 알림이 여기로 간다(원장 대상 문의 접수·결석 신청, 학생 본인 출결도 포함).
- `alimtalk` — 카톡. 심사받은 5종만: 새 공지 · 다시 알리기 · 문의 답변 · 보강 확정 · 출결(지각·결석, 보호자).
  **푸시 구독이 있는 사람에게는 넣지 않는다** — 더보기 → 알림에서 "카톡도 같이 받기"(`users.prefs.kakao_also = true`)를 켠 사람만 둘 다 받는다.
- `sms` — 카톡이 끝내 안 갔을 때의 대체.

알림톡·문자 버튼 URL 은 `https://<앱>/?l=<토큰>` — 토큰은 발송 때 새로 나오고(해시만 저장) 7일 뒤 만료, 그 화면만 연다. 푸시는 앱이 이미 그 사람 세션으로 열려 있어 토큰을 만들지 않는다(알림을 누르면 `?v=<화면>&r=<id>` 로 연다).

## 웹 푸시

### 처음 켤 때 (한 번)
1. 키 만들기 — 값은 화면에 한 번만 나온다. 저장소·문서에 적지 않는다.
   ```
   cd tools && node vapid-keygen.mjs
   ```
2. 나온 값을 세 곳에 넣는다.
   - `.env.local` — `VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` · `VAPID_SUBJECT=mailto:<운영자 이메일>`
   - Edge 비밀값 — `npx supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:…`
   - 앱 빌드 — `app/.env` 의 `VITE_VAPID_PUBLIC=<공개키>` (공개키만 나간다)
3. 함수 배포: `npx supabase functions deploy outbox-send --no-verify-jwt`

개인키를 바꾸면 **이미 등록된 구독이 전부 무효**가 된다(모두 폰에서 다시 켜야 한다). 잃어버리면 복구할 수 없다.

### 실제로 안 보내고 시험하기
`npx supabase secrets set PUSH_DRY_RUN=1` 이면 `_shared/push.ts` 가 아무 데도 보내지 않고 성공으로 친다(`outbox` 는 sent). 개발 프로젝트·회귀 테스트용. 끄기: `npx supabase secrets unset PUSH_DRY_RUN`.
VAPID 비밀값이 없고 `PUSH_DRY_RUN` 도 아니면 push 행은 `vapid_not_configured` 로 실패한다 — 조용히 "보냈다" 고 하지 않는다.

### 구독 관리
- 브라우저가 `404`/`410` 을 주면 그 기기의 구독은 사라진 것이다 → `outbox-send` 가 `push_subscriptions` 행을 **지운다**.
- 성공하면 `last_ok_at`, 다른 오류면 `failed_at` 을 찍는다. 한 구독이라도 성공하면 그 줄은 sent.
- 구독이 하나도 없으면 `no_subscription` 으로 실패한다(그 사이 사용자가 알림을 껐다는 뜻 — 다음 알림부터는 카톡으로 간다).
- 지금 누가 켜 뒀는지: `select u.name, count(*) from push_subscriptions p join users u on u.id = p.user_id group by 1;`

### 라이브러리
`jsr:@negrel/webpush` (RFC 8291/8292). `npm:web-push` 는 `node:https` · `crypto.createECDH/createSign` 에 기대어 Supabase Edge(Deno) 에서 돌지 않는다 — `@negrel/webpush` 는 `fetch` + `SubtleCrypto` 만 쓴다.
비밀값의 키 모양은 웹 푸시 표준(base64url) 이고, `_shared/push.ts` 가 라이브러리가 받는 JWK 로 바꾼다.

### 문구
제목은 학원 이름, 본문은 알림톡 템플릿(`_shared/alimtalk.ts` TEMPLATES)의 첫 줄에서 앞머리 `[학원]` 을 뗀 것.
카톡에 안 가던 종류(`INQUIRY_NEW` 문의 접수 · `ABSENCE_REQUESTED` 결석 신청 · `ATTENDANCE_SELF` 학생 본인 출결 · `NOTIFY` 그 밖)는 심사받은 템플릿이 없으므로 트리거가 실어 준 알림 제목(`params['알림']`)을 그대로 쓴다. **이 넷을 알림톡 TEMPLATES 에 넣지 말 것** — 심사받은 문구만 거기 둔다.

## 개인 초대 링크
`invite_tokens` + Edge `invite-login`. `link_tokens`(알림톡 버튼)와 별개다 — 저쪽은 이미 사용자인 사람의 제한 세션, 이쪽은 **명부만 있는 사람에게 users 행·소속을 만들어 주는 정식 세션**(otp-verify 와 같은 `_shared/auth.ts`).
- 원장이 명부의 한 번호에 대해 `create_invite(p_phone)` → 원문 32 hex 토큰(그 자리에서 한 번만 보인다, DB 에는 해시만). 7일 만료. 같은 번호의 안 쓴 토큰은 새로 만들 때 만료된다.
- 링크: `https://<앱>/?a=<slug>&i=<token>`
- 카톡에서 두 번 누르는 일이 흔해 **이미 쓴 토큰도 10분 안에는 다시 통한다**. 그 뒤엔 `used`.
- 첫 원장 링크는 `tools/new-academy.mjs` 가 학원을 만들면서 출력한다.
- 막혔을 때: `select phone, expires_at, used_at from invite_tokens where academy_id = '<academy-id>' order by created_at desc limit 20;`

## 보는 법 (Supabase SQL 에디터)
- 지금 줄: `select status, channel, count(*) from outbox group by 1,2;` (channel 에 push 가 섞여 있으면 정상)
- 막힌 것: `select id, template_code, attempts, last_error, created_at from outbox where status in ('failed','dead') order by created_at desc limit 50;`
- 틱이 도는지: `select jobname, status, start_time from cron.job_run_details where jobname = 'outbox-tick' order by start_time desc limit 5;`
- 함수를 손으로 깨우기: `select outbox_tick();`
- 발송 로그: 대시보드 Edge Functions → outbox-send → Logs (`[ALIMTALK→번호] …` 줄은 콘솔 어댑터일 때만)

## dead 처리
번호가 틀렸거나(명부 오타) 카톡·문자 모두 안 되는 번호. 명부에서 번호를 고친 뒤
`update outbox set status = 'queued', attempts = 0, next_attempt_at = null where id = '…';` 로 다시 줄에 세운다.

## 대행사 붙이기 (계약 뒤)
1. `npx supabase secrets set ALIMTALK_PROVIDER=http ALIMTALK_HTTP_URL=… ALIMTALK_HTTP_TOKEN=… ALIMTALK_SENDER_KEY=…`
2. `supabase/functions/_shared/alimtalk.ts` 의 `http` 분기: 요청 본문·응답의 `messageId` 를 대행사 문서에 맞춘다. 문구·버튼 이름은 심사받은 것 그대로.
3. 대행사 콜백 URL 로 `https://<ref>.supabase.co/functions/v1/outbox-callback?key=<OUTBOX_KEY>` 등록(헤더 `X-Outbox-Key` 를 붙일 수 있으면 헤더로). 대행사 본문 → `{provider_msg_id, status: delivered|failed, reason}` 변환은 `outbox-callback/index.ts` 의 `parse()` 한 곳.
4. 문자 대체는 `SMS_PROVIDER=http` 로 같은 대행사(`_shared/sms.ts`).
5. `APP_URL` 을 실제 도메인으로: `npx supabase secrets set APP_URL=https://<도메인>` — 링크 버튼 도메인은 카카오에 등록돼 있어야 한다.
6. 함수 다시 배포: `npx supabase functions deploy outbox-send --no-verify-jwt` (secrets 는 배포 없이도 반영되지만 코드가 바뀌었으면).

## 비밀
`OUTBOX_KEY` 는 `tools/setup-outbox.mjs` 가 만들어 Edge secrets · `app_settings` · `.env.local` 에만 둔다. 바꾸려면 `.env.local` 의 `OUTBOX_KEY=` 줄을 지우고 스크립트를 다시 실행(새 키를 만들어 세 곳에 다시 넣는다).
`app_settings` 는 정책이 없어 service role 만 읽는다. 더 단단히 하려면 Supabase Vault 로 옮기고 `outbox_tick()` 이 `vault.decrypted_secrets` 를 읽게 바꾼다.

## 개발 프로젝트에서
- `ALIMTALK_PROVIDER=console`: 실제 발송 없이 로그만. `outbox-send` 응답의 `debug` 에 받는 번호·URL 이 들어 있어 테스트가 토큰을 얻는다. 받는 번호가 `9999` 로 끝나면 일부러 실패한다(dead·문자 대체 경로).
- 통합 테스트: `cd tools && node --env-file=../.env.local outbox-test.mjs` → `PASS: outbox A~F`. 푸시·초대는 `push-test.mjs`(A~G 는 DB 만 있으면 통과, H 절 발송은 배포 + `PUSH_DRY_RUN=1` 필요) 와 `invite-test.mjs`(C 절은 `invite-login` 배포 필요). 테스트는 도는 동안 `app_settings.outbox_url` 을 잠시 빼서 틱이 끼어들지 않게 하고 끝나면 되돌린다.
- 링크 하나 만들어 보기: 원장으로 공지를 올리고 `outbox-send` 를 `X-Outbox-Key` 헤더로 호출하면 `debug[].url` 이 나온다. 그 주소를 새 시크릿 창에서 열면 공지가 바로 열린다.

## 처리량
`outbox-send` 는 한 번에 20건을 잡는다 → 분당 약 20건. 학원 하나면 충분하다. 공지 하나가 학부모 100명에게 가는 규모가 되면 `outbox_claim` 의 `n` 을 올리거나 `outbox-send` 안에서 줄이 빌 때까지 반복하게 바꾼다(대행사 초당 한도도 같이 본다).

## 굳은 줄 (0018_hardening.sql, 2026-09-04)

발송기가 잡히지 않은 예외(Edge 타임아웃 등)로 **catch 밖에서** 죽으면, `outbox_claim` 이 이미 커밋한 `attempts+1` 만 남고
상태는 `queued` 그대로다. 예전 규칙(`attempts < 5`)에서는 이 줄이 다섯 번째에 영영 빠져 나가지도 죽지도 않았다(레드팀 INP-21).

0018 이후 `outbox_claim` 은 잡기 전에 두 가지를 먼저 한다.

1. **한 번 더 기회** — `status='queued'` 인데 `attempts >= 5` 이고 다시 잡을 때가 된 줄을
   `status='failed'`, `next_attempt_at=now()`, `last_error='stuck: claimed but never reported'` 로 풀어 준다.
   claim 조건이 `attempts < 6` 이라 이 줄은 한 번 더 잡히고, 발송기가 받는 `attempts` 는 6 이 되어
   `outbox-send` 의 `isDead = o.attempts >= 5` 분기로 들어간다 → `dead` + (채널이 alimtalk 이면) 문자 대체 한 줄.
2. **하드 스톱** — 그러고도 `queued`/`failed` 로 남은 `attempts >= 6` 줄은 `status='dead'`,
   `last_error='stuck: gave up after 6 attempts'` 로 박는다. 더는 아무도 잡지 않는다.

`outbox_tick()` 의 "보낼 게 있나" 검사도 같은 `attempts < 6` 을 본다 — 그러지 않으면 굳은 줄이 발송기를 못 깨운다.

굳은 줄 찾기: `select id, channel, attempts, status, last_error from outbox where last_error like 'stuck:%' order by created_at desc;`
정상 흐름의 재시도 횟수는 그대로 5회다(0→5 에서 dead). `attempts=6` 은 "한 번 죽었다 살아난 줄" 이라는 표시다.

### 지워진 공지의 줄
공지를 지우면 `after delete` 트리거가 그 공지를 가리키는 `notifications` 를 지우고,
아직 안 나간(`queued`/`failed`) `outbox` 줄을 `status='dead'`, `last_error='notice deleted'` 로 박는다(레드팀 INT-38).
이미 `sent` 인 줄은 역사라 그대로 둔다.

### 받는 사람이 아직 그 학원 사람인가
`outbox_recipient_active(p_outbox uuid) returns boolean` — `to_user_id` 가 그 `academy_id` 에 아직 소속이 있으면 true.
service_role 만 부를 수 있다. 퇴원 직전에 줄에 선 알림이 퇴원 뒤에 나가는 자리(INT-39)를 `outbox-send` 가 보내기 전에 막는 데 쓴다.
