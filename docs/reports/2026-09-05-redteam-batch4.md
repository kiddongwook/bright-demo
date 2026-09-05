# 레드팀 — 4차 묶음 (2026-09-05)

대상: 0026 동의 · 0027 공지 예약 발송 · 0028 수강료 자동화 · 0029 주간 요약 · T1 잠금(otp-send/link-login/invite-login/otp-verify) · 0025 워드마크 칸. 계획서 `docs/superpowers/plans/2026-09-05-batch4.md` "검증" 절의 레드팀 항목.
방식: 슬러그 접두사 `rt-b4-` 학원(원장·강사(C1 담당)·학부모1(S1∈C1)·학부모2(S2∈C2), 학부모 전원 푸시 구독) 여러 개를 호스티드 dev DB 에 만들고, 학부모·학생·강사·다른 학원 원장·anon·service_role JWT 로 실제 PostgREST·RPC·Storage·배포 Edge 함수를 공격했다. 크론 함수(`publish_due_notices`·`billing_tick`·`weekly_summary_for`)는 service_role 로 직접 불렀다.
스크립트: `tools/redteam/rt-batch4.mjs`(러너) → `rt-batch4-notices.mjs` · `rt-batch4-billing-weekly.mjs` · `rt-batch4-locks-consent-wordmark.mjs`, 공통 `b4-lib.mjs`.
실행: `cd tools && node --env-file=../.env.local redteam/rt-batch4.mjs 2>&1 | grep -v 'Assertion failed'` (세 판 합계 **167 PASS · FINDING 줄 16개** — B4-N2 는 역할 셋×2 로 6줄, B4-W2 는 B4-L9 와 같은 원인 — 원인별로 묶으면 아래 **10건**).
비용 안전장치: `otp-send` 는 403 이 예상되는 번호(잠긴 학원)에만 불렀고 `otp_codes` 행이 안 생긴 것을 확인했다(문자 0건). 로그인은 `otp_codes` 를 직접 심어 `otp-verify` 로. 시험 학부모 전원에 `.invalid` 끝점 푸시 구독을 심어 알림톡 줄이 서지 않게 했고, 알림을 만든 뒤에는 그 학원의 `outbox` 를 곧바로 읽고 지웠다(크론 발송기가 집어 가지 않게).
정리: 세 스크립트 모두 `finally` 에서 학원(cascade)·사용자·저장소 객체·`otp_codes`·`link_tokens`·시험용 `app_operators` 를 지웠다. 러너를 끝까지 돌린 뒤 확인 — `rt-b4-%` 학원 0, 시험 사용자 0, 최근 1시간 outbox 0, `notices/` 저장소 폴더 0, `logos/` 폴더는 `yeongeo`·`yeongeo-jip` 둘만, `app_operators` 는 기존 운영자 1명만. `otp_codes` 에 `0109…` 두 번호의 미사용 행 3개(14:02 UTC, users·명부 없음)가 남아 있는데 이 스크립트가 심은 코드는 전부 `otp-verify` 가 소비해 `used_at` 이 찍히고 정리에서 지워지므로 **다른 점검의 잔여물**이다 — 손대지 않았다(`housekeeping()` 이 24시간 뒤 지운다). **`yeongeo`·`yeongeo-jip` 미접촉.**
실행하지 못한 것(코드로만 판단): DB 시계를 못 바꾸므로 pg_cron 의 실제 시각(매분·00:00 UTC·매시 정각)·월 경계·28일짜리 달은 함수 본문을 읽어 적었다. `billing_day` 29~31 분지는 `billing_rules_billing_day_check (1..28)` 때문에 **닿을 수 없는 코드**임을 실제 upsert 거절로 확인했다.

## 요약

