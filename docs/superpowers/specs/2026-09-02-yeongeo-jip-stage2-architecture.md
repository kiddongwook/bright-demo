# 영어의 집 — 2단계 실제 구축 설계 (백엔드·DB·알림·비용·기간)

작성 2026-09-02 · 상태: 승인됨 (적대적 검증 반영본)

## 1. 전제 (사용자 답)

| 항목 | 결정 |
|---|---|
| 개발·운영 | 사장님 혼자 (Claude와 함께) → 서버를 직접 굴리지 않는다 |
| 앱 형태 | 웹앱(PWA) 먼저, 스토어는 나중에 (Capacitor로 감쌀 수 있게) |
| 학원 수 | 영어의 집 하나로 시작, 모든 테이블에 `academy_id` — 둘째 학원은 설정으로 |
| 월 운영비 | 3~10만원 → 설계 결과 약 4~5만원 |
| 기능 | 1단계 데모의 기본 4개 + 상태 연결·결석/보강·학생 할 것·다시 알리기·카톡 알림·가이드 |

## 2. 구성

```
[학부모·학생·원장 폰]                    [PC — 원장 설정 화면]
        │ HTTPS                                   │
        ▼                                         ▼
  정적 SPA (PWA, 홈 화면 추가) ── 나중에 Capacitor로 감싸 스토어
  · 어느 정적 호스트든 (무료). 서버 없음
        │ Supabase JS — RLS 가 권한을 강제
        ▼
  Supabase
  · Postgres  — 학원별 격리(RLS), SQL 마이그레이션
  · Auth      — 전화번호 OTP(첫 로그인만), 토큰 링크 로그인
  · Edge Functions — 알림 발송, 토큰 발급·검증, 명부 적재, 내보내기
  · Storage   — 로고·첨부
        │ DB 웹훅 + 5분 재시도
        ▼
  카카오 알림톡 (발송 대행사 API) ── 수신 실패 콜백 → 문자(SMS) 대체
```

세 가지 선택 이유:
- **관리형(Supabase)**: 백업·보안 패치·장애 대응을 사지 않는다. 대안 Firebase는 학원 간 격리 규칙이 실수하기 쉽고 관계형 질의(안 읽은 사람 = 대상 − 읽은 사람)가 불편. 직접 서버는 혼자에겐 운영 부담.
- **정적 SPA**: 데모가 이미 정적 HTML 하나. Next.js 서버를 두면 호스팅 비용·상업 이용 제약·어댑터 문제가 따라온다. 권한 필요한 작업만 Edge Function.
- **알림은 카톡 알림톡**: 학부모는 카톡에 산다. 앱 푸시가 없어도 되므로 PWA로 충분.

## 3. 데이터 모델

모든 업무 테이블에 `academy_id uuid not null references academies`. 시간은 `timestamptz`(UTC) + 날짜가 뜻을 갖는 곳은 **`date` 컬럼을 Asia/Seoul 기준으로 별도 저장**.

