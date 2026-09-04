# 적대적 점검 — 데이터 무결성 (2026-09-04)

계획 `docs/superpowers/plans/2026-09-04-seam-verification.md` §2 의 "데이터 무결성" 몫. 호스팅된 개발 DB 에 직접 붙어, 내가 만든 학원(slug `rt-int-*`)·사용자(name `rtint-*`) 안에서만 썼다. `yeongeo`·`yeongeo-jip` 과 다른 에이전트의 접두어는 건드리지 않았고, 점검이 끝난 뒤 남은 행은 0 이다.

재현 스크립트는 `tools/redteam/` 에 있다. 전부 `node --env-file=.env.local tools/redteam/<파일>` 로 돈다.

| 파일 | 무엇을 하나 |
|---|---|
| `_int-common.mjs` | 학원·원장·학부모 만들기, 발견 수집, 뒷정리 |
| `int-concurrency.mjs` | 같은 요청 동시 실행 7종 (한 판) |
| `int-race-repeat.mjs` | 한 번에 안 걸리는 경합 3종을 8판씩 |
| `int-cascade.mjs` | 퇴원·반 삭제·강사 빼기·명부 제외·자녀 하나 퇴원 |
| `int-userdel.mjs` | 사용자 계정 삭제를 막는 FK 를 하나씩 세우기 |
| `int-consistency.mjs` | 청구액↔납부합계, 연체 뒤집기, 휴원일 우선순위, 지워진 공지의 알림 |
| `int-evidence.mjs` | 추정으로 적을 뻔한 세 가지(오류 전문·FK 이름·요금제 폴백)를 직접 받아 적기 |
| `int-cleanup.mjs` | `rt-int-*` / `rtint-*` 만 지우는 뒷정리 |

> **한 줄 결론.** 표(unique·cascade)는 어디서도 뚫리지 않았다 — 중복 청구서도, 중복 출결도, 중복 휴원일도 없었다. 대신 **표 위에 있는 것들**이 샌다: 돈에 상한이 없고(과납), 읽고-쓰기로 만든 "한 번만" 규칙 세 개(미납 안내 20시간·초대 링크 하나·청구서 한 번)가 동시 요청에 무너지고, 사람을 빼는 동작(퇴원·명부 제외·계정 삭제)이 뒤를 다 못 치운다. 높음은 없다.

---

## 발견

