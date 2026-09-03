# 관리 앱 디자인 트렌드 검토 — 영어의 집에 적용할 것 (2026-09-03)

> 목적: 2026년 관리·교육 앱의 디자인 흐름을 훑고, 지금 앱(원장·학부모·학생 3역할, PWA)에 **바로 적용할 만한 것**과 **하지 않을 것**을 가른다. 취향 논쟁이 아니라 "매일 쓰는 원장이 덜 피곤한가"가 기준.

## 1. 흐름 요약 (출처는 §5)

| 흐름 | 무엇인가 | 우리 앱과의 관계 |
|---|---|---|
| **차분한 미니멀 + 강조색 절제** | 큰 여백, 얇은 테두리, 그림자 거의 없음, 색은 눌리는 곳에만. 토스·노션·리니어가 대표. 토스 파랑 `#3182F6` 도 CTA·활성 표시 외에는 잘 안 쓴다. | 이번 주 이미 반영(주 버튼 먹색, 파랑은 탭·선택·링크만). 방향 유지. |
| **iOS 26 Liquid Glass** | 탭바가 화면에서 21pt 떠 있는 알약 형태, 반투명 유리 질감, 큰 제목 34pt → 스크롤 시 17pt, 모서리 반지름은 바깥 컨테이너와 동심(concentric). | 유리 질감은 안드로이드·구형 폰에서 무겁고 PWA 에서 어색. **떠 있는 알약 탭바 + 동심 반지름 + 큰 제목→작은 제목 전환**만 가져온다. |
| **바텀 시트 구조** | 확인·필터·설정은 화면 이동 대신 아래에서 올라오는 시트. 엄지 닿는 곳에 주요 동작. | 확인 시트는 됨. **결석 미리 알리기·할 것 넣기·휴원일 추가**도 시트로 바꾸면 화면 이동이 준다. |
| **엄지 영역(하단 40%)에 주 동작** | 주 CTA 는 화면 아래 고정(BottomCTA). 위쪽 1/3 은 읽기 전용. | 오늘 탭 "저장하고 알리기"가 출석부 아래에 있어 학생이 많으면 스크롤 끝에 있음. **하단 고정 CTA** 로. |
| **KPI 카드 3~5개 + 점진적 공개** | 대시보드는 숫자 3~5개가 먼저 읽히고, 나머지는 접기·드릴다운. | 오늘 요약 타일 3개는 방향이 맞음. 학부모 홈도 "다음 수업·오늘 출결" 두 장만 크게, 나머지는 접기. |
| **다크 우선 설계** | 어두운 바탕을 기본으로 색 체계를 짜고, 그림자 대신 테두리·명도로 층을 만든다. | 토큰화로 이미 양쪽 호환. 카드 층은 그림자 대신 테두리로 — 지금 그대로. |
| **마이크로 인터랙션이 주요 소통 수단** | 눌림·완료·진행 표시가 상태를 말해 준다(과하지 않게). | 저장 성공 시 체크 애니메이션, 출석 표시 누를 때 살짝 튀는 정도. 이미 있는 `scale(.98)` 위에 한 겹만. |
| **인간적인 디자인·질감** | AI 완벽함에 대한 반발로 손글씨·종이 질감·따뜻한 톤. | 로고가 손글씨 결이라 **빈 상태 일러스트·환영 문구**에만 살짝. 본문은 중립 유지. |
| **높은 채도·안티 디자인** | Z세대 타깃의 강한 색·의도적 불규칙. | 학부모·원장 대상 관리 앱과 맞지 않음. **하지 않는다.** |
| **AI 개인화·대화형 UI** | 사용 패턴에 따라 홈이 바뀌고, 메뉴 대신 대화로 조작. | 데이터가 적고 신뢰가 먼저. 3단계 첨삭·편지에서 "제안하고 원장이 확정" 형태로만. |

토스의 시스템 철학 한 줄: 디자인 시스템은 팀을 단속하는 가드레일이 아니라 문제를 풀게 돕는 도구 — 색·타이포·간격 규칙은 지키고 레이아웃은 자유롭게. 우리 토큰 체계(`--brand --ink --ground --rule …`)와 같은 태도다.

## 2. 지금 앱에 적용할 포인트 (우선순위순)

