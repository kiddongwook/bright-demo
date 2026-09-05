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

## 대행사 붙이기 (계약 뒤) — 일반 `http` 어댑터
솔라피를 쓰면 이 절은 건너뛰고 아래 "솔라피(Solapi) 붙이기" 로 간다. 여기는 다른 대행사를 붙일 때의 자리다.
1. `npx supabase secrets set ALIMTALK_PROVIDER=http ALIMTALK_HTTP_URL=… ALIMTALK_HTTP_TOKEN=… ALIMTALK_SENDER_KEY=…`
2. `supabase/functions/_shared/alimtalk.ts` 의 `http` 분기: 요청 본문·응답의 `messageId` 를 대행사 문서에 맞춘다. 문구·버튼 이름은 심사받은 것 그대로.
3. 대행사 콜백 URL 로 `https://<ref>.supabase.co/functions/v1/outbox-callback?key=<OUTBOX_KEY>` 등록(헤더 `X-Outbox-Key` 를 붙일 수 있으면 헤더로). 대행사 본문 → `{provider_msg_id, status: delivered|failed, reason}` 변환은 `outbox-callback/index.ts` 의 `parse()` 한 곳.
4. 문자 대체는 `SMS_PROVIDER=http` 로 같은 대행사(`_shared/sms.ts`).
5. `APP_URL` 을 실제 도메인으로: `npx supabase secrets set APP_URL=https://<도메인>` — 링크 버튼 도메인은 카카오에 등록돼 있어야 한다.
6. 함수 다시 배포: `npx supabase functions deploy outbox-send --no-verify-jwt` (secrets 는 배포 없이도 반영되지만 코드가 바뀌었으면).

## 솔라피(Solapi) 붙이기

대행사를 솔라피로 잡았다. 문자와 알림톡이 **같은 REST 한 곳**으로 나간다 — `POST https://api.solapi.com/messages/v4/send-many/detail`.
가입·발신번호 등록·충전·API 키 발급까지의 계정 쪽 순서는 `docs/ops/alimtalk.md` 의 "솔라피 준비" 표에 있다. 여기는 **키를 받은 다음** 할 일이다.

### 1) 문자만 먼저 켠다 (알림톡 심사를 기다리는 동안)

```
npx supabase secrets set SMS_PROVIDER=solapi SOLAPI_API_KEY=… SOLAPI_API_SECRET=… SOLAPI_FROM=0212345678
npx supabase functions deploy outbox-send --no-verify-jwt
```

`SOLAPI_FROM` 은 솔라피에 **사전등록을 마친** 발신번호다(숫자만, 하이픈 없이). 등록 안 된 번호를 넣으면 건건이 실패한다.
이 상태에서 알림톡은 아직 `ALIMTALK_PROVIDER=console` 이므로 카톡은 로그만 찍히고, 카톡이 죽어 문자로 내려가는 줄만 실제로 나간다.

### 2) 알림톡까지 켠다 (템플릿 심사 통과 뒤)

```
npx supabase secrets set ALIMTALK_PROVIDER=solapi SOLAPI_PF_ID=KA01PF… \
  SOLAPI_TEMPLATES='{"NOTICE_NEW":"KA01TP…","NOTICE_REMIND":"KA01TP…","INQUIRY_ANSWERED":"KA01TP…","MAKEUP_CONFIRMED":"KA01TP…","ATTENDANCE":"KA01TP…"}'
npx supabase secrets set APP_URL=https://<도메인>
npx supabase functions deploy outbox-send --no-verify-jwt
```

- `SOLAPI_PF_ID` — 카카오 발신프로필 키(솔라피 콘솔 → 카카오 채널). 학원마다가 아니라 **BRIGHT 채널 하나**다.
- `SOLAPI_TEMPLATES` — 우리 템플릿 코드 → 솔라피 `templateId` 표. JSON 한 줄. 작은따옴표로 감싸야 셸이 `{}` 를 안 건드린다.
- 표에 그 코드가 없거나 `SOLAPI_PF_ID` 가 비어 있으면 **그 줄은 알림톡을 건너뛰고 곧바로 문자로 나간다.** 조용히 삼키지 않고 로그에 사유를 남긴다:
  `[ALIMTALK→010****5678] SOLAPI_TEMPLATES 에 NOTICE_NEW 없음 → 문자로 보낸다`.
  다섯 개를 한꺼번에 심사받지 못했을 때 알림이 멈추지 않게 하려고 이렇게 뒀다 — 대신 요금은 문자 요율로 나간다.

### 비밀값 한눈에

| 이름 | 언제 | 무엇 |
|---|---|---|
| `SMS_PROVIDER=solapi` | 1단계 | 문자를 솔라피로 |
| `SOLAPI_API_KEY` · `SOLAPI_API_SECRET` | 1단계 | 솔라피 API 키 쌍. 시크릿은 발급 때 한 번만 보인다 |
| `SOLAPI_FROM` | 1단계 | 등록 발신번호(숫자만) |
| `ALIMTALK_PROVIDER=solapi` | 2단계 | 카톡을 솔라피로 |
| `SOLAPI_PF_ID` | 2단계 | 카카오 발신프로필 키 |
| `SOLAPI_TEMPLATES` | 2단계 | 코드→templateId JSON |
| `APP_URL` | 2단계 | 버튼 링크 도메인 (카카오에 등록된 것) |