| 테이블 | 컬럼 (핵심) | 데모 대응 |
|---|---|---|
| academies | id, name, slug, brand_color, logo_path, created_at | 우리 학원 |
| users | id(auth uid), academy_id, role `director\|teacher\|parent\|student`, name, phone, created_at | ME / PHONES |
| classes | id, academy_id, name, schedule(jsonb: 요일·시각), teacher_id | 고1 A · 고2 B |
| students | id, academy_id, name, user_id(null 가능: 학생 로그인 시 연결), status `active\|left`, left_at | 명부 |
| enrollments | student_id, class_id, PK(student_id,class_id) | 학생이 반 여럿(문법반+독해반) |
| guardians | student_id, user_id, relation, PK(student_id,user_id) | 자녀 여럿·보호자 여럿 |
| roster_phones | academy_id, phone, role, student_id, UNIQUE(academy_id,phone,role,student_id) | 입장 허용 명단 (가입 전 대조) |
| attendance | id, academy_id, student_id, class_id, date(KST), status `present\|late\|absent\|makeup`, **arrived_at**(도착 시각), note, marked_by, UNIQUE(student_id,class_id,date) | att |
| absence_requests | id, academy_id, student_id, requested_by, date(KST), reason, status `requested\|confirmed\|declined`, makeup_kind `saturday\|material`, makeup_at, decided_by, created_at | absences |
| notices | id, academy_id, author_id, title, body, target_class_id(null=전체), created_at, reminded_at | notices |
| notice_reads | notice_id, user_id, read_at, PK(notice_id,user_id) | readers |
| inquiries | id, academy_id, student_id, asked_by, topic, body, created_at, answer, answered_by, answered_at | asks |
| faqs | id, academy_id, q, a, sort | FAQ |
| todos | id, academy_id, class_id, kind `homework\|exam`, title, due_date(KST), notice_id(null 가능) | todos |
| todo_done | todo_id, student_id, done_at, PK(todo_id,student_id) | done |
| notifications | id, academy_id, user_id, kind, title, body, link, read_at, created_at | noti |
| outbox | id, academy_id, to_user_id, channel `alimtalk\|sms`, template_code, params(jsonb), link_token_id, status `queued\|sent\|delivered\|failed\|dead`, attempts, idempotency_key UNIQUE, provider_msg_id, last_error, created_at, sent_at | 발송함 |
| link_tokens | id, academy_id, user_id, view, ref_id, token_hash, expires_at, used_at, created_at | (신규) 알림톡 링크 자동 로그인 |
| audit_log | id, academy_id, actor_id, action, target, at | 원장 행동 기록 (최소) |

파생 규칙:
- 안 읽은 사람 = (전체 공지면 학원의 모든 학부모, 반 공지면 그 반 학생의 보호자) − notice_reads.
- 학부모가 보는 공지 = 전체 + 자녀들의 반 (자녀 둘이면 합집합).
- 학생이 보는 할 것 = 자기 반 todos, 완료는 todo_done.

## 4. 권한 (RLS)

- 헬퍼 `current_academy_id()` = `select academy_id from users where id = auth.uid()`. **모든 정책이 이 헬퍼로 학원을 먼저 자른다.**
- 헬퍼 `my_student_ids()` = 학부모면 guardians의 자녀, 학생이면 자기 students.id.

| 역할 | 읽기 | 쓰기 |
|---|---|---|
| director/teacher | 자기 학원 전부 | 출결·공지·FAQ·todos·답변·결석 처리·명부 |
| parent | 전체/자녀 반 공지, 자녀의 출결·결석·todos·done, 자기 문의·알림 | 문의·결석 신청·notice_reads(자기)·notifications 읽음 |
| student | 전체/자기 반 공지, 자기 출결·todos·알림 | todo_done(자기)·notice_reads(자기) |

**RLS 테스트 스크립트**(1주차, 기능보다 먼저): 학원 A·B 씨앗을 넣고 A의 원장·학부모·학생 세션으로 B의 모든 테이블과 A의 남의 자녀 데이터가 거부되는지 자동 확인. 정책을 고칠 때마다 돌린다.

## 5. 흐름

### 5.1 입장
1. 번호 입력 → Edge Function이 `roster_phones` 대조 (없으면 "아직 등록되지 않은 번호예요").
2. 있으면 OTP 문자 발송 → 확인 → users 생성/로그인. **세션 90일 유지**(리프레시 토큰). OTP는 사실상 첫 로그인뿐.
3. 번호에 명부 행이 여럿(자녀 둘, 부모 번호 쓰는 학생)이면 **역할·자녀 선택 화면**.
4. OTP 발송 경로: Supabase Auth 발송 훅 → 국내 문자 대행사 — **제공 여부·요금제 조건 확인 후** 결정. 안 되면 자체 OTP 테이블(해시·만료·시도 제한) + Edge Function.

