# 레드팀 — 보안 (2026-09-04)

대상: Supabase Postgres + RLS + security-definer RPC + Deno Edge functions (호스티드 dev).
방식: 슬러그 접두사 `rt-sec-` 로 학원 2개(+전체 역할 캐스트)를 만들어 실제 dev DB·배포 Edge 함수에 공격.
스크립트: `tools/redteam/sec-*.mjs` (공통 셋업/정리 `tools/redteam/_common.mjs`).
실행: 리포지토리 루트에서 `node --env-file=.env.local tools/redteam/sec-<name>.mjs`.
정리: 모든 `rt-sec-` 학원·사용자·행 삭제 완료(사전 존재 사용자 `01027528411` 은 실제 소속이 있어 손대지 않음). 실 학원 `yeongeo-jip`·시드 `yeongeo` 미접촉.

## 발견 (findings)

| ID | 심각도 | 무엇 | 재현 | 증거 |
|----|--------|------|------|------|
| RT-1 | 중간 | `recalc_invoice(uuid)` 가 **아무 authenticated 사용자에게 실행 허용**됨 + 함수 본문에 역할/학원 검사 **없음** → 테넌트 경계를 넘는 청구서 상태 조작. 0014 의 `revoke execute … from public, anon` 이 `authenticated` 를 빠뜨렸고(다른 service_role 전용 함수들은 `… from public, anon, authenticated`), 본문은 `select * from invoices where id=p_invoice` 만 하고 `current_role_()`/`current_academy_id()` 를 보지 않는다. | `sec-rpc-audit.mjs` (authenticated 호출 성공 확인) + 크로스테넌트 변이 재현: 학원 A 의 **학부모**가 학원 B 의 청구서(UUID 지정)에 `recalc_invoice` 호출 → `paid`→`overdue` 로 바뀜 | `authenticated CALLED recalc_invoice!` / `before: paid` → `recalc error: NONE` → `after: overdue (cross-academy invoice mutated by a foreign parent)` |
| RT-2 | 낮음 | `client_errors` INSERT 정책이 `user_id = auth.uid()` **만** 검사 → 크기 상한·발송 제한·`academy_id` 검증이 전혀 없다. 로그인한 사용자가 ~400KB 행을 반복 삽입하고 **남의 학원 id 로 태깅**할 수 있다(로그 오염·스토리지 팽창). SELECT 정책이 없어 `.insert().select()` 로는 성공이 가려지므로 서비스키 카운트로 확인. | `sec-edge.mjs` | `client_errors: parent landed 8/8 rows of ~400KB EACH tagged with a FOREIGN academy_id (no size cap, no rate limit, academy_id unvalidated)` (별도 프로브: 15/15 연속 삽입 성공, foreign academy 태그 16행) |
| RT-3 | 낮음 | `list_public_tables()` 가 **SECURITY DEFINER 인데 `set search_path` 가 없다**(0001). 게다가 revoke 가 없어 `anon`·`authenticated` 모두 호출 가능 → public 테이블 이름 31개 노출(스키마 정보 공개 + definer search_path 모범사례 위반). | `sec-rpc-audit.mjs` | `list_public_tables callable by ANON -> leaks 31 table names; SECURITY DEFINER without set search_path` |

권고(수정은 Fable 담당): RT-1 = `revoke execute on function recalc_invoice(uuid) from authenticated;` **그리고** 본문에 `if not is_staff() or inv.academy_id <> current_academy_id() then raise …` 추가(방어 심층화). RT-2 = INSERT 정책/트리거에 message·stack 길이 상한, `academy_id` 를 `current_academy_id()` 로 강제(또는 nullable 유지 시 무시), 시간당 행 수 제한. RT-3 = `set search_path = public` 추가 + `revoke execute … from anon, authenticated`(검사 스크립트는 service_role 로).

## 버텨 낸 것 (held) — 요약

