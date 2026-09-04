# 레드팀 — 적대적 입력 (2026-09-04)

대상: 화면 밖에서 들어오는 값이 DB · 알림 트리거 · outbox · 알림톡/문자/푸시 문구까지 가는 길.
방식: 슬러그 접두사 `rt-inp-` 로 학원을 만들어 호스티드 dev DB·배포 Edge 함수에 실제로 넣고, `app/src/lib` 의 순수 함수(전화·CSV·날짜·이름·출결)는 사본으로 돌렸다.
학원 이름 자체를 적대 입력으로 썼다: `"rt-inp] 테스트\n둘째줄"` — `params['학원']` 이 모든 outbox 행에 흘러 들어간다.

스크립트: `tools/redteam/inp-01…09-*.mjs` (공통 `inp-lib.mjs`, 정리 `inp-99-cleanup.mjs`).
실행: `cd tools && node --env-file=../.env.local redteam/inp-01-notices.mjs`

정리: `rt-inp-%` 학원 5개 삭제 완료(`inp-99-cleanup.mjs` → `남은 rt-inp 학원 0`). `yeongeo`·`yeongeo-jip` 학원 자체는 미접촉.
지운 사용자 25명 중 **약 10명은 rt-inp 학원 소속**이고, 나머지 약 15명은 `0109%` 번호에 소속·명부가 하나도 없는 고아 행이었다 — `tools/cleanup-test-data.mjs` 와 같은 관례를 따랐지만 다른 점검이 동시에 돌던 중이라 **내 학원 밖을 쓴 셈**이다. `inp-99` 의 고아 쓸기를 남길지는 Fable 이 정해 주면 좋겠다.
**남긴 흔적 하나**: `inp-04` 의 변형 `'010 1234 5678'`·`'010-12345678'` 이 정규화되면 `01012345678` 인데, 이 번호가 어느 학원 명부에 실제로 있어 `otp-send` 가 **200** 을 돌려줬다. 그 번호로 `otp_codes` 2행이 생겼고 문자 2건이 나갔으며, 10분 3건 상한 중 2건을 썼다(보안 팀이 같은 시각에 `otp-send` 상한을 시험 중이었다). `otp_codes` 는 살림이 24시간 뒤 지운다. 스크립트 머리에 주의를 적어 뒀다 — 다시 돌리기 전에 명부에 없는 번호로 바꿔야 한다.
주의 하나: `outbox_claim()`·`housekeeping()` 은 학원 범위가 아니라 전역이라 **부르지 않았다**. 대신 내 학원 행에 같은 상태 전이를 손으로 만들고 claim 의 WHERE 조건을 평범한 SELECT 로 확인했다. 알림을 만든 스크립트는 곧바로 그 학원의 outbox 를 읽고 지워 pg_cron(1분 틱)이 실제로 발송하지 않게 했다.
점검 중 `_shared/push.ts` + `0016_attendance_reason_param.sql`(출결 사유를 푸시 본문에 붙이는 변경)이 다른 작업으로 들어왔다 — INP-71 은 그 새 코드에 대한 결과다.

## 발견 (findings)