`ALIMTALK_HTTP_*` · `ALIMTALK_SENDER_KEY` · `SMS_HTTP_*` 는 솔라피에서 쓰지 않는다 (예전 `http` 어댑터용).

### 문자 종류(SMS/LMS)와 요금
`_shared/solapi.ts` 가 문구를 **EUC-KR 바이트**로 세서 90을 넘으면 `type: 'LMS'` 로 올린다 — 한글 45자가 경계다(한글 2바이트, 영문·숫자 1바이트).
`_shared/alimtalk.ts` 의 `cutBytes` 는 UTF-8(한글 3바이트) 로 2,000바이트 상한을 보는 **다른 셈**이다. 둘을 섞지 말 것.
알림톡 버튼 URL(`?l=<토큰 32자>`)이 문자 대체 문구 끝에 붙으므로 대체 문자는 사실상 늘 LMS 다. 요율을 볼 때 이걸 감안한다.

### 학원별 키 (0023 academy_settings)
`academy_sms_key()` 가 주는 `sender_key` 한 칸을 솔라피에서는 **`apiKey:apiSecret[:발신번호]`** 로 읽는다.
세 번째 칸(발신번호)은 생략하면 전역 `SOLAPI_FROM` 을 쓴다. 이 모양이 아니면 그 줄은
`solapi: 학원 발신키 모양이 아니다 (apiKey:apiSecret[:발신번호])` 로 실패한다 — **일부러 그렇게 뒀다.** 엉뚱한 계정에 요금이 붙는 것보다 읽을 수 있는 사유로 실패하는 게 낫다.

주의 — 지금은 이 길이 **막혀 있다.** `0023_operator.sql` 의 제약이 `sms_provider in ('console','http')` 라서 `'solapi'` 를 저장할 수 없다.
학원별 솔라피 키를 실제로 쓰려면 그 체크를 넓히는 마이그레이션이 먼저 필요하다(`academy_sms_key` 와 운영자 화면의 값 목록도 같이).
그 전까지 어떤 학원이 `sms_provider='http'` + `sender_key` 를 가진 채 전역이 `solapi` 면, 그 학원의 줄만 위 사유로 실패한다. 학원별 키를 안 쓰면(전부 `console`) 전역 키로 잘 돈다.

### 오류 읽기
`outbox.last_error` 에 남는 모양은 두 가지다.

- `solapi <HTTP 상태> <errorCode> <errorMessage>` — 요청 자체가 거절됐다. 계정·인증·본문 문제다.
  자주 보는 것: 인증 실패(키·시크릿 오타, 서버 시계가 많이 틀어짐 — date 는 요청 시각이다), 잔액 부족, 발신번호 미등록.
- `solapi <statusCode> <statusMessage>` — 요청은 받았는데 **그 한 건의 접수가 실패**했다(`failedMessageList`).
  받는 번호 문제(형식·수신거부), 템플릿 변수 불일치(`#{제목}` 을 안 채웠다든지), 발신프로필 문제가 여기로 온다.
  `statusCode` 숫자의 뜻은 솔라피 콘솔의 발송 내역이나 솔라피 문서의 상태코드 표에서 확인한다 — 여기 표로 옮겨 적지 않는다(코드가 늘어난다).

성공·실패를 우리가 `statusCode` 값으로 판정하지 않는다. **`failedMessageList` 에 들어 있으면 실패**, 아니면 `messageList[0].messageId` 를 `provider_msg_id` 로 저장한다.

### 콜백(수신 결과)은 나중에 — 붙일 땐 하나만 고른다
지금은 콜백 없이 돈다. 접수 성공까지만 우리가 알고, 실제 도착 여부는 솔라피 콘솔에서 본다.
나중에 붙이려면 솔라피 웹훅을 `https://<ref>.supabase.co/functions/v1/outbox-callback?key=<OUTBOX_KEY>` 로 걸고,
솔라피 본문 → `{provider_msg_id, status: delivered|failed, reason}` 변환을 `outbox-callback/index.ts` 의 `parse()` 한 곳에 둔다
(`provider_msg_id` 는 우리가 저장한 솔라피 `messageId` 다).

**이때 문자 대체가 두 겹이 된다.** 우리는 `kakaoOptions.disableSms = false` 로 보내므로 카톡이 실패하면 **솔라피가 이미 문자를 대신 보낸다.** 그런데 `outbox-callback` 은 `status: failed` 를 받으면 문자 줄을 하나 더 만든다 → 같은 사람이 문자를 두 번 받는다. 둘 중 하나만 골라야 한다.