| ID | 심각도 | 표면 | 상태 |
|----|--------|------|------|
| B4-N2 | **높음** | Storage `notices` 버킷 읽기 정책 — 예약(미발행) 공지 사진을 학부모·학생이 발행 전에 내려받고, 공지 id 폴더 목록도 본다 | 닫힘 · 0030 |
| B4-L9 | **높음** | `academies_write` 에 열 제한이 없다 — 잠긴 학원의 원장이 남은 세션으로 `locked=false` 를 직접 써서 이용 정지를 스스로 푼다 (`weekly_last_at`·`slug` 등도 같은 길) | 닫힘 · 0030 |
| B4-B5 | 중간 | `billing_tick` 자동 미납 안내 — 문턱(납기+N일·6일 간격)은 "그 달에 하나라도" 만 보고, `remind_unpaid_for` 는 그 달 미납 **전부**에 20시간 규칙으로 보낸다 → 아직 납기 전인 청구서·이틀 전 안내한 사람에게도 나간다 | 닫힘 · 0030 |
| B4-L4 | 중간 | 잠금은 로그인 게이트일 뿐 — 두 학원에 속한 사람이 열린 학원으로 들어와 `set_active_membership(잠긴 학원 소속)` 으로 갈아타면 잠긴 학원 데이터를 그대로 읽는다 | 닫힘 · 0030 |
| B4-L7 | 중간 | `link-login` 응답 `memberships` 에 잠긴 학원 소속이 그대로 온다 (`_shared/auth.ts listMemberships` 는 거르는데 link-login 은 자체 질의) | 닫힘 · 0030 묶음 (Edge `link-login` 재배포) |
| B4-W4 | 낮음 | 주간 요약 dedupe 키가 제목(`이번 주 <이름> 요약`) — 같은 이름 자녀 둘(쌍둥이)이면 둘째 요약이 안 간다 | 닫힘 · 0030 |
| B4-D8 | 낮음 | `notices_guard_schedule` 은 UPDATE 만 — 원장이 PostgREST INSERT 로 `publish_at=9999-12-31`(90일 검사 우회) 또는 `fanned_at` 미리 찍은 공지를 만든다 | 닫힘 · 0030 |
| B4-S3 | 낮음 | `create_notice_v2(p_publish_at='-infinity')` 가 `publish_at=-infinity` 로 저장된다(즉시 뿌려짐, 정렬·표시 이상). `reschedule_notice` 는 `now()` 로 고쳐 쓰는데 create 는 원값 저장 | 닫힘 · 0030 |
| B4-N4 | 낮음 | 0021/0027 공지 헬퍼(`notice_class_ids`·`notice_visible_to` 등)가 기본 PUBLIC execute — anon 도 공지 id 만 알면 대상 반 id·"이 사람이 볼 수 있나" 를 묻는다 (내용 유출은 없다) | 닫힘 · 0030 |
| B4-M1 | 낮음 | `wordmark_path`/`wordmark_dark_path`/`logo_path` 에 아무 문자열이나 저장된다(다른 학원 경로·외부 URL·`javascript:`·태그). 클라이언트 `logoUrl` 이 `getPublicUrl` 로 감싸 늘 자기 버킷 URL 이 되어 **XSS/URL 주입은 안 된다** — 위생 | 닫힘 · 0030 |

높음 2 · 중간 3 · 낮음 5. 확인된 것(문제 없음)은 맨 아래.

**마감 (2026-09-05):** 열 건 모두 `supabase/migrations/0030_batch4_hardening.sql` 로 닫았다(B4-L7 은 `supabase/functions/link-login/index.ts` 가 `_shared/auth.ts listMemberships` 를 쓰도록 — 재배포 필요). B4-L4 (c) 로 `current_membership()` 이 잠긴 학원 소속을 null 로 돌리므로 0023 문서의 "이미 로그인한 세션은 끊지 않는다" 는 "잠기는 순간부터 그 학원 데이터를 못 읽는다" 로 바뀐다(`docs/ops/operator.md` 갱신 필요). 레드팀 스크립트 `rt-batch4-*.mjs` 는 열 건을 FINDING → PASS 로 바꿔 두었다(재실행은 0030 push·link-login 배포 뒤).

---

## B4-N2 (높음) — 예약 공지 사진이 발행 전에 내려온다 (Storage 정책)

**무엇.** 0011 의 storage 정책 `notices_read` 는 `bucket_id='notices' and foldername[1] = current_academy_id()` 만 본다 — 공지 행의 RLS(`notice_visible_of`, 0027 이 예약 조건을 넣은 곳)를 지나지 않는다. 그래서 0027 이 `notices`·`notice_targets`·`notice_reads`·`notice_readers`·`notice_visible_to` 를 모두 막아도 **사진은 그대로 열려 있다.** 같은 이유로 대상이 아닌 반의 공지 사진도 원래부터 내려왔다(0011 부터 있던 구멍이 예약 발송으로 더 아프게 됐다).