| ID | 심각도 | 무엇 | 재현 | 증거 |
|----|--------|------|------|------|
| INP-11 | 높음 | **쓸모없는 푸시 구독 한 줄이 그 사람의 알림을 영구히 끊는다.** `0013 trg_notification_outbox` 는 `has_push` 가 참이면 알림톡 줄을 만들지 않는다(`kakao_also` 기본 false). 학부모 JWT 로 `endpoint='http://192.0.2.1/x'` 같은 죽은 주소를 넣을 수 있고(검증 없음 — INP-10), 죽은 주소는 404/410 을 주지 않으므로 `sendPush` 의 `gone` 판정에 걸리지 않아 구독이 지워지지도 않는다. 결과: 푸시는 실패, 카톡은 애초에 줄에 안 서고, 학부모는 어느 채널로도 알림을 못 받는다. **악의가 없어도 같은 일이 난다**: 404/410 이 아닌 모든 응답이 구독을 살려 둔다 — APNs 는 VAPID 가 안 맞으면 403, FCM 은 키를 바꾸면 400/401 을 준다. 그러면 구독한 **모든** 사용자의 카톡이 한꺼번에 막힌다. 고치는 방향이 달라지는 지점이다(4xx 는 전부 gone 으로 보거나, `failed_at` 이 오래된 구독을 정리). | `redteam/inp-02-push.mjs` | 가짜 endpoint 구독 1행 → 공지 1건 → `outbox` 채널 `["push"]` (alimtalk 없음). `_shared/push.ts sendPush`: `gone: st === 404 \|\| st === 410` |
| INP-02 (→ INP-01) | 높음 | **푸시 페이로드에 길이 제한이 없다.** `pushPayload` 는 자르지 않는다. 2,000자 공지 제목 하나로 페이로드가 6,169바이트(RFC 8291 aes128gcm 기준 실효 평문 한도 약 4KB — 푸시 서비스가 보장하는 4,096바이트 레코드에서 헤더·태그를 뺀 3,993~4,078바이트)가 된다. 푸시 서비스의 413 은 404/410 이 아니라 `gone:false` → `failed` → 5회 재시도 → `dead`. 그런데 `outbox-send` 는 `o.channel === 'alimtalk'` 일 때만 `enqueueSms` 를 부르므로 **푸시가 죽으면 문자 대체가 없다** — 그 알림은 조용히 사라진다. | `redteam/inp-01-notices.mjs` (title2000) | `JSON.stringify(pushPayload)` = **6,169바이트** > 4,078. `outbox-send/index.ts` dead 분기: `if (o.channel === 'alimtalk') await enqueueSms(...)` |
| INP-01 (원인) | 높음 | **공지 제목에 길이 제한이 어디에도 없다** — 화면(`Notices.tsx`)도 `maxLength` 가 없고(앱 전체에서 `maxLength` 는 OTP 6자리 하나뿐), `notices.title` 도 `text not null` 이다. 2,000자가 그대로 `notifications.title` → `outbox.params['제목']` → 알림톡·문자·푸시 문구로 나간다. | `redteam/inp-01-notices.mjs` (title2000) | `notices.title` 2,000자 → `notifications.title` 2,007자 → `outbox.params.제목` 2,000자 → 알림톡 문구 **2,031자**(카카오 한도 1,000) · 문자 대체 **6,115바이트**(90바이트 넘으면 LMS) · 푸시 **6,169바이트** |
| INP-62 | 높음 | **CSV 명부에 학생번호가 비어 있으면 동명이인 중 첫 후보에게 무조건 붙는다.**(후보 순서는 `listStudents(undefined, true)` 가 주는 순서 — 재현 스크립트에서는 `created_at` 순으로 고정했다.) `Import.tsx apply()` 의 짝짓기 조건 `!s.student_phone \|\| !d.student_phone \|\| d.student_phone === s.student_phone` 이 첫 후보에서 참이 된다. `roster_save_student` 는 번호 목록을 통째로 덮어쓰므로 **엉뚱한 아이의 명부가 갈아치워진다** — 원래 학생번호·보호자 번호가 사라지고, 그 보호자는 다음 로그인부터 자녀를 못 본다. 확인 창도 되돌리기도 없다. | `redteam/inp-07-csv.mjs` (같은 이름 두 학생) | 김민수 A(학생번호 `01011110001`, 보호자 `01022220001`) · B(`01011110002`) 가 있는 상태에서 CSV 한 줄 `김민수,학생번호 빈칸,보호자 01033330003` 적용 → **A** 갱신, A 의 명부가 `["parent:01033330003"]` 만 남음 |
| INP-21 | 높음 | **발송기가 잡히지 않은 예외로 죽으면 outbox 행이 산 것도 죽은 것도 아닌 채로 굳는다.** `outbox_claim` 이 `attempts+1` 을 먼저 커밋하고 상태 갱신은 함수 본문이 한다. Edge 타임아웃처럼 catch 밖에서 죽으면 `status='queued'` 인 채 `attempts` 만 오르고, 5가 되면 `attempts < 5` 조건에서 영영 빠진다. `dead` 가 아니라 문자 대체(`enqueueSms`)도 안 걸리고, `outbox_tick` 의 "보낼 게 있나" 검사에도 안 잡혀 아무도 눈치채지 못한다. 이 시나리오는 INP-13(구독 수 무제한) · INP-02(6KB 페이로드)로 실제로 만들 수 있다. | `redteam/inp-03-outbox.mjs` (2번 블록) | claim 갱신만 6번 반복 → `{"attempts":6,"status":"queued","claimable":false}` |
| INP-71 | 중간 | **출결 사유 5,000자가 푸시 본문에 그대로 붙는다.** 새로 들어온 `0016` + `pushPayload` 의 `' · ' + 사유` 가 사유를 자르지 않는다. (트리거 `0016` 이 dev DB 에 적용된 것은 확인했고, `push.ts` 의 Edge 배포 여부는 확인하지 않았다 — 본문 계산은 로컬 사본으로 했다.) 페이로드 15,186바이트 → INP-02 와 같은 dead(문자 대체 없음) 길. | `redteam/inp-08-longtext.mjs` | `note` 5,000자 → push `params` 에 `사유` 실림 → `JSON.stringify(payload)` **15,186바이트** > 4,078 |
| INP-70 | 중간 | `attendance.note` 에 길이 제한이 없다. `0015 trg_attendance` 가 `제목 \|\| ' · ' \|\| note` 로 붙여 알림 제목·본문이 통째로 길어진다. | `redteam/inp-08-longtext.mjs` | `note` 5,000자 → `notifications.title` **5,020자** · `body` 5,008자 |
| INP-03 (→ INP-01) | 중간 | 알림톡 문구가 카카오 1,000자 한도를 넘는다. 대행사가 4xx 를 주면 5회 실패 → dead → 문자 대체가 걸리는데, **문자 대체는 같은 문구라 함께 실패한다**(6,115바이트). | `redteam/inp-01-notices.mjs` | 알림톡 2,031자 / 문자 6,115바이트 |
| INP-45 | 중간 | **`classes.schedule`(jsonb) 에 아무 검사가 없다.** `24:00`·`25:00`·`19:60`·`start:'x'`·`dow:9` 가 그대로 저장된다. `hmToMin` 이 null 을 주면 `pickInitialClass`·`todaySlots` 가 그 시간대를 **조용히 버려**, 시간표는 있는데 "오늘 수업"에 안 잡히는 반이 생긴다. | `redteam/inp-05-dates.mjs` | 저장된 5개 중 3개가 `hmToMin=null` 로 탈락: `24:00~25:00`, `19:60~21:00`, `x~null` |
| INP-80 | 중간 | **`nextClassDays` 는 시각을 문자열로 비교한다**(`s.start > hm`). `'7:00'`·`'9:00'`(앞 0 없음)·`'25:00'` 이 시간표에 있으면 밤 11시 30분에도 "다음 수업 오늘" 로 뜬다. `hmToMin` 을 쓰는 `pickInitialClass` 는 같은 값을 아예 버려서 **같은 화면 안에서 두 판단이 어긋난다**. | `redteam/inp-09-nextclass.mjs` | `nowHm='23:30'` 에서 오늘이 후보로 잡힌 시각: `["7:00","25:00","9:00"]`. `app/src/lib/api.ts nextClassDays` 336줄 |
| INP-60 | 중간 | CSV 시각 검사가 `^\d{2}:\d{2}$` 뿐 — `25:00`·`26:00` 이 통과해 그대로 반 시간표가 된다(그 뒤 INP-45 와 같은 자리로 빠진다). 반대로 `7:00` 은 CSV 만 거절한다(INP-46). | `redteam/inp-07-csv.mjs` | `25:00~26:00` 오류 0건, `groupRoster` → 반 `고1 A 25:00~26:00` |
| INP-42 | 중간 | **`invoices.period_ym` 검사가 모양(`^\d{4}-\d{2}$`)뿐**이라 존재하지 않는 달이 청구서가 된다. `issue_invoices`/`remind_unpaid` 는 `to_date` 에서 막지만, 원장 RLS 로 직접 넣는 길(=RPC 를 거치지 않는 모든 경로)이 열려 있다. 학부모 `my_invoice('2026-13')` 도 그 행을 그대로 돌려준다. | `redteam/inp-05-dates.mjs` | `2026-13`·`2026-00`·`0000-99` insert 성공, `my_invoice` 각 1행. (`2026-1`·`2026-012` 는 check 가 막음) |
| INP-50 | 중간 | **`set_invoice_amount` 가 총액 음수를 만든다.** 칸마다 `< 0` 만 보고 합계는 안 본다. `recalc_invoice` 는 `total > 0` 이 아니면 납부로 치지 않아 상태가 `issued` 로 굳고, 학부모 카드에 마이너스 금액이 뜬다. | `redteam/inp-06-amounts.mjs` | `set_invoice_amount(1000, 5000, 0)` → `total = -4000`, `status = issued` |
| INP-54 | 중간 | **`invoices` 표에 금액 check 가 하나도 없다** — 원장 RLS 로 `total=-50002`, `status='paid'` 를 직접 넣을 수 있다. (`payments.amount > 0`, `fee_plans.amount >= 0` 은 있다.) | `redteam/inp-06-amounts.mjs` | insert 성공, `total=-50002 status=paid` |
| INP-31 | 중간 | **`roster_save_student` 는 `normalize_phone` 만 하고 휴대폰 모양을 보지 않는다.** 화면(`Roster.tsx` 의 `isValidMobile`) 밖에서 온 값(CSV 적용·API·다른 클라이언트)은 그대로 명부에 앉고, 그 사람은 자기 번호를 눌러도 영영 못 들어온다. | `redteam/inp-04-phones.mjs` | `p_student_phone="+82 10-1234-5678"` → `roster_phones.phone='821012345678'`. `0007_manage.sql` 22~48줄에 모양 검사 없음 |
| INP-30 | 중간 | **`otp-send` 는 자릿수만 본다**(`phone.length < 10`). `+82 10-…`(12자리)·줄바꿈으로 두 번호가 붙은 값(22자리)이 `400 bad_phone` 이 아니라 `404 not_in_roster` 로 떨어져, 사용자는 "명부에 없다"는 **틀린 안내**를 받는다. | `redteam/inp-04-phones.mjs` | `"+82 10-1234-5678"` → 404 `not_in_roster` (`isValidMobile=false`) |
| INP-13 | 중간 | **한 사용자의 푸시 구독 수에 상한이 없다** — 60행을 한 번에 넣었다. `outbox-send` 는 알림 한 건마다 구독 전부에 **순차** 발송하므로(20행 claim × N 구독) Edge 타임아웃 → INP-21 로 이어진다. | `redteam/inp-02-push.mjs` | insert 60행 성공. RLS `push_subs_ins` 는 `with check (user_id = auth.uid())` 뿐 |
| INP-10 | 중간 | `push_subscriptions.endpoint` 에 https·호스트 검증이 없다 — `http://`·임의 IP 를 학부모 JWT 로 넣을 수 있다(INP-11 의 입구). | `redteam/inp-02-push.mjs` | `endpoint='http://192.0.2.1/…'` insert 성공 |
| INP-12 | 중간 | `endpoint` 길이 제한도 없다 — 10,020바이트 endpoint 저장 성공(`unique` btree 는 압축 덕에 막지 못했다). | `redteam/inp-02-push.mjs` | 10,020바이트 insert 성공 |
| INP-20 | 중간 | `outbox.params` 크기에 상한이 없다 — 30KB jsonb 가 줄에 선다(이미 한도를 넘긴 채로). | `redteam/inp-03-outbox.mjs` | `params` JSON **30,053바이트** 저장 성공 |
| INP-72 | 중간 | `client_errors` 에 크기·건수 제한이 없다 — 로그인한 아무나 message 1MB + stack 1MB 행을 반복해 넣을 수 있다. 살림은 30일 뒤에야 지운다. (보안 팀 RT-2 와 같은 자리 — 그쪽은 `academy_id` 위조까지 확인했다.) | `redteam/inp-08-longtext.mjs` | 1MB+1MB insert 성공(앱 `report.ts` 는 1,000자로 자르지만 그건 클라이언트 예의일 뿐) |
| INP-04 | 낮음 | 학원 이름에 `]` 가 있으면 `pushPayload` 의 앞머리 제거 정규식 `^\[[^\]]*\]\s*` 이 첫 `]` 에서 끊겨 나머지가 본문 앞에 남는다. | `redteam/inp-01-notices.mjs` | 이름 `"rt-inp] 테스트\n둘째줄"` → 푸시 body `"테스트\n둘째줄] 새 공지가 올라왔어요. …"` |
| INP-05 | 낮음 | `academies.name` 에 줄바꿈 검사가 없다 — 푸시 제목·알림톡 앞머리에 그대로 들어간다. | `redteam/inp-01-notices.mjs` | 푸시 `title = "rt-inp] 테스트\n둘째줄"` |
| INP-06 | 낮음 | 빈 제목 공지가 DB 에 들어간다(화면만 막는다) → 알림 제목이 `새 공지 「」`. | `redteam/inp-01-notices.mjs` | `notices.title=''` 허용 |
| INP-47 | 낮음 | `fmtDateLong('2026-02-30')` → `"2월 30일 (월)"`. 날짜 문자열은 그대로 두면서 요일만 `Date` 가 굴린 3월 2일의 것을 쓴다 — **없는 날짜를 그럴듯하게 보여 준다**. `'2026-13-01'` 은 `"13월 1일 (undefined)"`. | `redteam/inp-05-dates.mjs` | 출력 `[["2026-02-30","2월 30일 (월)"],["2026-13-01","13월 1일 (undefined)"]]` |
| INP-49 | 낮음 | `fmtTime12` 가 분을 검사하지 않는다 — `'19:60'` → `'오후 7:60'`. 같은 값을 `hmToMin` 은 null 로 버린다(두 함수의 판단이 갈린다). | `redteam/inp-05-dates.mjs` | `fmtTime12('19:60')='오후 7:60'`, `hmToMin('19:60')=null` |
| INP-46 | 낮음 | `'7:00'`(앞 0 없음)을 CSV 파서는 거절하고 `hmToMin`·`fmtTime12`·`TimeField` 는 받아들인다 — 같은 값의 문지기가 화면마다 다르다. | `redteam/inp-05-dates.mjs` | CSV 오류 `시작·끝은 19:00 처럼` vs `hmToMin('7:00')=420` |
| INP-36 | 낮음 | `isValidMobile` 정규식 `^01[016789]\d{7,8}$` 이 **`0101234567`(010 + 7자리 = 10자리)를 통과시킨다**. 010 은 11자리뿐인데(10자리는 011·016 등 옛 번호), 이 번호는 명부에 앉은 뒤 문자를 못 받는다. | `redteam/inp-04-phones.mjs` | `{"in":"0101234567","norm":"0101234567","len":10,"valid":true}` |
| INP-40 | 낮음 | 달력 날짜에 상·하한이 없다 — `9999-12-31`·`0001-01-01` 저장 성공. | `redteam/inp-05-dates.mjs` | insert 성공 |
| INP-41 | 낮음 | 할 것 마감일에 상한이 없다 — `9999-12-31` 이 학부모 목록에 영원히 남는다. | `redteam/inp-05-dates.mjs` | insert 성공 |
| INP-51/52/53 | 낮음 | 금액에 상한이 없다: 청구 10억 원, **청구액을 훨씬 넘는 납부**(10만 원 청구서에 10억 원 납부 → `paid`), 요금제 10억 원. | `redteam/inp-06-amounts.mjs` | `total=1000000000` / `payments [1000000000], status=paid` |
| INP-61 | 낮음 | CSV 줄 수에 상한이 없다 — 1,000줄이 3ms 만에 통과하고, `Import.apply` 는 학생마다 `studentDetail` + `saveStudent` 를 **순차**로 부른다(왕복 2,000회 이상). 진행 표시도 중단도 없고, 도중에 실패하면 절반만 들어간 채 남는다. | `redteam/inp-07-csv.mjs` | 파싱 1,000줄/3ms, 오류 0 |
| INP-73 | 낮음 | `billing_rules.bank_info` 에 길이·줄바꿈 검사가 없다 — 통째로 미납 안내 알림 본문이 된다. | `redteam/inp-08-longtext.mjs` | `bank_info` 3,0xx자 → `notifications.body` 3,039자 |
| INP-75 | 낮음 | 학생 이름 길이 제한이 없다 — 40자 이름이 저장되어 알림 제목·명부 줄을 밀어낸다. | `redteam/inp-08-longtext.mjs` | `students.name` 40자 저장 성공 |

