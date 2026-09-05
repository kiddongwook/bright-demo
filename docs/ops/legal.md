# 약관·개인정보 처리방침 — 어디 있고 어떻게 올리나

- **원문**은 `docs/legal/terms.md`·`docs/legal/privacy.md`, 사람이 읽는 페이지는 저장소 루트 `legal/terms.html`·`legal/privacy.html`(GitHub Pages `https://kiddongwook.github.io/bright-demo/legal/…`). 소개 페이지 머리와 앱 「더보기 → 앱 정보·진단」에서 연다. 두 짝의 내용은 같아야 한다 — md 를 고치면 html 도 손으로 맞춘다.
- **판 번호는 날짜**(`YYYY-MM-DD`)다. 문서 첫 줄 "변호사 검토 전 초안 (날짜)"·본문의 "판:" 과 `app/src/lib/legal.ts` 의 `TERMS_VERSION`·`PRIVACY_VERSION` 이 같은 날짜여야 한다.
- **판을 올리면 모두 한 번 다시 동의한다.** 앱이 로그인 뒤 `my_consent()` 를 읽어 행이 없거나 어느 판이 낮으면 `Consent` 화면을 띄우고, 「동의하고 시작」이 `accept_terms(판, 판)` 로 본인 행을 upsert 한다(0026). 제한 세션(알림톡 링크)은 건너뛰고 운영자도 동의한다. UX 게이트일 뿐 RLS 강제가 아니다 — 서버에 "누가 어느 판에 언제" 를 남기는 자리. 우회 경로 두 개는 알고 두는 것: ① RPC 를 직접 부르면 동의 없이도 자기 학원 자료를 읽을 수 있다(권한은 소속에서 나온다), ② `my_consent()` 읽기가 실패하면(서버 불통·마이그레이션 전) 앱은 문을 잠그지 않고 통과시킨다(오류 보고는 남긴다).
- 서버 상태는 `consents` 표(`user_id`·`terms_version`·`privacy_version`·`agreed_at`) 한 줄씩. 사용자를 지우면 같이 지워진다. 시험은 `tools/consent-test.mjs`(접두어 `consent-`).
- **변호사 검토 대기.** 두 문서 모두 초안이다. 검토 뒤 본문을 고치고 판 날짜를 올리면 된다. 확정 전 자리: 문의 이메일·전화·개인정보 보호책임자 이름, Supabase 리전(국외면 국외 이전 고지).
