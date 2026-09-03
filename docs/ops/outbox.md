# 카톡 알림 줄(outbox) 운영

## 어떻게 도는가
알림(`notifications`) → 트리거 → `outbox`(queued) → 매분 `outbox_tick()` → Edge `outbox-send`(대행사) → sent → 대행사 콜백 `outbox-callback` → delivered | failed → failed 면 문자 줄(sms) → 다음 틱에 발송.
발송 실패는 5분 뒤 재시도, 5회면 dead + 문자 줄. 알림톡 버튼 URL 은 `https://<앱>/?l=<토큰>` — 토큰은 발송 때 새로 나오고(해시만 저장) 7일 뒤 만료, 그 화면만 연다.

카톡으로 가는 알림 5종: 새 공지 · 다시 알리기 · 문의 답변 · 보강 확정 · 출결(지각·결석, 보호자). 원장에게 가는 알림(문의 접수·결석 신청)과 학생 출결은 앱 안에서만.

## 보는 법 (Supabase SQL 에디터)
- 지금 줄: `select status, channel, count(*) from outbox group by 1,2;`
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
- 통합 테스트: `cd tools && node --env-file=../.env.local outbox-test.mjs` → `PASS: outbox A~E`. 테스트는 도는 동안 `app_settings.outbox_url` 을 잠시 빼서 틱이 끼어들지 않게 하고 끝나면 되돌린다.
- 링크 하나 만들어 보기: 원장으로 공지를 올리고 `outbox-send` 를 `X-Outbox-Key` 헤더로 호출하면 `debug[].url` 이 나온다. 그 주소를 새 시크릿 창에서 열면 공지가 바로 열린다.
