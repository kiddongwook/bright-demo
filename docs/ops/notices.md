# 공지 예약 발송 (0027)

## 어떻게 도는가
`notices.publish_at`(나갈 시각, 기본 now()) · `notices.fanned_at`(실제로 알림을 뿌린 시각). 뿌리기 본체는 `notice_fanout(nid)` 하나 — 먼저 `fanned_at` 을 찍고(이미 찍혀 있으면 아무 일도 안 함) 대상 학부모·학생에게 `notifications` 를 넣는다. 그 뒤는 예전과 같다(알림 → outbox → 푸시·카톡).
- 지금 보내기(`publish_at <= now()`): 넣는 트랜잭션 끝에서 제약 트리거 `notices_notify` 가 바로 `notice_fanout` 을 부른다.
- 예약(미래): 매분 크론 `notices-publish` → `publish_due_notices()` 가 `publish_at <= now() and fanned_at is null` 인 것을 차례로 뿌린다. 예약 공지는 알림이 없으므로 outbox 에도 아무것도 서지 않는다.
- 원장 화면: 목록의 "예약 · 9/6 08:00" 줄을 누르면 시간 바꾸기 / 지금 보내기 / 삭제. 서버는 `reschedule_notice(nid, at)` (null 이면 바로 뿌림, 90일 넘게는 `bad_time`).

## 누가 보나
스태프가 아니면 `publish_at > now()` 인 공지는 없는 것과 같다 — `notice_visible_of` 한 곳에서 막고, `notices_read` · `notice_targets_read` · `notice_reads_ins`(부른 사람의 notices RLS 를 탄다) 가 모두 그 함수를 지난다. `notice_readers` · `remind_notice` 는 나가기 전이면 `not_published`. `todos.notice_id` 로 걸린 숙제·시험은 공지와 따로 보인다.

## 휴원일 결정
휴원·특강 공지를 예약해도 달력(휴원일·특강·보강)은 **작성 시점에 바로** 들어간다 — 휴원은 사실이고 학부모가 미리 알수록 좋다. 공지 문구만 예약 시각에 나간다.

## 보는 법
- 기다리는 예약: `select id, title, publish_at from notices where fanned_at is null order by publish_at;`
- 크론이 도는지: `select status, start_time from cron.job_run_details where jobname = 'notices-publish' order by start_time desc limit 5;`
- 손으로 깨우기(service role): `select publish_due_notices();`