### 5.2 알림톡 링크 = 로그인
- 알림을 만들 때 `link_tokens`에 본인 전용·**7일 만료**·화면 한정 토큰을 발급하고, 알림톡 버튼 URL에 붙인다.
- 카톡 내장 브라우저에서 눌러도 토큰으로 그 사용자의 **제한 세션**을 만들어 해당 화면이 바로 열린다. 토큰은 해시로 저장, 사용 후 재사용 가능하되 만료 후 무효(전달 위험은 화면 한정으로 완화).
- 내장 브라우저에서 다른 화면으로 가려 하면 정식 로그인(OTP)을 유도.

### 5.3 알림 파이프라인
1. 공지·답변·보강 확정·출결 저장·다시 알리기가 `notifications`(앱 내)와 `outbox`(카톡)에 넣는다. `idempotency_key`로 중복 방지.
2. DB 웹훅이 Edge Function 호출 → 대행사 알림톡 API → `sent`, provider_msg_id. *(3주차 구현: 웹훅 대신 `pg_cron` 1분 틱이 보낼 게 있을 때만 `pg_net` 으로 함수를 깨운다 — 즉시 발송과 재시도가 한 장치, 지연 ≤1분.)*
3. **5분 주기 재시도**(pg_cron): `queued`/`failed` 중 attempts < 5 재발송, 넘으면 `dead`.
4. 대행사 **수신 결과 콜백**으로 `delivered`/`failed` 갱신. **문자 대체는 콜백의 실패에서 트리거** — API 수락 ≠ 도착.

### 5.4 알림톡 템플릿 (본문 없음 — 광고성 거절 회피)
| 코드 | 문구 | 버튼 |
|---|---|---|
| NOTICE_NEW | [영어의 집] 새 공지가 올라왔어요. #{제목} | 앱에서 보기 |
| NOTICE_REMIND | [영어의 집] 아직 확인하지 않은 공지가 있어요. #{제목} | 앱에서 보기 |
| INQUIRY_ANSWERED | [영어의 집] 문의에 답변이 도착했어요. | 답변 보기 |
| MAKEUP_CONFIRMED | [영어의 집] #{날짜} 결석 보강이 정해졌어요. #{보강} | 확인하기 |
| ATTENDANCE | [영어의 집] #{학생} 오늘 출결이 기록됐어요. #{상태} | 확인하기 |

공지 본문·특강 안내 같은 내용은 앱 안에서만. 데모 카톡 카드도 이 형식으로 맞춘다.

### 5.5 PWA·설치
- manifest + 서비스워커(오프라인은 최소: 셸 캐시).
- **설치 안내 화면**: Android는 설치 배너, iOS는 "사파리에서 열어 공유 → 홈 화면에 추가". 카톡 내장 브라우저에선 불가하므로 "사파리로 열기" 안내.
- 학원별 화이트라벨: `slug.도메인` 또는 `/a/slug`로 학원 식별 → academies에서 색·로고 로드.

### 5.6 관리 (PC)
같은 SPA가 넓은 화면에서 더보기의 명부·반·강사를 표로 펼친다. 명부 CSV 올리기(Edge Function), 학원별 데이터 내보내기(Edge Function, 학원이 나갈 때). 파일럿 첫 명부는 **원장님 엑셀을 스크립트로 적재**.

## 6. 운영

- 환경: 로컬(Supabase CLI) / 운영. 스키마·정책은 `supabase/migrations/*.sql`로 저장소에.
- 백업: Supabase Pro 일일 + 주 1회 수동 내보내기 보관.
- 감시: UptimeRobot(5분) → 이메일, Sentry 무료 티어, outbox `failed/dead` 비율 일일 집계.
- 개인정보: 전화번호 최소 수집, 보관·파기 정책, 동의 화면(고등학생은 본인 동의, 학부모는 본인). 실제 발송 전 확인.
- 소유: Supabase 조직·과금은 BRIGHT(사장님). 학원은 언제든 자기 데이터를 내보낼 수 있다 — 계약서 한 줄.

## 7. 비용 (월)