| ID | 심각도 | 무엇이 | 재현 | 증거 |
|---|---|---|---|---|
| **INT-01** | 중간 | `issue_invoices` 가 `not exists` 로 먼저 훑고 넣어, 동시 실행이면 unique 위반 원문이 원장 화면에 그대로 튄다. 데이터는 unique 가 지킨다 | `int-race-repeat.mjs` R1, `int-evidence.mjs` E1 | 5회 동시 × 8판 → **6판에서 23505**. 예 `2026-12: OK \| 23505 \| 23505 \| OK \| OK`. 청구서 수는 8판 모두 정확(2장). 받아 적은 오류 전문: `23505: duplicate key value violates unique constraint "invoices_student_id_period_ym_key"` |
| **INT-02** | 중간 | `record_payment` 에 과납 방어가 전혀 없다. 동시 3회면 청구액의 3배가 그대로 적히고 상태는 `paid` | `int-race-repeat.mjs` R3, `int-concurrency.mjs` C2 | 8판 중 **8판 모두 과납**. 총액 100,000원 청구서에 납부 3건 합계 **300,000원**, `status=paid` |
| **INT-03** | 중간 | 동시성과 무관하게, 단발 `record_payment` 도 총액의 10배를 받아들인다 (금액 상한·과납 경고 없음) — 수기 입력 오타(100,000→1,000,000)가 그대로 통과 | `int-concurrency.mjs` C2b | 총액 90,000 → 납부 900,000 성공, `status=paid` |
| **INT-04** | 중간 | 학부모 수강료 카드가 `paid > total` 을 그대로 보여 준다. 잔액·환불 안내가 없다 | `int-concurrency.mjs` C2c | `my_invoice` → `{total:100000, paid:300000, status:"paid"}` |
| **INT-05** | 중간 | `addCalendarMany` 는 여러 날을 **한 statement** 로 넣어, 겹치는 날 하나 때문에 그 탭이 넣으려던 **새 날짜까지 전부** 없던 일이 된다. 계약 S4("두 번째 0행, 건너뜀 3")와 어긋난다 | `int-concurrency.mjs` C3 | 탭1 `[10-05,10-06,10-07]` · 탭2 `[10-06,10-07,10-08]` 동시 → 저장된 날 `10-05,10-06,10-07`. **10-08 누락**, 탭2 는 23505. 함수 주석은 "부르는 쪽이 이미 있는 날을 걸러 낸 뒤에 쓴다" 인데, **부르는 쪽은 다른 탭이 방금 넣은 날을 볼 수 없다** — 걸러 내기를 클라이언트에 맡긴 것이 원인이다 |
| **INT-06** | 낮음 | `addCalendar` 의 "찾고 → 없으면 넣기" 가 원자적이 아니다. 동시 두 번이면 한쪽이 23505 원문 오류 | `int-concurrency.mjs` C3b | `OK \| 23505`, 행은 1개(unique 가 막음) |
| **INT-09** | 낮음 | 출결 상태를 되돌렸다 다시 넣으면 같은 내용 알림이 다시 간다. 멱등키가 `n:<notification.id>` 라 **트리거 재발화만** 막고 사건 중복은 못 막는다 | `int-concurrency.mjs` C4b | 지각→출석→지각 3회 저장 → notifications 2, outbox 2 |
| **INT-10** | 중간 | `create_invite` 의 "옛 토큰 만료 → 새 토큰" 이 원자적이 아니다. 동시 발급(버튼 두 번 누르기)이면 **쓸 수 있는 초대 링크가 여럿** 남는다. 주석·계약 S13 은 "링크는 늘 마지막 것 하나만 산다" | `int-race-repeat.mjs` R2 | 3회 동시 × 8판 → **2판에서 유효 토큰 2개 이상, 최대 3개**. 유출된 옛 링크를 새 링크 발급으로 무효화할 수 없다는 뜻 |
| **INT-11** | 낮음 | outbox 멱등키가 `notification.id` 라, 내용이 똑같은 알림이 두 줄이면 카톡/푸시도 두 번 나간다 | `int-concurrency.mjs` C6 | 같은 `(user, kind, link, title)` 알림 2행 → outbox +2. (계획서의 "같은 notification id 두 번" 은 구조상 불가능하다 — `notifications.id` 는 PK 이고 트리거는 `after insert` 뿐이다. 실제로 닿을 수 있는 변형이 이 "내용이 같은 두 줄" 이다) |
| **INT-12** | 중간 | `remind_unpaid` 가 `reminded_at` 을 읽고-쓰기라, 동시 두 번이면 같은 학부모에게 안내가 두 번 간다. 20시간 규칙(계약 S11)이 무력화된다 | `int-concurrency.mjs` C7 | 동시 2회 둘 다 성공 → 같은 사람·같은 문구 알림 **2건** |
| **INT-20** | 낮음 | 퇴원(`student_leave`)은 명부·소속·보호자·수강등록만 지운다. 그 학부모의 **푸시 구독·초대 토큰·링크 토큰·묵은 알림**은 남는다 | `int-cascade.mjs` B1 | 퇴원 후 `push_subscriptions 1, invite_tokens 1, link_tokens 2, notifications 1` (link_tokens 는 내가 1개만 넣었다 — 나머지 1개는 점검 중에 `outbox-send` 가 새로 만든 것, INT-39 참고). 토큰 자체는 무해하다 — `invite-login` 은 소속이 없으면 404 `not_in_roster`, `link-login` 은 401 `bad_token` 으로 막는다(코드 읽기). 정리는 `housekeeping()` 이 만료 뒤 7·30일에야 한다 |
| **INT-21** | 중간 | 퇴원한 학생의 미납 청구서가 계속 연체로 뒤집힌다. 원장 수강료 화면의 미납·연체 합계가 영원히 부풀고, 지우는 길은 면제(void)뿐 | `int-cascade.mjs` B1b | 퇴원 뒤에도 `refresh_overdue` 가 1장을 `issued → overdue` 로. `remind_unpaid` 는 받을 사람이 없어 0건(조용히 실패). `listInvoices` 는 학생 상태를 안 거른다 |
| **INT-22** | 중간 | 반에 **휴원일 또는 반 공지**가 걸려 있으면 반을 지울 수 없다. `calendar.class_id`·`notices.target_class_id` 에 `on delete` 규칙이 없다 | `int-cascade.mjs` B2, `int-evidence.mjs` E2 | 막는 순서를 하나씩 받아 적음: ① `violates foreign key constraint "notices_target_class_…"` → 공지를 치우면 ② `… "calendar_class_id_fke…"` → 휴원일을 치우면 ③ 삭제 성공. (뒤가 잘린 것은 내 스크립트가 오류를 90자로 자르기 때문) 그 뒤 `todos·attendance·enrollments` 는 cascade 로 정리된다 |
| **INT-23** | 중간 | 반을 지우면 그 반 요금제가 `class_id=null` 이 되어 **"학원 공통 요금제" 로 둔갑**하고, `issue_invoices` 의 폴백이 그 금액을 **엉뚱한 학생에게 실제로 매긴다** | `int-cascade.mjs` B2, `int-evidence.mjs` E3 | 반 B(90,000원) 삭제 → `fee_plans` 에 `{name:"반B 정규", amount:90000, class_id:null}` 로 남음 → 어떤 반에도 안 든 학생에게 `issue_invoices` → **`amount=90000, total=90000`**. (대조: 공통 요금제가 없을 때 같은 학생은 `amount=0`) |
| **INT-25 / INT-29** | 중간 | `users(id)` 를 가리키는 FK 다수에 `on delete` 규칙이 없어 **계정을 지울 수 없다**. 강사·원장 탈퇴, 개인정보 삭제 요청이 여기서 멈춘다 (0014 는 `payments.recorded_by` 하나만 set null 로 고쳤다) | `int-userdel.mjs` | 막는 컬럼 **9개**: `notes.author_id`, `notices.author_id`, `attendance.marked_by`, `absence_requests.requested_by`, `inquiries.asked_by`, `classes.teacher_id`, `students.user_id`, `outbox.to_user_id`, `audit_log.actor_id`. 통과: 소속만·`payments.recorded_by`·`invite_tokens.created_by`·`notifications`·`link_tokens`·`push_subscriptions`·`guardians`·`notice_reads` |
| **INT-26** | 낮음 | 명부에서 뺀 학부모의 **남은 토큰으로 묵은 알림이 계속 읽힌다**. `notifications` 정책은 `user_id = auth.uid()` 뿐이라 소속을 안 본다 | `int-cascade.mjs` B4 | 소속·보호자 0인데 남은 세션으로 알림 1건("옛 공지 알림") 조회 성공. 학생·학원은 0으로 정확히 막힌다. **앱으로는 안 닿는다** — `session.tsx` 의 `load()` 가 소속이 하나도 없으면 곧장 `signOut()` 하고 문으로 보낸다. 아직 안 만료된 JWT 로 API 를 직접 부를 때만, 그것도 자기 자신의 행만 보인다 |
| **INT-27** | 낮음 | 자녀 둘 중 하나가 퇴원하면 학부모의 `active_membership_id` 가 FK set null 로 비어, **남은 자녀가 있는데도** 아무것도 안 보인다 (앱은 역할 선택 화면으로 돌아간다) | `int-cascade.mjs` B5 | `active_membership_id=null`, 남은 소속 1개, 그 세션이 보는 자녀 0명. 다시 고르기 전까지 `current_academy_id()` 가 null |
| **INT-30** | 중간 | 청구액을 **낸 돈보다 낮게** 고쳐도 상태는 `paid` 그대로고, 돌려줄 돈을 어디에도 적지 않는다 | `int-consistency.mjs` D1 | 100,000 납부 뒤 총액 40,000 으로 하향 → `{total:40000, paid:100000, status:"paid"}`. `recalc_invoice` 는 `s >= total` 이면 paid 라 초과분을 안 본다 |
| **INT-31** | 낮음 | `set_invoice_amount` 가 **음수 총액**을 만든다 (칸마다 음수만 막고 합계는 안 본다) | `int-consistency.mjs` D1b | amount 10,000 − discount 50,000 → `total=-40000`, `status=partial`. 학부모 카드에 −40,000원 |
| **INT-32** | 중간 | **부분 납부한 청구서는 납기가 지나도 연체로 안 바뀐다** (`refresh_overdue` 는 `status='issued'` 만 뒤집는다). `remind_unpaid` 는 나가는데 화면 배지는 "부분 납부" 라 원장이 못 알아본다 | `int-consistency.mjs` D2 | 납기 3일 지남 + 30,000/100,000 납부 → `refresh_overdue` 0장, `status=partial`. `housekeeping()` 의 야간 일괄도 같은 조건이라 영원히 안 바뀐다 |
| **INT-34** | 낮음 | 전액 낸 청구서를 면제하면 청구는 `void` 인데 **납부 기록 10만원은 남아** 그 달 "받은 돈" 집계와 청구서 목록이 어긋난다. 면제 뒤 금액을 고치면 곧장 `paid` 로 되살아난다 | `int-consistency.mjs` D4/D4b | `status=void, total=100000, payments 합계=100000`. `recalc_invoice` 는 void 를 그냥 return |
| **INT-35** | 낮음 | 같은 날에 "전체 휴원" 과 "반 A 휴원" 이 나란히 저장된다 (unique 에 `class_id` 가 끼어 서로 다른 행). 결과는 같지만 원장 목록에 같은 날이 두 줄로 보이고, 하나만 지워도 여전히 쉰다 | `int-consistency.mjs` D5 | `2026-09-24` 에 2행: `전체/전체 휴원`, `반A/반 A 휴원` |
| **INT-36** | 낮음 | 같은 날 `closed` 와 `special` 이 공존해도 우선순위 규칙이 없다. `closedFor()`/`nextClassDaysFor()` 는 `closed` 합집합만 보므로 "휴원인데 특강" 인 날이 학부모 화면에서 그냥 쉬는 날 | `int-consistency.mjs` D5 (코드 읽기) | `2026-09-24: closed+closed+special`. `app/src/lib/api.ts` `closedFor` 는 `kind='closed'` 만 |
| **INT-38** | 중간 | 공지를 지워도 그 공지를 가리키는 **알림·발송 줄이 남는다**. 종에서 누르면 없는 공지로 가고, 아직 안 보낸 줄은 지워진 공지를 알리며 나간다 | `int-consistency.mjs` D7 | 삭제 뒤 notifications 1행(`link=notice-view:<지워진 id>`), outbox 1행(`link_ref` 가 없는 공지). `notifications.link` 는 문자열, `outbox.link_ref` 는 FK 없는 uuid 라 아무도 안 치운다. `todos.notice_id` 만 set null 로 정리된다 |
| **INT-39** | 중간 | 퇴원 **직전에 줄에 선 알림톡이 퇴원 뒤에 그대로 나간다**. 이미 관계가 끊긴 학부모가 아이 결석 알림을 받고, 발송기는 그 사람 앞으로 7일짜리 링크 토큰까지 새로 만든다 | `int-consistency.mjs` D8 | `student_leave` 뒤 outbox `status=sent`, `link_tokens 0→1`(만료 2026-09-11). `outbox_claim`·`outbox-send` 는 `to_user_id` 의 소속을 다시 안 본다. 토큰 자체는 무해 — `link-login` 이 소속 없으면 401 |

