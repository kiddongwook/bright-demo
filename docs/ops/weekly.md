# 학부모 주간 요약 (0029)

- **언제**: 학원마다 정한 요일·시(기본 **금 18:00**, KST)에 한 번. 크론 `weekly-summary` 가 매시 정각에 `weekly_summary_tick()` 을 돌리고, 요일·시가 맞고 이번 주(월요일 0시 이후)에 아직 안 보낸 학원만 `weekly_summary_for(학원, 이번 주 월요일)` 을 부른 뒤 `academies.weekly_last_at` 을 찍는다. 학원 하나가 실패해도 나머지는 간다(warning 만 남긴다).
- **무엇을**: 학부모(학생이 붙은 membership, 재원생만)에게 알림 `kind='weekly'` — 제목 "이번 주 박지훈 요약", 본문 "출석 3 · 지각 1 · 결석 0 · 숙제 2/3 · 다음 수업 월 19:00" (120자 안, 링크 `child:`). 숙제는 이번 주 마감인 `homework` 만 세고, 다음 수업은 시간표에서 14일 안 가장 이른 것(휴원일은 건너뜀 · 14일 안에 없으면 "다음 수업 없음"). 원장에게는 "이번 주 요약 · 출석률 92% · 미납 2건" (링크 `today:`; 출석률 = (출석+지각)/(출석+지각+결석), 미납 = invoices issued/partial/overdue).
- **끄기 — 학원**: 원장 더보기 → 우리 학원 → "주간 요약" 줄에서 끄기·요일·시(06~22) 를 고른다(`academies.weekly_summary/weekly_dow/weekly_hour`, academies_write). **끄기 — 학부모**: 알림 설정 → "주간 요약 받기" 체크를 지운다(`users.prefs.weekly=false`, 기본 켬).
- **비용**: 0. 트리거가 `WEEKLY` 는 `k=null` 로 두어 **푸시 줄만** 세운다(알림톡·문자 없음). 푸시 구독이 없는 사람은 앱 안 알림(종)만 남는다. 푸시 문구는 `_shared/push.ts` 가 제목 + params['요약'] 으로 그린다.
- **다시 보내기 / 손으로**: `select weekly_summary_for('<academy uuid>', date '2026-09-07')` (service role). 같은 주에 이미 받은 사람(user·title·created_at ≥ 월요일)은 건너뛰므로 여러 번 불러도 안전하다.
- **테스트**: `node --env-file=../.env.local tools/weekly-test.mjs` (접두어 `wk-`).