- **크로스학원 원장 JWT** 로 상대 학원 id 를 넣어 호출: `issue_invoices`/`record_payment`/`void_invoice`/`set_invoice_amount`/`remind_unpaid`(모두 `current_academy_id()` 필터로 `not found`), `roster_save_student`/`student_leave`/`makeup_attended`/`assign_class_teacher`/`create_invite`(`not in roster`)/`student_timeline`/`roster_of_student`/`month_attendance` — 전부 거절·빈결과, 대상 학원 데이터 불변. (`sec-billing.mjs`, `sec-manage.mjs`)
- **학부모 JWT 로 모든 원장/스태프 RPC**: `issue_invoices`·`record_payment`·`void_invoice`·`set_invoice_amount`·`remind_unpaid`·`refresh_overdue`·`roster_save_student`·`roster_save_teacher`·`roster_remove_teacher`·`student_leave`·`assign_class_teacher`·`create_invite`·`roster_entry_status`·`list_teachers`·`roster_of_student`·`student_timeline`·`makeup_attended` — 전부 거절/빈결과. (`sec-billing.mjs`, `sec-manage.mjs`)
- **PostgREST 직접 읽기**: 학부모가 남의 자녀·상대 학원 `invoices`/`payments`/`students`/`attendance`/`absence_requests`/`inquiries`/`notes` 조회 → 빈결과. 강사(반 A 담당)가 반 B 의 학생·출결·메모·할것·타임라인 읽기/쓰기 → 차단. (`sec-scope.mjs`)
- **`my_invoice`** 는 `p_ym` 만 받고 `my_student_ids()` 로 좁혀 다른 형제/가족을 지목할 수 없음. **`month_attendance`/`week_attendance`/`student_timeline`** 도 `my_student_ids()`/`staff_student_ids()` 로 스코프. (`sec-billing.mjs`, `sec-scope.mjs`)
- **`push_subscriptions`**: 남의 `user_id` 로 insert 불가, 남의 endpoint 조회·수정·삭제 불가(본인 것만). (`sec-push.mjs`)
- **비밀 테이블 직접 읽기**(`roster_phones`/`link_tokens`/`otp_codes`/`invite_tokens`/`outbox`/`audit_log`): authenticated·anon 모두 빈결과(정책 없음 → 서비스키 전용). (`sec-manage.mjs`)
- **`users` 열 단위 grant**: 학부모가 자기 행의 `phone`·`active_membership_id` 변경 불가(0010 의 `grant update (name, prefs)`), 남의 행 변경 0행. `set_active_membership(남의 membership)` 거절 → 과거 권한상승 구멍 재발 없음. (`sec-manage.mjs`, `sec-rpc-audit.mjs`)
- **`invite-login`**: 빈/짧은/31·33자/대문자/비-hex/SQL/미지의 32-hex 토큰 → 401. 정상 토큰 세션 발급, 10분 내 재사용 허용, **10분 초과 재생 → `used` 401**, 만료 토큰 → `expired`, **명부에서 빠진 번호의 토큰 → 404 `not_in_roster`**. (`sec-tokens.mjs`)
- **`link-login`**: 잘못된 토큰 401; `resolve:true` 는 **토큰 소유자 본인의 소속만** 반환(타 학원 소속 유출 없음, `user_id` 매핑 정확). (`sec-tokens.mjs`)
- **`otp-send` 레이트리밋**: 10분당 3건으로 상한(4번째 429), 실제 insert 3건. 형식 변형(대시·공백)은 정규화 후 같은 버킷이라 그대로 제한, `+82` 변형은 다른(명부에 없는) 번호로 정규화돼 404·insert 0. (`sec-otp.mjs`)
- **`otp-verify`**: 오답 시 `attempts` 증가·5에서 잠금, 잠금 후 정답도 `no_code`. **개발용 고정코드**는 DEV_OTP_PHONES 밖 번호를 인증하지 못함(임의 6자리 3개 시도 모두 거절 — 브루트포스 아님). (`sec-otp.mjs`)
- **`export-academy`**: 학부모·강사 JWT → 403 `director_only`, 무토큰·잘못된 토큰 → 401, 원장만 200. (`sec-edge.mjs`)
- **`outbox-callback`**: 키 없음/오키 → 401 `bad_key`. (`sec-edge.mjs`)
- **Storage 버킷**: 다른 학원 학부모가 `notices` 의 상대 학원 폴더 다운로드·목록 불가, `notices` 쓰기(스태프 전용)·`logos` 쓰기(원장 전용)를 자기/상대 학원 경로 모두에서 거절(경로 첫 폴더 = `current_academy_id()` 검사). (`sec-edge.mjs`)
- **grant-게이트 서비스 함수**: `outbox_claim`/`outbox_tick`/`housekeeping`/`link_teacher_classes` 는 authenticated·anon 모두 `42501 permission denied`. **`public_academy`** 는 anon 에게 `name,brand_color,logo_path` 만 노출. (`sec-rpc-audit.mjs`)

## 코드 리뷰(정적) 메모

- security definer 함수 중 `set search_path` 누락은 **`list_public_tables()` 하나뿐**(RT-3). 나머지 헬퍼·RPC(`current_*`, `roster_*`, billing, `makeup_attended`, `link_teacher_classes` 등)는 모두 `set search_path = public` 고정.
- 대부분의 RPC 는 `current_role_()`/`current_academy_id()`/`is_staff()` + 대상 행의 `academy_id = current_academy_id()` 재확인으로 이중 방어. **예외가 RT-1(`recalc_invoice`)** — 유일하게 본문 가드가 없고 grant 도 새어 실제 침투 가능.
