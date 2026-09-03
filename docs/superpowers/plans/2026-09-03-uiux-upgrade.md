# UI/UX 고도화 Implementation Plan — 실사용 첫날에 걸리는 것부터

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원장이 학원을 막 열었을 때부터 매일 쓰는 순간까지, 화면이 "다음에 뭘 하면 되는지"를 말해 주고, 기다리는 동안 비어 보이지 않고, 실수해도 되돌릴 수 있고, PC 에서는 관리 도구답게 보이게 한다. 이미 적용한 여섯 항목(흰 앱바·PC 폭·카드/리스트·안전 영역·8pt·터치 반응)과 다크 테마 위에 쌓는다.

**Architecture:** 세 갈래. (A) **구조·흐름** — 원장 홈에 오늘 요약, 새 학원 첫걸음 안내, 역할별 빈 상태와 CTA, 학부모·학생 홈 우선순위. (B) **컴포넌트·상태 시스템** — 스켈레톤 로딩, 오류·재시도 화면, 네이티브 `confirm()` 대신 앱 안 확인 시트, 되돌리기 토스트, 폼 요소 통일, 44px 터치 타깃, 아이콘 세트. (C) **PC 관리 모드·공지 작성** — 넓은 화면에서 하단 탭 대신 좌측 내비, 공지 쓰기에 템플릿·대상 칩·미리보기. 세 갈래는 파일이 겹치므로 A → B → C 순서로 **한 에이전트씩** 본 트리에서 진행하고(병렬 없음), Fable 이 각 단계 뒤 브라우저(폰·PC·다크)로 확인한다.

**Tech Stack:** 기존 그대로. 새 라이브러리 없음(아이콘은 인라인 SVG 세트 파일 하나로).

## Global Constraints

- 시각 방향은 사용자가 준 검토 그대로: **가볍고 시원한 흰 바탕, 강조색은 클릭 포인트에만**(토스·노션 결). 새 색 추가 금지 — 토큰만.
- 문구 톤 유지(원장님·학부모·~해요). 새 화면 이름은 `nav.tsx` `TITLE` 에.
- 기능·데이터 흐름은 바꾸지 않는다. api.ts 는 읽기 함수 추가만(요약 숫자 등).
- 네이티브 `confirm()`·`alert()` 를 앱 안 컴포넌트로 바꿀 때 동작(취소 시 아무 일 없음)은 같아야 한다.
- 테스트: 단위(`npm test`)·빌드·회귀 스크립트는 그대로 PASS. 화면 검증은 Fable 이 폰 390×844 · PC 1280 · 다크 모드로.

---

### Task A: 구조·흐름 — 첫걸음, 오늘 요약, 빈 상태, 홈 우선순위

**Files:** Create `app/src/screens/director/Home.tsx`(원장 홈 = 오늘 요약 + 첫걸음), `app/src/components/Empty.tsx`; Modify `api.ts`(`todaySummary()`), `director/Today.tsx`(출석부만 남기고 요약은 Home 으로 — 또는 Today 상단에 요약 블록), `parent/Child.tsx`, `student/Me.tsx`, `More.tsx`, `nav.tsx`, `registry.tsx`, `theme.css`

**계약:**
- `todaySummary(): Promise<{ classesToday: { id; name; start; end; marked: boolean; students: number }[]; pendingInquiries: number; pendingAbsences: number; unreadNoticeCount: number; studentsTotal: number; parentsEntered: number; parentsTotal: number }>` — 있는 함수들을 조합(listClassesFull·todayAttendance·listInquiries·listAbsences·entryStatus(원장만)).
- 원장 **오늘** 탭 상단(출석부 위)에 요약 블록: "오늘 수업 N개 · 출석 기록 M/N" · "답변 대기 N" · "결석 신청 N" — 각각 누르면 해당 화면으로. 수업이 없는 날은 "오늘은 수업이 없어요" 한 줄.
- **첫걸음(새 학원)**: `studentsTotal === 0` 또는 반이 없으면 오늘 탭 최상단에 체크리스트 카드: ① 반 만들기 → ② 학생·학부모 넣기(직접 또는 CSV) → ③ 학부모 초대 문구 보내기 → ④ 첫 공지 올리기. 각 항목에 완료 체크와 이동 단추. 넷 다 되면 카드는 사라진다(`localStorage` 로 "숨기기" 도 제공).
- **빈 상태 컴포넌트** `Empty({ icon, title, hint, action?: { label, onClick } })`: 목록이 비었을 때 지금의 `.muted` 한 줄 대신 아이콘+제목+한 줄+CTA. 적용: 명부(학생 없음 → 학생 추가), 공지(없음 → 공지 쓰기), 문의(없음), 할 것(없음 → 넣기), 휴원일, 반(없음 → 반 추가), 학부모 공지·할 것·결석, 알림.
- 학부모 홈 순서: 다음 수업(강조) → 오늘 출결(오늘 기록이 있으면 크게 "오늘 출석했어요") → 할 것 → 최근 공지 1건(안 읽었으면 표시) → 결석 미리 알리기 CTA. 학생 홈: 할 것 → 다음 수업 → 이번 주 출결.
- 더보기(원장): 항목을 "매일 쓰는 것 / 설정 / 준비 중" 세 묶음으로.

