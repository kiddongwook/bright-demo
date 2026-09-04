-- 출결 사유(지각 "10분", 결석 "병원" …) — 원장이 타일을 길게 눌러 남긴다.
-- 칸은 0001 스키마에 이미 있지만, 옛 DB 를 위해 한 번 더 확인한다.
alter table attendance add column if not exists note text;

-- 학부모·학생 알림 본문에 사유를 붙인다.
-- 0006_outbox.sql 의 본문을 그대로 가져오고(링크에 출결 id 를 싣는 그 판) 본문 한 줄만 늘렸다.
-- 알림톡 ATTENDANCE 템플릿에는 사유 칸이 없다(심사받은 문구라 못 늘린다) — 그래서 params 는 손대지 않고
-- 앱 알림(notifications.title/body)에만 싣는다.
-- 우는 조건은 그대로다: 상태가 바뀔 때만. 상태를 이미 저장한 뒤에 사유만 더하면 알림은 다시 가지 않는다(중복 발송 방지).
create or replace function trg_attendance() returns trigger language plpgsql security definer set search_path = public as $$
declare sname text; why text;
begin
  if new.status in ('late','absent') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select name into sname from students where id = new.student_id;
    why := coalesce(' · ' || nullif(btrim(new.note), ''), '');
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, g.user_id, 'attendance',
      sname || ' 오늘 ' || case when new.status = 'late' then '지각' else '결석' end || '으로 기록됐어요' || why,
      to_char(new.date, 'MM/DD') || why, 'child:' || new.id
    from guardians g where g.student_id = new.student_id;
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, s.user_id, 'attendance',
      '오늘 ' || case when new.status = 'late' then '지각' else '결석' end || '으로 기록됐어요' || why,
      to_char(new.date, 'MM/DD') || why, 'me:' || new.id
    from students s where s.id = new.student_id and s.user_id is not null;
  end if;
  return new;
end $$;