| 항목 | 월 | 비고 |
|---|---|---|
| Supabase Pro | 약 3.5만 ($25) | 일일 백업, 일시정지 없음. 무료 티어는 방치 시 멈춰 운영 부적합 |
| 정적 호스팅 | 0 | 서버 없음 |
| 알림톡 | 약 0.6~1만 | 학부모 60명 × 월 10건 ≈ 600건, 건당 10원대 |
| OTP 문자 | ≈ 0 | 첫 로그인만 |
| 도메인 | 약 0.2만 | 연 2만 |
| 감시·오류 추적 | 0 | 무료 티어 |
| **합계** | **약 4~5만원** | 2025~26 공개 요금 기준. 계약 전 확인 |

초기: 채널·대행사 가입 무료, 선불 충전. 스토어 단계에서 Apple 연 $99 · Google 1회 $25. AI 기능은 켤 때 사용량 과금 별도.

## 8. 기간 — 파일럿까지 6~8주 (혼자, 파트타임)

| 주 | 할 것 |
|---|---|
| 1 | 스키마·RLS·헬퍼·**RLS 테스트** · 인증 경로 확인·구현 · 원장님 엑셀 적재 스크립트 · **도메인 → 카카오 채널 → 발신프로필 → 템플릿 심사 착수** · SPA 뼈대에 데모 UI 이식 시작 |
| 2 | 출결·공지·문의·결석/보강 CRUD 연결, 역할·자녀 선택 |
| 3 | outbox 파이프라인(웹훅·재시도·콜백·문자 대체) · 토큰 링크 로그인 · PWA·설치 안내 |
| 4 | 학생 할 것 · 다시 알리기 · 카톡 카드 형식 정합 · 관리 화면(표) |
| 5~6 | 영어의 집 파일럿(실사용 2주 병행), 다듬기 |
| 7~8 | 여유분: 심사 지연·파일럿 피드백 |

## 9. 확인 항목 (단정하지 않음)

- 카카오 비즈니스 채널 인증 요건, 발신프로필 발급 조건, 링크 버튼 도메인 등록
- 문자 발신번호 사전등록 서류
- 알림톡·문자 건당 요율(대행사별)
- Supabase 인증 발송 훅 제공 여부·요금제 조건
- 미성년자 개인정보 동의 절차(고등학생 본인 동의 가능 여부)

## 10. 범위 밖 · 바꿀 시점

- 범위 밖(구현): 첨삭·편지·성장 기록(준비 중 유지), 앱 푸시, 실시간 동기화(포커스 시 재조회로 충분), 강사 다중 권한 세분화. **수강료는 §12에 스키마·흐름을 미리 반영**하고 구현은 3단계.
- 바꿀 시점: 학원 10곳 → Supabase 컴퓨트 상향 · 알림 월 1만 건 → 요율 재협상 · 스토어 필요 → Capacitor 감싸기(코드 재작성 없음) · 실시간 필요 → Supabase Realtime.

## 11. 학원 관리 관점의 빈 곳 (2026-09-02 추가)

1단계 데모는 "학부모 소통"에 기울어 있다. 실제 운영에 들어가면 아래가 바로 부딪힌다. 2단계 범위에 넣을 것과 뒤로 둘 것을 가른다.

