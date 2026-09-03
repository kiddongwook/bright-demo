-- 알림은 트리거가 만든다. 화면은 자기 일만 한다.
create or replace function notice_audience(n notices, roles user_role[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct m.user_id from memberships m
  where m.academy_id = n.academy_id and m.role = any(roles)
    and (n.target_class_id is null or m.student_id in (select student_id from enrollments where class_id = n.target_class_id)) $$;

create or replace function trg_notice_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (academy_id, user_id, kind, title, body, link)
  select new.academy_id, a, 'notice', '새 공지 「' || new.title || '」', '', 'notice-view:' || new.id
  from notice_audience(new, array['parent','student']::user_role[]) a;
  return new;
end $$;
create trigger notices_notify after insert on notices for each row execute function trg_notice_insert();

create or replace function trg_inquiry() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, m.user_id, 'inquiry', (select name from users where id = new.asked_by) || '이 문의를 보냈어요', new.topic, 'inbox:' || new.id
    from memberships m where m.academy_id = new.academy_id and m.role in ('director','teacher');
  elsif tg_op = 'UPDATE' and new.answer is not null and old.answer is null then
    insert into notifications (academy_id, user_id, kind, title, body, link)
    values (new.academy_id, new.asked_by, 'inquiry', '원장님이 문의에 답했어요', new.topic, 'ask-mine:' || new.id);
  end if;
  return new;
end $$;
create trigger inquiries_notify after insert or update on inquiries for each row execute function trg_inquiry();

create or replace function trg_absence() returns trigger language plpgsql security definer set search_path = public as $$
declare sname text;
begin
  select name into sname from students where id = new.student_id;
  if tg_op = 'INSERT' then
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, m.user_id, 'absence', sname || ' ' || to_char(new.date, 'MM/DD') || ' 결석 신청이 왔어요', new.reason, 'today:' || new.id
    from memberships m where m.academy_id = new.academy_id and m.role in ('director','teacher');
  elsif tg_op = 'UPDATE' and new.status = 'confirmed' and old.status <> 'confirmed' then
    insert into notifications (academy_id, user_id, kind, title, body, link)
    values (new.academy_id, new.requested_by, 'absence', to_char(new.date, 'MM/DD') || ' 결석 → ' ||
      case when new.makeup_kind = 'material' then '자료로 대체' else to_char(new.makeup_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || ' 보강' end,
      '원장님이 잡았어요', 'child:' || new.id);
  end if;
  return new;
end $$;
create trigger absence_notify after insert or update on absence_requests for each row execute function trg_absence();

create or replace function trg_attendance() returns trigger language plpgsql security definer set search_path = public as $$
declare sname text;
begin
  if new.status in ('late','absent') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select name into sname from students where id = new.student_id;
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, g.user_id, 'attendance',
      sname || ' 오늘 ' || case when new.status = 'late' then '지각' else '결석' end || '으로 기록됐어요', to_char(new.date, 'MM/DD'), 'child:'
    from guardians g where g.student_id = new.student_id;
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, s.user_id, 'attendance', '오늘 ' || case when new.status = 'late' then '지각' else '결석' end || '으로 기록됐어요', to_char(new.date, 'MM/DD'), 'me:'
    from students s where s.id = new.student_id and s.user_id is not null;
  end if;
  return new;
end $$;
create trigger attendance_notify after insert or update on attendance for each row execute function trg_attendance();

-- 원장: 읽은 사람 / 안 읽은 사람 (학부모 대상만)
create or replace function notice_readers(nid uuid) returns table (user_id uuid, name text, read_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare n notices;
begin
  select * into n from notices where id = nid;
  if n.id is null or n.academy_id <> current_academy_id() or not is_staff() then raise exception 'not allowed'; end if;
  return query
    select a, u.name, r.read_at from notice_audience(n, array['parent']::user_role[]) a
    join users u on u.id = a left join notice_reads r on r.notice_id = n.id and r.user_id = a
    order by r.read_at nulls first, u.name;
end $$;

-- 원장: 안 읽은 학부모에게 다시 알리기. 알린 수를 돌려준다.
create or replace function remind_notice(nid uuid) returns int language plpgsql security definer set search_path = public as $$
declare n notices; cnt int;
begin
  select * into n from notices where id = nid;
  if n.id is null or n.academy_id <> current_academy_id() or not is_staff() then raise exception 'not allowed'; end if;
  insert into notifications (academy_id, user_id, kind, title, body, link)
  select n.academy_id, a, 'notice', '「' || n.title || '」 아직 안 읽으셨어요', '원장님이 다시 알렸어요', 'notice-view:' || n.id
  from notice_audience(n, array['parent']::user_role[]) a
  where not exists (select 1 from notice_reads r where r.notice_id = n.id and r.user_id = a);
  get diagnostics cnt = row_count;
  update notices set reminded_at = now() where id = nid;
  return cnt;
end $$;

-- 주간 출결 (자기 자녀·본인·staff)
create or replace function week_attendance(sid uuid, d_from date, d_to date) returns table (date date, status att_status, arrived_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.date, a.status, a.arrived_at from attendance a
  where a.student_id = sid and a.date between d_from and d_to
    and a.academy_id = current_academy_id() and (is_staff() or sid in (select my_student_ids()))
  order by a.date $$;