- [ ] Step 1: `todaySummary` + 단위 테스트(순수 계산부 분리: `summarize(classes, marks, ...)`) → Step 2: 화면 → Step 3: tsc·test·build → Fable 브라우저 확인(새 학원 `yeongeo-jip` 로 첫걸음 카드가 보이는지, 씨앗 학원은 요약이 맞는지)

---

### Task B: 컴포넌트·상태 시스템

**Files:** Create `app/src/components/Skeleton.tsx`, `Confirm.tsx`(+`useConfirm`), `ErrorState.tsx`, `icons.tsx`; Modify `lib/toast.ts`(되돌리기 액션 지원), `lib/useLoad.ts`(`loading` 플래그·`retry`), 화면 전반(빈 `<section className="view on" />` → 스켈레톤, `confirm(` → `useConfirm`), `theme.css`

**계약:**
- `useLoad` 가 `{ data, err, loading, reload }` — 화면은 `loading` 이면 `<Skeleton rows={n} />`, `err` 면 `<ErrorState onRetry={reload} />`("불러오지 못했어요 · 다시 시도").
- `Confirm`: 하단 시트(`.sheet`), 제목·설명·취소·확인(위험이면 빨간). `const confirm = useConfirm(); if (!(await confirm({ title, body, danger }))) return;` — 퇴원·삭제·지우기 전부 교체(현재 `confirm(` 호출 12곳 안팎, `grep -rn "confirm(" src/screens`).
- 토스트: `toast(text, { action?: { label: '되돌리기', onClick } })` — 메모 삭제·할 것 삭제·휴원일 삭제에 되돌리기(삭제를 5초 지연하고 되돌리면 취소; 지연 중 화면은 사라진 것처럼).
- 폼: `.input`·`select`·`textarea`·`input[type=date|time]` 높이 48px·같은 테두리·포커스 링(브랜드 2px), 라벨 `.field label` 12px, 오류 문구 `.field .err`. 터치 타깃: `.rw` 최소 높이 56px, `.marks button`·`.cb`·`.calnav` 44px 이상.
- 아이콘: `icons.tsx` 에 12개 내외(list·notice·chat·house·bell·back·camera·check·plus·download·warn·calendar) SVG 컴포넌트, 이모지(📷 🎉) 교체.
- 스켈레톤: 회색 막대 반복(`.sk`), 애니메이션은 `prefers-reduced-motion` 존중.

- [ ] Step 1: 컴포넌트 + useLoad → Step 2: 화면 교체(한 화면씩 커밋) → Step 3: tsc·test·build → Fable 확인(느린 네트워크 스로틀로 스켈레톤, 오프라인으로 오류 화면, 퇴원 시트, 되돌리기)

---

### Task C: PC 관리 모드 · 공지 작성

**Files:** Modify `App.tsx`(넓은 화면 레이아웃), `theme.css`(`.sidenav`), `director/Notices.tsx`(`NoticeNew`), Create `lib/noticeTemplates.ts`

**계약:**
- `body.wide` 이고 폭 ≥ 1024 이면 하단 탭 대신 **좌측 내비**(로고·탭 4개·더보기 항목 펼침), 본문은 최대 960px 가운데. 폰·태블릿 세로는 지금 그대로. 화면 전환 시 스크롤 위치 초기화.
- 공지 쓰기: 상단에 템플릿 칩(휴원 안내 · 시험 안내 · 준비물 · 특강 · 자유) → 제목·본문 채움(날짜 자리는 `{날짜}` 로 두고 사용자가 고침), 대상 반은 칩(전체·반들), 아래에 **미리보기**(학부모 화면과 같은 모양) 접기, 올리기 전에 "N명에게 알림이 가요" 문구(대상 반 학생·학부모 수).
- 공지 상세(원장 읽은 사람 화면)에 "다시 알리기" 는 그대로.

- [ ] Step 1: 사이드 내비 → Step 2: 공지 쓰기 → Step 3: tsc·test·build → Fable 확인(PC 1280 에서 좌측 내비, 폰에서 변화 없음, 템플릿 → 미리보기 → 올리기)

---

### Task D (Fable): 검증·배포

- [ ] 각 Task 뒤 브라우저 확인(폰·PC·다크), 회귀 9종·단위·빌드, `npm run deploy`, 커밋·푸시(실사용 중이므로 각 Task 마다 배포), 시트 `tests/app-verify-uiux.png`.

---

## Self-Review

**범위** — 사용자 검토의 여섯 항목은 이미 반영(별도 커밋). 이 계획은 구조·상태·PC 세 갈래. 3단계 기능(수강료 등)은 넣지 않는다.
**충돌** — 세 Task 가 `theme.css`·`App.tsx`·화면 파일을 함께 만지므로 순차 진행. 다크 테마 작업이 끝난 뒤 시작.
**확인 항목** — `confirm()` 교체 뒤 Playwright 검증 스크립트가 `window.confirm = () => true` 스텁에 의존하던 부분은 시트의 확인 단추 클릭으로 바꿔야 함(Fable 메모).
