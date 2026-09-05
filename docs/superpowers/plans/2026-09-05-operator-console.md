# BRIGHT 운영자 화면 Implementation Plan

**Goal:** 운영자(BRIGHT, 사장님)가 명령어 없이 화면에서 학원을 개설·관리한다. 학원 만들기, 원장 초대 링크 발급·재발급, 학원 목록과 상태(학생·들어온 사람·알림 못 받는 사람·이번 달 청구/납부), 학원별 문자 발신키·발신 모드, 잠금(정지)·데이터 내려받기·삭제.

**Architecture:** 같은 PWA 안에 `role='operator'` 로 들어오는 별도 화면 묶음. 운영자 계정은 `app_operators(user_id)` 표로 지정(서비스 키로 등록; 첫 운영자는 사장님 번호). 운영자는 어느 학원의 소속도 아니므로 RLS 는 통과하지 못하고, **운영자 전용 security-definer RPC** 로만 데이터를 본다(`is_operator()` 가드). 화면은 PC 중심(좌측 내비의 "운영" 그룹) 이지만 폰에서도 동작.

## Task 1 (백엔드) — `0023_operator.sql`, tools, tests
- `app_operators(user_id uuid pk references users on delete cascade, created_at)`, `is_operator() returns boolean` (security definer, `auth.uid()` 기준).
- RPC (모두 `is_operator()` 아니면 `raise 'not_operator'`):
  - `op_academies() returns table(id, slug, name, brand_color, logo_path, created_at, locked boolean, students int, parents_entered int, parents_total int, no_push int, invoices_month int, paid_month int, sms_provider text)`.
  - `op_create_academy(p_slug, p_name, p_director_phone, p_director_name, p_brand_color default null) returns table(academy_id uuid, invite_url text)` — `tools/new-academy.mjs` 와 같은 일을 한 트랜잭션에서(academy, roster_phones 원장, invite_tokens 7일). slug 검사 `^[a-z0-9-]{2,40}$`, 중복 시 `slug_taken`.
  - `op_director_invite(p_academy) returns text` — 원장 초대 링크 재발급(옛 토큰 만료).
  - `op_set_lock(p_academy, p_locked)` — `academies.locked` 컬럼 추가; 잠기면 로그인(`otp-verify`/`invite-login`) 이 `academy_locked` 로 거절하고 앱은 "이용이 정지된 학원이에요" 화면.
  - `op_set_sms(p_academy, p_provider text, p_sender_key text)` — `academy_settings(academy_id pk, sms_provider, sms_sender_key_enc)`; 키는 `pgcrypto` 대칭 암호화(비밀값 `SETTINGS_KEY`) 또는 최소한 운영자 RPC 로만 읽기. 발송기는 학원별 키가 있으면 그것을, 없으면 전역 `SMS_PROVIDER` 를 쓴다(`_shared/sms.ts` 어댑터 확장 — 실제 대행사 어댑터는 3단계 그대로 `http`).
  - `op_delete_academy(p_academy, p_confirm_slug)` — slug 를 다시 받아 맞을 때만 cascade 삭제 + 저장소 접두어 비우기는 Edge `op-delete` 로(스토리지는 SQL 로 못 지움) 또는 `tools/pilot-reset.mjs` 재사용. 
  - `op_export(p_academy)` — 기존 `export-academy` Edge 에 운영자 JWT 허용.
- `tools/set-operator.mjs <phone>` — 운영자 등록(서비스 키). `tools/operator-test.mjs` — 학원 개설 → 원장 초대 링크 로그인 → 목록 숫자 → 잠금 시 로그인 거절 → 발신키 저장·마스킹 조회 → 삭제(확인 slug) → 다른 사용자는 전부 `not_operator`.

## Task 2 (클라이언트)
- 로그인: 운영자 번호는 `roster_phones` 에 없으므로 `otp-send`/`otp-verify`/`invite-login` 에 운영자 분기(`app_operators` 에 있으면 소속 없이 세션 발급, memberships 빈 배열 + `operator: true`). 세션에 `operator` 플래그; `PickRole` 은 운영자면 바로 운영 홈.
- 화면(`screens/operator/`): `OpHome`(학원 카드 목록: 이름·슬러그·학생 N·들어온 학부모 M/T·알림 못 받는 K·이번 달 청구/납부·잠금 표시; 검색), `OpAcademy`(상세: 원장 초대 링크 복사·재발급, 소개 페이지 링크 `?a=`, 앱 링크, 발신 모드·발신키(마스킹, 바꾸기), 잠금 토글, 데이터 내려받기, 삭제(슬러그 재입력)), `OpNew`(학원 만들기 폼: 이름·슬러그(자동 제안)·원장 이름·번호·강조색 → 만든 뒤 초대 링크 복사 화면).
- 탭: 운영자는 탭바 대신 상단 두 화면(학원 · 설정) — PC 좌측 내비 "운영" 그룹. BRIGHT 워드마크가 앱바.
- `docs/ops/operator.md`: 운영 절차(개설 → 링크 카톡 전달 → 로고 안내 → 발신키 → 잠금·삭제), 첫 운영자 등록 명령.

## Task 3 (Fable) 검증·배포
- 회귀 전체 + operator-test, 헤드리스: 운영자 로그인 → 학원 개설 → 초대 링크로 새 컨텍스트 원장 진입 → 잠금 → 원장 로그인 거절. 화면 시트. Edge(`otp-*`, `invite-login`, `export-academy`) 재배포. 사장님 번호를 운영자로 등록(원장 소속과 병존 — 역할 선택 화면에 "BRIGHT 운영자" 항목).

## 결과 (2026-09-05)
- Task 1 백엔드: `0023_operator.sql`(app_operators·is_operator·op_academies·op_create_academy·op_director_invite·op_set_lock·op_set_sms·op_get_sms·op_delete_academy·academy_sms_key), Edge `op-delete`, `export-academy?academy=`(운영자 JWT 허용), `_shared/auth.ts` 운영자 분기·잠긴 학원 403. `tools/set-operator.mjs`, `tools/operator-test.mjs`(OP_EDGE_DEPLOYED=1) 통과. 사장님 번호 운영자 등록 완료.
- Task 2 클라이언트: `screens/operator/{OpHome,OpAcademy,OpNew,OpSettings}`, `lib/operator.ts`(+test), 세션 `operator` 플래그, `PickRole` "BRIGHT 운영자" 항목, SideNav "운영" 그룹, `InviteEntry`/`Otp` `academy_locked` 안내, 더보기(원장·공용)에서 운영 화면 진입.
- 덤: Solapi 어댑터 `_shared/solapi.ts`(HMAC-SHA256, send-many/detail, 90바이트 초과 LMS), `0024_sms_provider_solapi.sql`(학원별 provider `solapi` 허용, 키 형식 검사), `tools/sms-test.mjs`. 전역은 아직 `SMS_PROVIDER=console` — 키 등록·시험 발송 뒤 켠다.
- 검증: `tsc` 깨끗, vitest 207 통과, 헤드리스 스윕 79장(역할×테마) 이상 없음, 운영자 화면 4장(목록 PC·만들기 폼·만든 뒤 초대 링크·상세). 시트: `tests/app-verify-op-{1-light,2-dark,3-operator}.png`.
- 남은 것: `link-login` 잠금 미적용(알림톡 제한 세션), `otp-send` 잠긴 학원 번호에도 발송, 약관·개인정보 동의 화면(제안).