**재현** (`rt-batch4-notices.mjs` [1]).
1. 원장 `create_notice_v2(title, body, [C1], now()+1h)` → 공지 N(예약).
2. 앱과 같은 자리 `notices/<academy_id>/<N>/1.png` 에 사진 업로드, `notices.photos=[path]`.
3. 학부모1(대상)·학부모2(비대상)·학생1 JWT 로
   `storage.from('notices').list('<academy_id>')` → 폴더 목록에 `<N>` 이 보인다;
   `storage.from('notices').download('<academy_id>/<N>/1.png')` → **200, 70 bytes.**
   같은 시각 `notices`·`notice_targets` select 는 0행(공지 본문은 막힘).
4. 다른 학원 원장·anon → 목록·내려받기 모두 거절(학원 경계는 지켜진다).

**영향.** 예약해 둔 공지(시험 결과·행사 사진 등)를 발행 전에 학원의 어느 학부모·학생이라도 볼 수 있다. 폴더 목록으로 공지 id 를 모두 열람하므로 uuid 를 알 필요도 없다. 비대상 반 공지 사진도 마찬가지.

**고치는 방향.** `notices_read` 를 공지 단위로:
```sql
create policy notices_read on storage.objects for select using (
  bucket_id = 'notices'
  and (storage.foldername(name))[1] = public.current_academy_id()::text
  and public.notice_readable(((storage.foldername(name))[2])::uuid));   -- 0021 notice_readable → notice_visible_of (예약·대상 반 검사 포함)
```
폴더 목록(`list('<academy_id>')`)은 스태프에게만 열거나, 앱이 목록을 안 쓰므로 정책에서 `(storage.foldername(name))[2] is not null` 을 요구해 학원 루트 목록을 막는다. uuid 캐스트 실패에 대비해 `[2] ~ '^[0-9a-f-]{36}$'` 검사를 앞에 둔다.

## B4-L9 (높음) — 원장이 자기 학원의 잠금을 푼다 (`academies_write` 열 제한 없음)

**무엇.** `academies_write`(0002) 는 `for update using (id = current_academy_id() and current_role_()='director')` 이고 열 단위 grant 가 없다. 0023 이 `locked`, 0029 가 `weekly_last_at` 을 같은 표에 얹으면서 **운영자 전용 칸이 원장이 쓸 수 있는 표에 들어갔다.** 0010 이 `users` 에서 같은 문제를 열 grant 로 고친 전례가 있다.

**재현** (`rt-batch4-locks-consent-wordmark.mjs` [7]; 같은 원인을 `rt-batch4-billing-weekly.mjs` [6] 이 `B4-W2` 로도 찍는다 — 원장이 `locked=true`·`weekly_last_at=null` 을 직접 씀).
1. 원장 세션을 하나 열어 둔다(잠금은 세션을 끊지 않는다 — 0023 문서대로).
2. 운영자 `op_set_lock(L, true)`. 원장 `otp-send` → 403 (정상).
3. 그 원장 세션으로 `supabase.from('academies').update({ locked: false }).eq('id', L)` → **통과**, `academies.locked=false`.
4. 원장 번호로 `otp-verify`(코드 심어서) → **200** — 실제로 다시 들어온다.
(강사·학부모·다른 학원 원장은 같은 update 가 0행/거절 — 원장만 된다.) 같은 길로 `weekly_last_at=null`(이번 주 요약 재발송), `slug`·`created_at` 도 바뀐다.

**영향.** 운영자의 이용 정지가 원장 상대로는 강제력이 없다. 원장은 잠금 직전까지 앱을 쓰던 사람이라 세션이 있을 확률이 높다.

**고치는 방향.** 열 grant(0010 방식):
```sql
revoke update on academies from anon, authenticated;
grant update (name, brand_color, logo_path, wordmark_path, wordmark_dark_path, weekly_summary, weekly_dow, weekly_hour) on academies to authenticated;
```
또는 0027 의 `notices_guard_schedule` 과 같은 꼴로 `before update` 트리거에서 `current_user='authenticated'` 이고 `locked`·`weekly_last_at`·`slug` 가 바뀌면 거절. 두 겹이면 더 좋다.

## B4-B5 (중간) — 자동 미납 안내가 그 달 미납 전부에게 나간다