## 버텨 낸 것 (held)

**주입·이스케이프**
- **XSS 없음**: 공지 제목·본문의 `<script>alert(1)</script>`, `<img src=x onerror=…>` 가 그대로 저장되지만 React 가 이스케이프한다. `dangerouslySetInnerHTML` 은 `App.tsx`·`SideNav.tsx` 의 **고정 아이콘 상수**에만 쓰이고 사용자 값이 닿지 않는다.
- SQL 주입 시늉(`'; drop table notices; --`)은 평범한 문자열로 저장된다(PostgREST·plpgsql 파라미터 바인딩).
- **공지 본문은 알림 문구에 실리지 않는다** — 10,000자 본문을 올려도 `outbox.params` 에는 `제목` 만 간다(`params.제목` 7자, 푸시 186바이트). 길이 문제는 제목·사유 쪽에만 있다.
- `{{학생}}`·`${x}`·`%s` 같은 틀 문법은 알림톡 템플릿이 **아는 키만 읽는** 함수라 치환되지 않는다.
- ` ` 이 든 문자열은 PostgREST 가 거절한다(`unsupported Unicode escape sequence`).

**토큰·인증 입구**
- `invite-login` 은 `/^[0-9a-f]{32}$/` 밖의 8가지(빈값·`x`·대문자 32자·31자·33자·`null`·숫자·객체)에 모두 **401 `bad_token`**.
- `create_invite` 는 대시 든 번호를 `normalize_phone` 으로 받아 주고, 명부에 없는 번호(`not in roster`)·빈 번호(`phone required`)를 거절한다.
- `otp-send` 는 전각 숫자·빈 문자열·문자만 → **400 `bad_phone`**.