### A. 바로 (한 주 안)
1. **하단 고정 CTA(BottomCTA)** — 오늘 탭 "저장하고 알리기", 공지 쓰기 "올리고 알리기", 학생 편집 "저장", 결석 미리 알리기 "원장님께 알리기"를 탭바 위에 고정. 스크롤과 무관하게 엄지 자리에. 탭바가 있는 화면은 탭바 위, 없는 화면은 안전 영역 위. 내용 하단 여백을 CTA 높이만큼 확보.
2. **큰 제목 → 작은 제목 전환** — 화면 상단 `hello`(24px) 가 스크롤되면 앱바에 17px 제목이 나타나게. 지금은 탭 루트에서 앱바에 로고만 있어 "내가 어디 있는지"가 스크롤 뒤 사라진다.
3. **떠 있는 알약 탭바** — 화면 가장자리에서 12~16px 띄운 둥근 탭바(반지름 22~24), 바탕은 `--paper`, 얇은 테두리. 유리 효과는 넣지 않음(성능·일관성). 아래 콘텐츠는 탭바 뒤로 흐르되 마지막 24px 는 페이드.
4. **동심 반지름 규칙** — 카드 16 → 카드 안 요소(버튼·입력) 12 → 그 안 태그 8. 지금 카드 16·버튼 14·입력 12 로 어긋난 곳이 있다. 버튼을 12 로 맞추고 `.sheet` 는 20.
5. **상태 표시 마이크로 인터랙션** — 출석 ○△✕ 누를 때 `scale(1.08)→1`, 저장 성공 시 버튼 안에 체크가 0.6초 보이고 원래로. 되돌리기 토스트는 그대로.

### B. 다음 (2~3주)
6. **시트로 옮기기** — 할 것 넣기, 휴원일·특강 추가, 결석 미리 알리기, 반 편집. 현재 화면 안 인라인 폼 → 바텀 시트. 목록이 위에 남아 맥락이 유지된다.
7. **학부모 홈 두 장 원칙** — "다음 수업"과 "오늘 출결"만 큰 카드, 이번 주·할 것·최근 공지·결석은 접힌 섹션 또는 작은 행. 오늘 출결이 있으면 그 카드가 첫 장.
8. **원장 오늘 탭 KPI 재배치** — 타일 3개를 "지금 할 일" 순으로: 기록 안 한 반(있으면 빨간 점) → 답변 대기 → 결석 신청. 0 이면 회색, 있으면 강조.
9. **리스트 행 규격 통일(ListRow)** — 제목 16/600, 부제 14/400 `--ink2`, 좌 아바타 36, 우 chevron 또는 액션 하나. 지금 `.rw` 는 15/600·13 인 곳과 섞여 있다.
10. **빈 상태에 손글씨 결** — `Empty` 아이콘을 로고와 같은 결의 얇은 선 일러스트 6개로(명부·공지·문의·할 것·달력·알림). 색은 `--ink3`.

### C. 하지 않을 것
- 유리 질감(backdrop-filter) 전면 도입, 높은 채도, 안티 디자인, 카드마다 그림자, 홈 자동 재배치(AI), 제스처 전용 동작(항상 보이는 단추가 있어야 함).

## 3. 적용 방식

- 토큰 추가: `--r-card:16px --r-el:12px --r-tag:8px --tab-h:64px --cta-h:72px`. 컴포넌트: `BottomCta`(children, disabled), `Sheet`(title, children) 확장, `useScrollTitle()`.
- 순서: A1·A2·A3 을 한 에이전트, A4·A5 를 한 에이전트(파일 겹침 적음: 앱바·탭바 vs 버튼·마크). 각각 폰·PC·다크 전수 스크린샷(`scratchpad/sweep/sweep.mjs`) 로 확인 후 배포.
- 성공 기준: 원장이 오늘 탭에서 스크롤 없이 저장할 수 있고, 어느 화면에서든 스크롤 뒤에도 제목이 보이며, 탭바가 콘텐츠와 분리돼 보인다.

## 4. 참고한 실제 앱

- **토스**: 파랑은 CTA 와 활성 표시에만, 나머지는 회색 단계. 시트·BottomCTA·ListRow 가 뼈대. 2026 년 TDS 를 외부 공개.
- **iOS 26 기본 앱**(설정·메시지): 떠 있는 탭바, 큰 제목 전환, 그룹 리스트(17/15/13pt), 44pt 탭 타깃.
- **하이클래스·클래스팅**(국내 학교·학원 소통 앱): 기능은 많지만 화면이 빽빽하고 색이 많다 — 우리는 "한 화면 한 일"로 차별화.
- **KB 알다 홈 개편, 학교 관리 앱 UX 케이스 스터디(2026-02)**: 홈은 "지금 해야 할 것" 우선, 나머지는 접기.

## 5. 출처