**무엇.** `billing_tick` 의 미납 분지는 `exists(… due_date + after_days <= today and (reminded_at is null or < now()-6d) …)` 로 **그 달에 조건 맞는 청구서가 하나라도 있으면** `remind_unpaid_for(academy, mon)` 을 부른다. 그런데 `remind_unpaid_for`(0018 본문 그대로)는 그 달의 `issued/partial/overdue` **전부**를 `reminded_at is null or < now()-20h` 로 갱신·발송한다 — 납기 조건도 6일 조건도 없다. 계획서 문구 "납기 + after_days 지난 미납은 안내 … 첫 안내 → 이후 매주 한 번" 이 지켜지지 않는다.

**재현** (`rt-batch4-billing-weekly.mjs` [5] cadence). 학원 하나, `auto_remind=true, after_days=3`, 같은 달 청구서 넷:
A 납기 10일 전·`reminded_at`=2일 전 / B 납기 4일 전·안내 없음 / C 납기 **5일 뒤** / L 퇴원생 납기 10일 전.
`billing_tick()` → `reminded=3`, 알림 받은 사람 **A·B·C** (L 만 제외). 원장 알림 "미납 3명에게 안내를 보냈어요". 계획대로면 B 한 명.

**영향.** 청구서를 받은 지 며칠 안 된 학부모가 "수강료 안내 · 남은 금액 …" 를 미납 독촉처럼 받고, 이틀 전 안내 받은 사람이 또 받는다(주 1회 약속이 학원 안의 다른 청구서 때문에 깨진다). 안내는 푸시 전용(`kind='billing'` → `NOTIFY`, 알림톡 없음)이라 비용은 없지만 학부모 신뢰 문제.

**고치는 방향.** 크론용 본체에 필터를 넘긴다 — 예: `remind_unpaid_for(p_academy, p_ym, p_due_before date default null, p_min_gap interval default '20 hours')` 를 만들고 UPDATE 의 WHERE 에 `and (p_due_before is null or i.due_date <= p_due_before) and (i.reminded_at is null or i.reminded_at < now() - p_min_gap)` 을 더한 뒤, `billing_tick` 이 `remind_unpaid_for(r.academy_id, mon, today - r.auto_remind_after_days, interval '6 days')` 로 부른다. 원장 수동 버튼(`remind_unpaid`)은 기본값으로 지금 동작 그대로.

## B4-L4 (중간) — 두 학원 사람은 잠긴 학원 데이터를 계속 읽는다

**무엇.** 잠금은 Edge 로그인 세 경로에서만 검사한다. `set_active_membership(m)`(0002) 은 `memberships.user_id = auth.uid()` 만 보고, RLS 헬퍼 `current_membership()` 도 `academies.locked` 를 보지 않는다. 자기 소속 id 는 `memberships_self` 정책으로 읽을 수 있다.

**재현** (`rt-batch4-locks-consent-wordmark.mjs` [7]). 학부모 P 가 잠긴 L 과 열린 U 양쪽 명부에 있다.
1. `otp-verify`(P) → 200, `memberships` 는 U 만(정상).
2. 그 세션으로 `set_active_membership(P 의 L 소속 id)` → **통과**.
3. `students` select → **잠긴 학원 L 의 학생 1명** 조회.

**영향.** 0023 문서는 "이미 로그인한 세션은 끊지 않는다" 를 인정하지만, 이 경로는 **잠긴 뒤 새로 얻은 세션**으로도 잠긴 학원을 쓴다(원장이 다른 학원 학부모이기도 하면 원장 권한 그대로). 잠금이 '이용 정지' 를 뜻한다면 구멍이다.

**고치는 방향.** `set_active_membership` 에 `and not exists (select 1 from academies a join memberships m on m.academy_id = a.id where m.id = $1 and a.locked)` 검사(`academy_locked` 예외). 더 나아가 `current_membership()` 이 잠긴 학원 소속이면 null 을 돌려주면 남은 세션까지 즉시 막힌다(문서 "세션은 끊지 않는다" 를 바꿔야 함 — 결정 사항).

## B4-L7 (중간) — `link-login` 이 잠긴 학원 소속을 응답에 싣는다

**무엇.** `link-login/index.ts` 는 `admin.from('memberships').select(... academies(name) ...)` 로 직접 소속을 만든다. `_shared/auth.ts listMemberships` 의 `academies(locked)` 필터가 없다. 잠긴 학원의 링크 자체는 403 으로 잘 막힌다(토큰의 `academy_id` 만 검사).

**재현.** 위 P 에게 열린 학원 U 의 링크 토큰 → `link-login` 200, 응답 `memberships` **2개(L 포함)**. `otp-verify`·`invite-login` 은 같은 P 에게 U 만 준다.