### 2단계에 넣는다 (운영 첫 달에 필요)
| 빈 곳 | 왜 | 설계 반영 |
|---|---|---|
| 학생이 반 여럿 | 문법반+독해반 동시 수강이 흔하다 | `enrollments` 다대다 (students.class_id 제거) |
| 명부 실제 편집·퇴원 | 학생 추가·반 이동·번호 변경·퇴원(접근 차단, 데이터 보존) | students.status, 관리 화면 CRUD, roster_phones 동기화 |
| 출결 이력·통계 | 월별 달력, 학생별 출석률, 결석 N회 누적 표시 | attendance 월 조회 뷰, 학생 상세에 월 달력 |
| 강사 역할 | 강사 1~2명이 자기 반 출결·공지 | role teacher + classes.teacher_id 로 RLS 범위 |
| 상담·메모 | 원장이 학부모 상담 내용·학생 특이사항을 적는 곳 — 문의와 별개 | `notes(student_id, author_id, body, kind 상담\|메모, at)` |
| 시간표·휴원일 | 휴원일이 출결·보강과 연결돼야 한다 | `calendar(academy_id, date, kind 휴원\|보강\|특강, note)` + classes.schedule |
| 보강 완결 | 보강 확정 뒤 실제 출석 기록과 미이행 추적 | attendance.status makeup + absence_requests.attended_at |
| 학생별 타임라인 | 출결·문의·결석·상담을 한 줄로 | 학생 상세 화면에서 여러 테이블 시간순 합치기 |

### 뒤로 둔다 (준비 중 유지)
| 빈 곳 | 왜 미룸 |
|---|---|
| 수강료 납부 상태·안내 | 관리 차원 최대 구멍이지만 규칙(할인·일할·CMS)이 원장 답 없이는 못 정한다 → 실물 청구서 받은 뒤. **스키마·흐름은 §12에 미리 반영** |
| 시험 점수·성적 추이 | 고등에선 핵심이나 채점 체계를 먼저 받아야 함 (성장 기록과 합쳐서) |
| 숙제 검사(원장 확인) | 지금은 학생 자기 체크. 반별 완료 현황은 작은 추가라 3단계 초입 |
| 공지 첨부(이미지·PDF)·예약 발송 | Storage 연결 후 |
| 월 보고서 내보내기(엑셀·PDF) | 파일럿에서 필요해지면 |
| 학부모 알림 설정, 보호자 여럿 우선순위 | guardians 로 구조는 준비됨, 화면은 뒤로 |

기간 영향: 2단계에 넣는 8개는 2~4주차에 흡수하되 파일럿까지 **7~9주**로 본다.

## 12. 수강료 — 미리 반영 (2026-09-02 추가)

업계는 기본 기능을 무료로 주고 결제에서 번다. 우리도 3단계에서 여기서 번다. 구현은 3단계지만 **스키마는 지금 넣어** 2단계 데이터가 그대로 이어지게 한다.

### 12.1 원칙
- **자금 비보관.** 돈은 PG가 학원 계좌로 직접 정산한다. BRIGHT 는 청구·기록·안내만 한다.
- **규칙 먼저.** 청구 주기·납부일·형제/장기 할인·중도 일할·교재비 별도·환불을 원장의 실물 청구서에서 복원해 `billing_rules` 에 넣는다. 규칙이 틀리면 원장이 매달 손으로 고치고, 그러면 안 쓴다.
- **두 단계로 연다.** ① 청구서 발송 + 납부 상태 + 미납 안내 (결제 없음, 이체하면 원장이 '납부' 한 번) → ② PG 링크 결제(카드·간편결제) + 현금영수증 자동. ①만으로 통장 대조가 사라진다.

### 12.2 테이블 (`0003_billing.sql`, 2단계에 함께 적용)
| 테이블 | 컬럼 (핵심) |
|---|---|
| billing_rules | academy_id UNIQUE, billing_day(기본 1), due_day(기본 5), sibling_discount_pct, prorate(중도 일할), textbook_separate, refund_policy text |
| fee_plans | id, academy_id, class_id(null=학원 공통), name, amount, period `monthly\|per_session`, active |
| invoices | id, academy_id, student_id, period_ym('2026-03'), amount, discount, textbook, total, due_date, status `issued\|paid\|partial\|overdue\|void`, issued_at, paid_at, memo, reminded_at, UNIQUE(student_id, period_ym) |
| payments | id, academy_id, invoice_id, amount, method `transfer\|card\|cash\|pg`, paid_at, pg_provider, pg_tx_id, receipt_no, recorded_by |