- **솔라피에 맡긴다(권장)** — `parse()` 가 카톡 실패를 `failed` 로 올리지 않게 한다(최종 도착 상태만 매핑). 대체가 대행사 안에서 한 번에 끝나 빠르다.
- **우리가 한다** — `_shared/solapi.ts` 의 `disableSms` 를 `true` 로 바꾸고 지금의 콜백 → 문자 줄 흐름을 그대로 쓴다. 문자 대체까지 `outbox` 에 이력이 남는다.

### ⚠ 켠 프로젝트에서 테스트 스크립트를 돌리지 않는다
`SMS_PROVIDER=solapi` 가 걸린 프로젝트에서는 **`tools/*-test.mjs` 를 절대 돌리지 않는다.**
`outbox-test.mjs` 는 `0109` + 임의의 6자리로 사람을 만들고(진짜 누군가의 번호일 수 있는 11자리 010 번호다),
C·D 절이 일부러 `sms` 줄을 만들어 발송기를 깨운다 — 콘솔 모드에선 로그로 끝나지만 솔라피가 켜져 있으면 **모르는 사람에게 요금 붙은 문자가 실제로 나간다.**
개발·회귀용 프로젝트는 `SMS_PROVIDER=console` 로 따로 두고, 솔라피는 운영 프로젝트에만 건다.
운영 프로젝트에서 확인할 일이 있으면 아래 `sms-test.mjs` 로 **자기 번호에 한 통**만 보낸다.

### 첫 알림톡 한 건에서 반드시 볼 것
우리는 ATA 요청에 `kakaoOptions`(템플릿·변수) 와 함께 문자 대체용 `text` 를 같이 싣는다.
솔라피 공식 예시의 알림톡 본문에는 `text` 가 없다 — SDK 스키마는 허용하지만, **변수와 함께 보냈을 때 솔라피가 이 `text` 를 대체 문자 본문으로 쓰는지 실제로 확인된 바 없다.**
키를 꽂고 처음 알림톡을 보낼 때 이걸 먼저 본다(카톡이 없는 번호로 한 건 보내 대체 문자가 어떻게 오는지).
거절되거나 무시되면 `_shared/solapi.ts` 의 `solapiSendAlimtalk` 에서 `text` 를 빼면 된다 — 그러면 솔라피가 템플릿으로 대체 문구를 만든다(대신 버튼 URL 이 그 문자에 안 실릴 수 있다).

### 시험
```
cd tools && node --env-file=../.env.local sms-test.mjs 01012345678
```
자기 번호로 **진짜 한 통**이 나간다(요금이 나간다). `groupId` · `messageId` · `statusCode` · 남은 잔액을 찍는다.
`.env.local` 에 `SOLAPI_*` 가 없으면 아무 것도 보내지 않고 무엇을 보낼 뻔했는지만 찍고 정상 종료한다 — 키 넣기 전에 문구·SMS/LMS 판정만 보는 용도로도 쓴다.
문자를 받았으면 발신번호 등록·충전·키가 모두 맞은 것이다. 그다음 실제 알림 흐름은 공지를 하나 올려 `outbox` 가 도는지로 본다.

## 비밀
`OUTBOX_KEY` 는 `tools/setup-outbox.mjs` 가 만들어 Edge secrets · `app_settings` · `.env.local` 에만 둔다. 바꾸려면 `.env.local` 의 `OUTBOX_KEY=` 줄을 지우고 스크립트를 다시 실행(새 키를 만들어 세 곳에 다시 넣는다).
`app_settings` 는 정책이 없어 service role 만 읽는다. 더 단단히 하려면 Supabase Vault 로 옮기고 `outbox_tick()` 이 `vault.decrypted_secrets` 를 읽게 바꾼다.

## 개발 프로젝트에서
- `ALIMTALK_PROVIDER=console`: 실제 발송 없이 로그만. `outbox-send` 응답의 `debug` 에 받는 번호·URL 이 들어 있어 테스트가 토큰을 얻는다. 받는 번호가 `9999` 로 끝나면 일부러 실패한다(dead·문자 대체 경로).
- **테스트 스크립트는 `SMS_PROVIDER`·`ALIMTALK_PROVIDER` 가 둘 다 `console` 인 프로젝트에서만 돌린다.** 솔라피가 걸려 있으면 임의로 만든 `0109…` 번호로 진짜 문자가 나간다(위 "⚠ 켠 프로젝트에서…").
- 통합 테스트: `cd tools && node --env-file=../.env.local outbox-test.mjs` → `PASS: outbox A~F`.
  다른 점검이 남긴 줄이 아직 재시도 중이면 `failed !== 0` 으로 헛디딘다 — `node --env-file=../.env.local cleanup-test-data.mjs` 를 먼저 돌리고 다시 본다. 푸시·초대는 `push-test.mjs`(A~G 는 DB 만 있으면 통과, H 절 발송은 배포 + `PUSH_DRY_RUN=1` 필요) 와 `invite-test.mjs`(C 절은 `invite-login` 배포 필요). 테스트는 도는 동안 `app_settings.outbox_url` 을 잠시 빼서 틱이 끼어들지 않게 하고 끝나면 되돌린다.
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