**영향.** 앱 역할 선택 화면에 잠긴 학원이 그대로 뜨고, 고르면 B4-L4 의 길로 들어간다. 세 경로의 응답이 서로 다르다.

**고치는 방향.** `link-login` 에서 `listMemberships(admin, u.id)` 를 쓰고, `inAcademy` 계산도 그 결과로.

## B4-W4 (낮음) — 같은 이름 자녀 둘이면 주간 요약 하나가 빠진다

**무엇.** `weekly_summary_for` 의 "같은 주에 두 번 부르면 건너뛰기" 가 `(user_id, academy_id, kind, title, created_at >= 월요일)` 이고 title 이 `'이번 주 ' || 이름 || ' 요약'` 이다. 학생 id 가 아니라 이름이 키다.

**재현** (`rt-batch4-billing-weekly.mjs` [6]). 학부모 하나에 이름이 같은 자녀 둘(다른 반) → `weekly_summary_for` 뒤 그 학부모 알림 **1건**.

**고치는 방향.** 링크를 `'child:' || m.student_id` 로 두고 dedupe 를 `link` 로 하거나, 존재 검사에 `body`/`student_id` 를 쓴다. (`link` 를 바꾸면 `trg_notification_outbox` 의 `r`(link_ref) 가 학생 id 가 되는데 `WEEKLY` 가지는 `r` 을 안 쓴다.)

## B4-D8 (낮음) — INSERT 길은 예약 칸을 지키지 않는다

**무엇.** `notices_guard_schedule` 은 `before update` 다. `notices_write` 정책은 insert 도 허용하므로 원장(또는 담당 강사)이 PostgREST 로 직접 넣으면 `create_notice_v2` 의 90일 검사·`fanned_at` 통제를 건너뛴다.

**재현** (`rt-batch4-notices.mjs` [2] 끝). 원장 `insert into notices (…, publish_at='9999-12-31')` → **저장** (`fanned_at=null`, 크론 인덱스 `notices_due` 에 영원히 남는다). `insert (…, fanned_at=now())` → 저장, 알림 0건(뿌리기 건너뜀).

**영향.** 자기 학원 안의 일이라 유출은 없다. 영원히 안 나가는 예약 줄이 쌓이고, 화면 "예약 · 9999/12/31" 같은 표시. 위생.

**고치는 방향.** 같은 트리거를 `before insert or update` 로 하고 insert 분지에 `new.fanned_at is not null or new.publish_at > now() + interval '90 days'` 거절. 또는 `notices_write` 를 update/delete 로 좁혀 insert 는 RPC 만.

## B4-S3 (낮음) — `-infinity` 가 그대로 저장된다

**재현** (`rt-batch4-notices.mjs` [3]). 원장 `create_notice_v2(…, p_publish_at='-infinity')` → 저장 `publish_at=-infinity`, 즉시 뿌려짐(과거 규칙). `'infinity'`·9999 년은 `bad_time` 으로 잘 막힌다. `0001-01-01` 도 원값 저장.
**영향.** `publish_at` 정렬에서 맨 끝, 화면에 이상한 날짜. 위생.
**고치는 방향.** `reschedule_notice` 와 같게 — `case when p_publish_at is null or p_publish_at <= now() then now() else p_publish_at end`.

## B4-N4 (낮음) — 공지 헬퍼 함수의 기본 PUBLIC execute

**재현.** anon·다른 학원 원장·학부모 JWT 로 `rpc('notice_class_ids', {nid})` → 대상 반 id 배열 반환(실행으로 확인). `notice_visible_to(nid, uid)` 는 스크립트가 "거절 또는 false" 만 확인했다(둘을 가르지 않음). `notice_readers`·`remind_notice` 는 본문 검사로 거절된다.
**영향.** 공지 id(uuid) 와 사용자 id 를 알아야 하고 내용은 안 나온다 — 정보 노출 최소. 코드 읽기로는 0021 이 `revoke` 없이 `create or replace` 한 헬퍼 전부(`notice_class_ids_of`·`notice_class_ids`·`notice_visible_of`·`notice_visible_to`·`notice_manage_of`·`notice_manage`·`notice_readable`) 와 0027 의 재정의가 같은 상태다(실행으로 확인한 것은 `notice_class_ids` 하나). 앱(`app/src`)은 이 헬퍼들을 직접 부르지 않는다. 2026-09-04 보안 보고서의 RT-3 과 같은 부류.
**고치는 방향.** 헬퍼들에 `revoke execute … from public, anon, authenticated` (정책·security definer 함수 안에서는 소유자로 실행되므로 앱은 영향 없음). 앱이 직접 부르는 것이 있으면 그것만 `authenticated` 에 다시 grant.