**DB 제약이 실제로 막은 것**
- `calendar.date`·`todos.due_date` 의 `2026-02-30`·`2026-13-01` → `date/time field value out of range`.
- `invoices.period_ym` 의 `2026-1`·`2026-012` → check 위반.
- `issue_invoices('2026-13')`·`remind_unpaid('2026-13')` → `to_date` 에서 거절.
- `billing_rules.due_day` `0/29/30/31/99/-1` **전부 거절**(check between 1 and 28). `billing_day`·`sibling_discount_pct` 도 같은 자리.
- `record_payment`: 음수·0·`null` → `bad amount`, `1.5` → 정수 캐스트 오류, `2147483648` → int 범위 초과.
- `set_invoice_amount`: 음수 칸 → `bad amount`, 소수·int 초과 거절.
- `fee_plans.amount`: 음수 → check 위반, 소수·int 초과 거절.
- `roster_save_student`: 공백만 있는 이름 → `name required`.
- `push_subscriptions`: 남의 `user_id` 로 insert → RLS 거절.

**CSV 파서** (`splitCsv`/`parseRosterCsv`/`groupRoster`)
- BOM · CRLF · 따옴표 안 쉼표 · 따옴표 안 줄바꿈 · 두 겹 따옴표(`""`)를 RFC 4180 대로 다룬다.
- 완전히 같은 줄이 두 번 있어도 `groupRoster` 가 학생 하나로 합친다.
- 머리글이 없으면 1줄 오류로 막고, 열이 더 있어도 머리글 위치로만 읽어 무시한다.
- `+82 10-…` 보호자번호·`먼데이` 요일·`7:00` 시각·빈 학생 이름을 줄 번호와 함께 거절하고, 오류가 하나라도 있으면 화면이 적용 단추를 잠근다.