- Muzli — [What's changing in mobile app design: UI patterns that matter in 2026](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/) (바텀 시트, 엄지 영역, 다크 우선, 층 구조)
- learnui.design — [iOS 26 Design Guidelines: Illustrated Patterns](https://www.learnui.design/blog/ios-design-guidelines-templates.html) (탭바 21pt 인셋, 34→17pt 제목, 리스트 17/15/13pt, 44pt 타깃)
- Apple WWDC25 — [Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/), rvsmedia — [Designing for iOS 26 Liquid Glass](https://www.rvsmedia.co.uk/blog/designing-for-ios-26-liquid-glass-ui-updates/) (동심 반지름, 떠 있는 탭바)
- 디자인DB — [미리 보는 2026년 UI·UX 디자인 트렌드 9가지](https://www.designdb.com/?menuno=1278&bbsno=3012&siteno=15&act=view&ztag=rO0ABXQAOTxjYWxsIHR5cGU9ImJvYXJkIiBubz0iOTg4IiBza2luPSJwaG90b19iYnNfMjAxOSI+PC9jYWxsPg%3D%3D) (인간적인 디자인, 높은 채도, 마이크로 인터랙션)
- Toss Tech — [디자인 시스템 다시 생각해보기](https://toss.tech/article/rethinking-design-system), [TDS 소개](https://tossmini-docs.toss.im/tds-mobile/), [앱인토스 TDS 컴포넌트](https://developers-apps-in-toss.toss.im/design/components.md) (Button·BottomCTA·ListRow·BottomSheet 구성)
- fuselab — [Dashboard Design Trends 2026](https://fuselabcreative.com/top-dashboard-design-trends-2025/), weweb — [Admin Dashboard in 2026](https://www.weweb.io/blog/admin-dashboard-ultimate-guide-templates-examples) (KPI 3~5개, 점진적 공개)
- mindinventory — [Mobile App UI/UX Design Trends 2026](https://www.mindinventory.com/blog/mobile-app-ui-ux-design-trends/), designstudiouiux — [13 Mobile App UI/UX Design Trends](https://www.designstudiouiux.com/blog/mobile-app-ui-ux-design-trends/)
- 크몽 — [사용자를 끌어들이는 교육앱 디자인 트렌드](https://kmong.com/article/1879--%EC%82%AC%EC%9A%A9%EC%9E%90%EB%A5%BC-%EB%81%8C%EC%96%B4%EB%93%A4%EC%9D%B4%EB%8A%94-%EA%B5%90%EC%9C%A1%EC%95%B1-%EB%94%94%EC%9E%90%EC%9D%B8-%ED%8A%B8%EB%A0%8C%EB%93%9C) (성인 대상은 미니멀한 색)
- Medium — [School Management App — UX Case Study (2026-02)](https://medium.com/@tedduakanksha/school-management-app-ux-case-study-957326d636aa), KB알다 — [홈 개편 이야기](https://aldadesign.medium.com/%EC%95%8C%EB%8B%A4-%EC%95%B1-%EB%94%94%EC%9E%90%EC%9D%B8-%EB%A6%AC%EB%89%B4%EC%96%BC-%EC%9D%B4%EC%95%BC%EA%B8%B0-3-9e0be727a81b) (본문은 접근 제한으로 제목·요지만 참고)
- 국내 앱 참고: [하이클래스](https://www.hiclass.net/), [클래스팅](https://apps.apple.com/kr/app/%ED%81%B4%EB%9E%98%EC%8A%A4%ED%8C%85/id510033756), [클래스업](https://classup.io/)

> 주의: 토스 TDS 의 세부 수치(버튼 높이·반지름)는 공개 문서 요약본에서 가져와 정확하지 않을 수 있다. 우리 값은 iOS 가이드와 우리 8pt 격자로 정한다.

## 6. 적용 결과 (2026-09-04)

- A1 하단 고정 CTA: 오늘(저장하고 알리기), 공지 쓰기(올리고 알리기 + 취소), 학생 편집(저장 + 취소), 결석 미리 알리기(원장님께 알리기 + 취소). 바는 탭바 뒤까지 내려와 사이 틈으로 내용이 비치지 않게 함. PC 모드에서는 본문 열 폭에 맞춰 창 하단 고정.
- A2 스크롤 제목: 탭 루트에서 큰 제목이 앱바 밑으로 들어가면 앱바에 17px 제목이 150ms 로 나타남(IntersectionObserver, `.view` 를 루트로).
- A3 알약 탭바: 16px 띄운 24px 둥근 바, 얇은 테두리 + 옅은 그림자, 내용은 뒤로 흐르고 마지막 24px 페이드. 유리 효과 없음.
- A4 동심 반지름: `--r-card 16 / --r-el 12 / --r-tag 8 / --r-sheet 20`. 버튼 14→12, 세그먼트 14/10→12/8, 태그 6→8, 토스트·업데이트 띠 →16, 시트 →20, 템플릿 칩 999→8.
- A5 마이크로 인터랙션: 출석 ○△✕ 와 체크 원이 켜질 때 1.12 배 팝(클릭 때만, 마운트 때는 안 함), 저장 성공 시 CTA 안에 체크 + "알렸어요" 0.9초. `prefers-reduced-motion` 이면 전부 꺼짐.
- 확인: 폰 밝음/어두움 53장, PC 좌측 내비 + 데스크톱 폰 프레임 6장. 시트 `tests/app-verify-trend-{phone-light,phone-dark,pc}.png`. 고친 것: PC 앱바 종이 왼쪽으로 붙던 것(로고 숨김 뒤 정렬), 좁은 프레임에서 요약 타일 줄바꿈.
- 참고: 검증 중 원장 번호가 인증 발송 제한(10분 3회)에 걸려 PC 확인은 강사 계정으로 했다(같은 레이아웃).