## B4-M1 (낮음) — 로고 경로 칸은 모양을 검사하지 않는다

**재현** (`rt-batch4-locks-consent-wordmark.mjs` [8]). 원장이 `wordmark_path` 에 `<다른 학원 id>/wordmark.png`, `https://evil.example/x.png`, `../../object/public/logos/x.png`, `javascript:alert(1)`, `"><img src=x onerror=alert(1)>` 를 차례로 저장 → 전부 **저장됨**.
**클라이언트가 하는 일.** `app/src/lib/logo.ts logoUrl` → `supabase.storage.from('logos').getPublicUrl(path)` → 늘 `<SUPABASE_URL>/storage/v1/object/public/logos/<값>` (태그·따옴표는 퍼센트 인코딩됨, 위 로그 참조). `App.tsx`·`Gate.tsx` 등은 이 문자열을 `<img src>` 에만 넣는다(React 속성 이스케이프). **외부 URL·`javascript:`·XSS 는 성립하지 않는다.** 되는 것은 다른 학원의 공개 로고를 자기 학원 앱바에 띄우는 것뿐이고 자기 학원 사람만 본다. `public_academy` 는 워드마크를 안 준다. 저장소 쓰기는 `logos/<다른 학원>/wordmark.png` 올리기·지우기 모두 RLS 거절(아래 확인 목록).
**고치는 방향(선택).** `check (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/(logo|wordmark|wordmark-dark)\.png$')` 같은 제약, 또는 B4-L9 의 트리거에서 첫 폴더 = `academy_id` 검사.

---

## 확인된 것 (문제 없음)

**예약 공지 (0027)**
- 학부모(대상·비대상)·학생·다른 학원 원장·anon 모두: `notices` select(`eq`·`or`·`ilike` 필터 우회 포함) 0행, `notice_targets` 0행, `notice_reads` insert 거절, `notice_readers` `not allowed`, `notice_visible_to(학부모)` false. 원장·담당 강사는 본다.
- 발행 전 `notifications` 0 · `outbox` 0. `publish_due_notices` 동시 2회 → `1/0`, 이어 1회 → 0. 알림 = 대상(학부모1+학생1) 각 1건, 사람·채널별 `outbox` 1줄(`push`), 알림톡 줄은 푸시 구독자에게 안 섬.
- 원장이 PostgREST 로 `fanned_at` 미리 찍기·`publish_at` 바꾸기·나간 뒤 `fanned_at` 비우기 → 모두 `not allowed`(guard 트리거). 비운 뒤 크론 재호출 0·알림 그대로. 다른 칸(`body`) 갱신은 통과.
- `reschedule_notice`: 다른 학원 원장·학부모·학생·anon 거절(알림 0); C1 담당 강사가 C2 공지 → 거절, C1 공지 → 통과; 91일 → `bad_time`, 89일 → 통과; 과거 시각 → 지금 뿌리고 `publish_at=now()`; 나간 공지 → `already_published`.
- `create_notice_v2` 3인자 호출 통과(모호성 없음)·즉시 뿌림; 9999년·`'infinity'` → `bad_time`; 문자열 쓰레기 → 형 변환 오류; 학부모·학생·anon 거절; 다른 학원 원장이 우리 반 id 로 → 거절.
- `todos.notice_id` 로 걸린 숙제는 설계대로 공지와 따로 보인다(대상 반 학부모만). 숙제 제목에 공지 내용을 적으면 미리 보이는 셈이니 화면 안내 문구로 남길 만하다.

**동의 (0026)**
- 동의 기록 0건인 학부모가 데이터 RPC·표를 그대로 쓴다 — **UX 게이트, 문서화된 허용 범위.** `grep -rln "consents\|my_consent\|accept_terms" supabase/ app/src` → `supabase/` 에서는 0026 만, 앱에서는 `App.tsx`·`lib/legal.ts`·`screens/Consent.tsx`(게이트 화면) 만 — 다른 정책·함수·Edge 가 동의 여부에 기대지 않는다.
- `accept_terms` 빈값·null·`x`·`2026-9-5`·SQL 문자열·`20260905` → `bad_version`; anon → 거절. `2026-13-45`/`9999-99-99` 는 모양만 맞아 통과(앱이 상수로 넘기므로 무해).
- anon·남: `consents` select 0행(user_id 지정해도), 남 이름으로 insert 거절, 본인 update/delete 0행(쓰기 정책 없음), 시도 뒤 행 불변.