### 묶어 보면

1. **돈에 상한이 없다** (INT-02·03·04·30·31·34) — `record_payment` 는 금액을, `set_invoice_amount` 는 합계를 검사하지 않는다. 수기 모드라 오타가 곧 데이터다.
2. **읽고-쓰기로 만든 "한 번만" 규칙 셋이 동시 요청에 무너진다** (INT-01·10·12) — 청구서 한 번, 초대 링크 하나, 안내 20시간. 셋 다 버튼을 두 번 누르면 재현된다.
3. **사람을 빼는 동작이 뒤를 못 친다** (INT-20·21·25/29·26·27·39) — 퇴원·명부 제외·계정 삭제가 각각 다른 것을 남긴다.
4. **가리키는 것이 사라져도 가리킨 쪽이 안 지워진다** (INT-22·23·38) — 반·공지를 지우는 길에 FK 규칙이 뒤죽박죽이다(`cascade` / `set null` / 규칙 없음이 섞여 있다). 이 중 INT-23 은 **잘못된 금액이 실제 청구서에 찍히는 것까지 확인**됐다.

---

## 버틴 것

표 수준의 방어는 밀어붙여도 뚫리지 않았다.

| 무엇 | 어떻게 확인 |
|---|---|
| `invoices` unique `(student_id, period_ym)` | `issue_invoices` 5회 동시 × 8판 → 청구서 수가 8판 모두 정확(2장). 중복 발행 0 |
| `attendance` unique `(student_id, class_id, date)` + upsert | 같은 학생·날짜 3회 동시 저장 → **행 1개, 알림 1건, 줄 1개**. 트리거의 `old.status is distinct from new.status` 가 중복 알림을 막았다 |
| `calendar` unique `nulls not distinct` | 겹치는 기간·동시 `addCalendar` 모두 중복 행 0 |
| `outbox.idempotency_key` | 알림 하나당 줄 하나. 트리거 재발화로 인한 중복은 없었다 |
| `todo_done` cascade | 할 것을 지우면 체크 기록도 같이 사라짐(고아 0) |
| `roster_remove_teacher` (0012) | `teacher_id`·`teacher_phone` **둘 다** 풀린다. 9주차에 고친 자리가 그대로 유지됨 |
| 형제 할인 재계산 | 형제 하나가 퇴원한 뒤 다음 달 청구 → 남은 아이 `discount=0`. `shared` CTE 가 활성 학생만 보므로 정상 |
| `refresh_overdue` 의 KST 경계 | 납기=오늘(KST) → `issued` 유지, 납기=어제 → `overdue`. `due_date < (now() at time zone 'Asia/Seoul')::date` 정확 |
| 퇴원 뒤 기록 보존 | 청구서·납부·출결·결석신청·메모·`todo_done` 전부 남음(의도대로), 명부·소속·보호자·수강등록만 삭제 |
| 명부에서 뺀 학부모의 RLS | 남은 세션으로 학생 0건·학원 0건 (알림만 샌다 → INT-26) |
| 토큰 재검사 | `invite-login` 은 소속 없으면 404 `not_in_roster`, `link-login` 은 401 `bad_token`. 퇴원 뒤 남은 토큰이 세션으로 이어지지 않는다 (코드 읽기) |
| 학원 삭제 cascade | 점검이 끝난 뒤 `rt-int-*` 학원·`rtint-*` 사용자·딸린 행 **전부 0** |