권한: 원장은 자기 학원 전부, 강사는 읽기만. 학부모는 **자기 자녀의 invoices·payments 읽기**만. 학생은 없음. 쓰기는 원장(①)과 PG 콜백을 받는 Edge Function(②, 서비스 키).

### 12.3 흐름
```
매월 billing_day   pg_cron → 활성 학생마다 invoices 생성 (fee_plan × 규칙) → outbox BILL_ISSUED
납부(①)          학부모 이체 → 원장이 '납부' 누름 → payments(transfer) → invoice paid → outbox PAYMENT_CONFIRMED
납부(②)          알림톡 버튼 → 결제 페이지(토큰 링크) → PG → 콜백 Edge Function → payments(pg) → paid
due_day 지나면    status overdue → outbox BILL_REMIND (원장 톤 문구) — 하루 1회, 최대 3회
월말              원장 「수강료」 화면: 납부/미납/합계 표, CSV 내보내기
```

### 12.4 알림톡 템플릿 (추가 3개)
| 코드 | 문구 | 버튼 |
|---|---|---|
| BILL_ISSUED | [영어의 집] #{월} 수강료 청구서가 나왔어요. #{금액}원 · #{납부일}까지 | 청구서 보기 |
| BILL_REMIND | [영어의 집] #{월} 수강료가 아직 확인되지 않았어요. #{금액}원 | 청구서 보기 |
| PAYMENT_CONFIRMED | [영어의 집] #{월} 수강료 #{금액}원 납부가 확인됐어요. 감사합니다. | 영수증 보기 |

### 12.5 수익 훅 (3단계에서 고른다)
청구서 건당 정액 / 결제액의 일부(PG 수수료 위에) / 플러스 요금제. 어느 쪽이든 `payments.pg_provider`·`pg_tx_id` 로 집계된다.

### 12.6 필요한 것 · 확인 항목
- 원장의 실물 청구서 1장 (첫 미팅 실물 5종) — 규칙 복원의 원재료
- PG 계약(사업자 등록·심사·정산 계좌), 현금영수증·교육비 소득공제 자료 발급 방식, 환불 처리 규정 — **확인 항목**
- 알림톡 템플릿에 금액 변수 허용 여부·길이 — 확인 항목

### 11.1 구현 상태 (2026-09-03, 4주차 끝)
학생이 반 여럿 ✓(2주차) · 명부 편집·퇴원 ✓ · 출결 이력·통계 ✓(학생별 월 달력·출석률; 반별 월 통계 표는 5주차) · 강사 역할 △(명부·로그인·담당 지정 ✓, **자기 반으로 좁히는 RLS 는 5주차** — 지금은 원장과 같은 권한) · 상담·메모 ✓ · 시간표·휴원일 ✓(전체 휴원만 다음 수업에서 뺌, 반별은 5주차) · 보강 완결 ✓ · 학생별 타임라인 ✓. §5.6 PC 표·CSV·내보내기는 5주차.

### 11.2 구현 상태 (2026-09-03, 5주차 끝)
강사 역할 ✓(담당 반·학생으로 읽기·쓰기 범위, 원장 전용 관리) · 시간표·휴원일 ✓(반별 휴원 반영) · 재입학 ✓ · 출결 통계 ✓(반별 월 출결표, 넓은 화면) · 학부모 월 달력 ✓ · §5.6 CSV 올리기·내보내기 ✓ · 배포 ✓(GitHub Pages `/bright-demo/pwa/`, 푸시 뒤 유효). 남음: 요일별 다른 시간, 화이트라벨(slug), PC 표 확장.

### 6.1 운영 추가 (2026-09-03, 6주차)
살림: `housekeeping()` 매일 04:00 KST(만료 OTP·토큰, 90일 지난 읽은 알림·보낸 outbox, 30일 지난 클라 오류). 오류 보고: 앱이 `client_errors` 에 남긴다(본인 insert 만, 번호 가림) — 대시보드 SQL 로 본다. 파일럿 절차는 `docs/ops/pilot.md`, 배포는 `docs/ops/deploy.md`.