**수강료 자동화 (0028)**
- `issue_invoices_for`·`remind_unpaid_for`·`billing_tick`·`weekly_summary_for`·`weekly_summary_tick`: 원장·강사·학부모·anon 모두 `42501 permission denied`.
- `billing_rules` 자동 칸: 원장 upsert 통과, 강사·학부모 갱신 0행, 학부모 읽기 0행. `billing_day=30` → check 거절.
- 같은 날 `billing_tick` 두 번: 발행 2 → 0, 청구서 2장 유지, 원장 알림 1건 유지. 퇴원생 청구서 없음. 발행 알림 `outbox` 는 `push` 만. (발행 뒤 등록한 학생은 다음 tick 에서 1건 발행 + 원장 알림 한 줄 더 — 크론은 하루 한 번이라 실제로는 청구일 09:00 뒤 등록한 학생은 그 달 자동 발행에서 빠져 원장이 수동 발행해야 한다. 설계 한계, 문서화 권고.)
- 미납 안내: 퇴원생 제외, 같은 날 두 번째 tick 0, `reminded_at` 7일 전 → 다시 안내, 3일 전 → 안내 없음(6일 규칙은 "그 청구서가 문턱을 넘는지" 에는 맞게 동작 — B4-B5 는 넘은 뒤 범위 문제). 안내 `outbox` 는 `push` 만(알림톡 0). 문구 `[학원] 9월 수강료 안내 · 남은 금액 100,000원 · 납기 9/1`.
- 두 학원에 자녀가 있는 학부모(코드 읽기, 실행 안 함): `billing_tick` 은 학원별로 돌고 `remind_unpaid_for` 의 받는 사람은 `memberships m where m.academy_id = a and m.student_id = inv.student_id` ∪ `guardians` 라 학원마다 그 학원 청구서로 한 건씩, 제목 앞머리 `[학원]` 으로 구분된다. 다른 학원 청구서가 섞일 길은 없다.

**주간 요약 (0029)**
- `academies.weekly_*`: 강사·학부모·다른 학원 원장 갱신 0행, 원장 통과, `weekly_hour=23`·`weekly_dow=7` check 거절.
- 본문 숫자 = 심은 출결·숙제(`출석 2 · 지각 1 · 결석 0 · 숙제 1/3 · 다음 수업 월 19:00`), 전부 120자 안, `prefs.weekly=false` 학부모 건너뜀, 원장 요약 1건, 같은 주 재호출 0·알림 수 그대로, `WEEKLY` outbox 줄 수 = 알림 수, 전부 `push`, **알림톡 0**.
- 두 학원 학부모: 학원마다 1건, 각각 그 학원 자녀 이름, 다른 학원 학부모에게는 안 감. 학부모는 남의 `weekly` 알림을 못 읽고 본인 `prefs.weekly` 는 끌 수 있다.

**잠금 (T1 · 0023)**
- 잠긴 학원 원장·학부모 `otp-send` → 403 `academy_locked`, `otp_codes` 행 안 생김(문자 0건). 잠긴 학원 원장 `otp-verify` → 403. 잠긴 학원 링크 `link-login`(세션·resolve) → 403. 잠긴 학원 초대 `invite-login` → 403, users 행 안 생김.
- 두 학원 학부모: `otp-verify`·`invite-login` 200, `memberships` 는 열린 학원만(`link-login` 만 예외 — B4-L7).
- 강사·학부모·다른 학원 원장의 `locked=false` 갱신 0행; 학부모 `op_set_lock` → `not_operator`. 잠기기 전 세션은 계속 읽는다(문서대로).

**워드마크 (0025)**
- 강사·학부모 `wordmark_path` 갱신 0행, 원장이 다른 학원 행 갱신 0행. 저장소: 원장이 `logos/<다른 학원>/wordmark.png` 올리기 → RLS 거절, 다른 학원 로고 지우기 0건, 강사가 자기 학원 `logos` 올리기 거절, 원장 자기 학원 올리기 통과. `public_academy` 열은 `name,brand_color,logo_path` 만.