---

## 돌리지 않고 읽기만 한 것

셋 다 **학원 단위가 아니라 DB 전체**에 작용해서, 다른 에이전트와 씨앗 학원(`yeongeo`)까지 건드리게 되므로 실행하지 않았다.

**`housekeeping()`** — 학원 조건이 없다. `otp_codes`·`link_tokens`·`invite_tokens`·`notifications`·`outbox`·`client_errors` 를 전역으로 지우고, 마지막 줄의 `update invoices set status='overdue'` 도 전역이다. `service_role` 에만 grant 되어 있고 `cron.schedule('housekeeping-daily', '0 19 * * *')` 로 하루 한 번 돈다(pg_cron 은 UTC → KST 새벽 4시). 그 마지막 줄은 `refresh_overdue` 와 같은 `status='issued'` 조건이라 **INT-32(부분 납부 연체)를 야간 일괄로도 못 고친다**.

**`outbox_claim(n)`** — 전역이라 부르면 다른 에이전트의 줄까지 잡아 `attempts` 를 올리고 `next_attempt_at` 를 5분 뒤로 민다. 읽어 본 결론: 단일 `UPDATE … FROM (select … for update skip locked)` 이라 **동시 이중 claim 은 막힌다**. 이중 발송이 열리는 자리는 다른 데다 — ① 대행사 호출이 5분을 넘기면 아직 `queued`/`failed` 인 그 행을 다음 틱이 다시 잡는다, ② `outbox-send` 가 상태를 **대행사 호출 뒤에** 쓰므로 그 사이에 함수가 죽으면 이미 나간 메시지가 재시도된다. 즉 설계상 at-least-once 이고, 진짜 멱등은 대행사 쪽에 없다. `outbox_tick()` 도 같은 이유로 부르지 않았다.

**`closedFor()` 우선순위** — 순수 함수라 코드로만 봤다. 전체 휴원과 반 휴원의 합집합일 뿐이고 `special`(특강)이 `closed` 를 되돌리는 규칙은 없다(INT-35·36).

---

## 점검 범위 밖이지만 눈에 걸린 것

- `tools/cleanup-test-data.mjs` 의 slug 목록에 `rt-int-`·`race-`·`casc-` 같은 이번 접두어가 없다. 이번 점검은 자기 뒷정리를 따로 했지만(`int-cleanup.mjs`), 앞으로 적대적 점검을 더 돌리면 목록을 늘리거나 접두어 규칙을 하나로 모으는 편이 낫다.
- 계정 삭제를 막는 FK 9개(INT-29)는 `cleanup-test-data.mjs` 가 **학원을 먼저 지우기 때문에** 지금은 드러나지 않는다. 학원을 남긴 채 사람만 빼는 진짜 탈퇴 흐름에서 처음 터진다.