**outbox 줄**
- 적대적 params 가 든 행이 **뒤 행을 막지 않는다** — claim 은 행마다 독립이다.
- 어댑터가 던지는(=잡히는) 실패는 제대로 돈다: 5회 재시도 → `dead` → 알림톡 채널이면 `enqueueSms` 로 문자 대체 한 줄(`idempotency_key + ':sms'` 로 한 번만). 막히는 것은 **catch 밖에서 죽는 경우**뿐이다(INP-21).

**이름 규칙** (`name.ts`)
- 공백·숫자·영문·이모지가 섞인 이름은 `callName` 이 손대지 않고 그대로 둔다(설계대로).
- 한 글자 이름 `'민'` → `'민이'`, 복성 `'남궁민수'` → `'민수'` 로 제대로 처리된다.

**시간 함수**
- `hmToMin`·`fmtTime12` 모두 `24:00`·`25:00`·`99:99` 를 거른다(`h > 23`).
- `dow` 가 0~6 밖이면(`dow:9`) 어떤 날에도 안 맞아 조용히 빠진다 — 터지지는 않는다.

## 한 줄 정리 (수정은 Fable 담당)

가장 급한 것은 **알림이 소리 없이 사라지는 두 길**이다: 죽은 푸시 구독 하나가 카톡까지 끄는 INP-11, 그리고 길이 제한이 없어 4KB 를 넘긴 푸시가 dead 로 가되 문자 대체가 없는 INP-01/02/71. 그 다음이 **명부를 갈아엎는** INP-62(동명이인 + 빈 학생번호), 그리고 **조용히 굳는 줄** INP-21. 나머지는 대부분 "글자 수·모양 상한이 어느 층에도 없다" 한 가지가 여러 자리에 나타난 것이다 — 제목·사유·이름·계좌 안내·endpoint·params.
