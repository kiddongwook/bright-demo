-- 5주차: 강사는 담당 반·그 반 학생만 (읽기·쓰기). 학원 단위 관리는 원장만. 재입학. calendar unique 정리.

-- 0. 범위 헬퍼
create or replace function staff_class_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from classes c where c.academy_id = current_academy_id()
    and (current_role_() = 'director' or (current_role_() = 'teacher' and c.teacher_id = auth.uid())) $$;
create or replace function staff_student_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from students s where s.academy_id = current_academy_id()
    and (current_role_() = 'director' or s.id in (select e.student_id from enrollments e where e.class_id in (select staff_class_ids()))) $$;
-- 내 반: staff 는 범위 안의 반, 학부모·학생은 자녀·본인이 듣는 반 (공지·할 것 읽기가 이걸 본다)
create or replace function my_class_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from classes c where c.academy_id = current_academy_id()
    and ((is_staff() and c.id in (select staff_class_ids()))
      or c.id in (select e.class_id from enrollments e where e.student_id in (select my_student_ids()))) $$;

-- 1. 정책 교체
drop policy if exists users_staff on users;
create policy users_staff on users for select using (is_staff() and id in (
  select user_id from memberships where academy_id = current_academy_id()
    and (role in ('director','teacher') or student_id in (select staff_student_ids()))));
drop policy if exists memberships_staff on memberships;
create policy memberships_staff on memberships for select using (is_staff() and academy_id = current_academy_id()
  and (role in ('director','teacher') or student_id in (select staff_student_ids())));

drop policy if exists classes_write on classes;
create policy classes_write on classes for all using (current_role_() = 'director' and academy_id = current_academy_id()) with check (current_role_() = 'director' and academy_id = current_academy_id());

drop policy if exists students_read on students;
create policy students_read on students for select using (academy_id = current_academy_id() and (id in (select staff_student_ids()) or id in (select my_student_ids())));
drop policy if exists students_write on students;
create policy students_write on students for all using (current_role_() = 'director' and academy_id = current_academy_id()) with check (current_role_() = 'director' and academy_id = current_academy_id());

drop policy if exists enrollments_read on enrollments;
create policy enrollments_read on enrollments for select using (student_id in (select staff_student_ids()) or student_id in (select my_student_ids()));
drop policy if exists enrollments_write on enrollments;
create policy enrollments_write on enrollments for all using (current_role_() = 'director' and class_id in (select id from classes where academy_id = current_academy_id()))
  with check (current_role_() = 'director' and class_id in (select id from classes where academy_id = current_academy_id()));

drop policy if exists guardians_read on guardians;
create policy guardians_read on guardians for select using (student_id in (select staff_student_ids()) or user_id = auth.uid());
drop policy if exists guardians_write on guardians;
create policy guardians_write on guardians for all using (current_role_() = 'director' and student_id in (select id from students where academy_id = current_academy_id()))
  with check (current_role_() = 'director' and student_id in (select id from students where academy_id = current_academy_id()));

drop policy if exists attendance_read on attendance;
create policy attendance_read on attendance for select using (academy_id = current_academy_id() and (student_id in (select staff_student_ids()) or student_id in (select my_student_ids())));
drop policy if exists attendance_write on attendance;
create policy attendance_write on attendance for all using (academy_id = current_academy_id() and class_id in (select staff_class_ids()))
  with check (academy_id = current_academy_id() and class_id in (select staff_class_ids()));

drop policy if exists absence_read on absence_requests;
create policy absence_read on absence_requests for select using (academy_id = current_academy_id() and (student_id in (select staff_student_ids()) or student_id in (select my_student_ids())));
drop policy if exists absence_staff on absence_requests;
create policy absence_staff on absence_requests for update using (academy_id = current_academy_id() and student_id in (select staff_student_ids()))
  with check (academy_id = current_academy_id() and student_id in (select staff_student_ids()));

drop policy if exists notices_read on notices;
create policy notices_read on notices for select using (academy_id = current_academy_id() and (target_class_id is null or target_class_id in (select my_class_ids())));
drop policy if exists notices_write on notices;
create policy notices_write on notices for all using (academy_id = current_academy_id() and (current_role_() = 'director' or target_class_id in (select staff_class_ids())))
  with check (academy_id = current_academy_id() and (current_role_() = 'director' or target_class_id in (select staff_class_ids())));

drop policy if exists inquiries_read on inquiries;
create policy inquiries_read on inquiries for select using (academy_id = current_academy_id() and (asked_by = auth.uid()
  or (is_staff() and (student_id in (select staff_student_ids()) or (student_id is null and current_role_() = 'director')))));
drop policy if exists inquiries_staff on inquiries;
create policy inquiries_staff on inquiries for update using (academy_id = current_academy_id() and is_staff() and (student_id in (select staff_student_ids()) or (student_id is null and current_role_() = 'director')))
  with check (academy_id = current_academy_id() and is_staff() and (student_id in (select staff_student_ids()) or (student_id is null and current_role_() = 'director')));

drop policy if exists faqs_write on faqs;
create policy faqs_write on faqs for all using (current_role_() = 'director' and academy_id = current_academy_id()) with check (current_role_() = 'director' and academy_id = current_academy_id());

drop policy if exists todos_read on todos;
create policy todos_read on todos for select using (academy_id = current_academy_id() and class_id in (select my_class_ids()));
drop policy if exists todos_write on todos;
create policy todos_write on todos for all using (academy_id = current_academy_id() and class_id in (select staff_class_ids())) with check (academy_id = current_academy_id() and class_id in (select staff_class_ids()));
drop policy if exists todo_done_read on todo_done;
create policy todo_done_read on todo_done for select using (todo_id in (select id from todos where academy_id = current_academy_id()) and (student_id in (select staff_student_ids()) or student_id in (select my_student_ids())));

drop policy if exists notes_staff on notes;
create policy notes_staff on notes for all using (academy_id = current_academy_id() and student_id in (select staff_student_ids())) with check (academy_id = current_academy_id() and student_id in (select staff_student_ids()));

drop policy if exists calendar_write on calendar;
create policy calendar_write on calendar for all using (current_role_() = 'director' and academy_id = current_academy_id()) with check (current_role_() = 'director' and academy_id = current_academy_id());

-- 2. RPC 범위
create or replace function notice_readers(nid uuid) returns table (user_id uuid, name text, read_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare n notices;
begin
  select * into n from notices where id = nid;
  if n.id is null or n.academy_id <> current_academy_id() or not is_staff()
     or not (n.target_class_id is null and current_role_() = 'director' or n.target_class_id in (select staff_class_ids())) then raise exception 'not allowed'; end if;
  return query
    select a, u.name, r.read_at from notice_audience(n, array['parent']::user_role[]) a
    join users u on u.id = a left join notice_reads r on r.notice_id = n.id and r.user_id = a
    order by r.read_at nulls first, u.name;
end $$;
create or replace function remind_notice(nid uuid) returns int language plpgsql security definer set search_path = public as $$
declare n notices; cnt int;
begin
  select * into n from notices where id = nid;
  if n.id is null or n.academy_id <> current_academy_id() or not is_staff()
     or not (n.target_class_id is null and current_role_() = 'director' or n.target_class_id in (select staff_class_ids())) then raise exception 'not allowed'; end if;
  insert into notifications (academy_id, user_id, kind, title, body, link)
  select n.academy_id, a, 'remind', '「' || n.title || '」 아직 안 읽으셨어요', '원장님이 다시 알렸어요', 'notice-view:' || n.id
  from notice_audience(n, array['parent']::user_role[]) a
  where not exists (select 1 from notice_reads r where r.notice_id = n.id and r.user_id = a);
  get diagnostics cnt = row_count;
  update notices set reminded_at = now() where id = nid;
  return cnt;
end $$;
create or replace function week_attendance(sid uuid, d_from date, d_to date) returns table (date date, status att_status, arrived_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.date, a.status, a.arrived_at from attendance a
  where a.student_id = sid and a.date between d_from and d_to
    and a.academy_id = current_academy_id() and (sid in (select staff_student_ids()) or sid in (select my_student_ids()))
  order by a.date $$;
create or replace function month_attendance(sid uuid, ym text) returns table (date date, status att_status)
language sql stable security definer set search_path = public as $$
  select a.date, a.status from attendance a
  where a.student_id = sid and a.academy_id = current_academy_id()
    and (sid in (select staff_student_ids()) or sid in (select my_student_ids()))
    and to_char(a.date, 'YYYY-MM') = ym
  order by a.date $$;
create or replace function student_timeline(sid uuid, lim int) returns table (ts timestamptz, kind text, title text, body text, ref uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() or sid not in (select staff_student_ids()) then raise exception 'not allowed'; end if;
  return query
  select * from (
    select a.created_at, 'attendance'::text, to_char(a.date, 'MM/DD') || ' ' || case a.status when 'late' then '지각' when 'absent' then '결석' else '보강 출석' end, coalesce(a.note, ''), a.id
      from attendance a where a.student_id = sid and a.academy_id = current_academy_id() and a.status in ('late','absent','makeup')
    union all
    select r.created_at, 'absence'::text, to_char(r.date, 'MM/DD') || ' 결석 신청' || case r.status when 'confirmed' then ' → ' || case when r.makeup_kind = 'material' then '자료 대체' else '보강 ' || to_char(r.makeup_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI') end || case when r.attended_at is not null then ' (완료)' else '' end when 'declined' then ' (보류)' else ' (확인 중)' end, r.reason, r.id
      from absence_requests r where r.student_id = sid and r.academy_id = current_academy_id()
    union all
    select i.created_at, 'inquiry'::text, '문의: ' || i.topic || case when i.answer is not null then ' (답변함)' else ' (답변 대기)' end, i.body, i.id
      from inquiries i where i.student_id = sid and i.academy_id = current_academy_id()
    union all
    select n.created_at, 'note'::text, case n.kind when 'consult' then '상담' else '메모' end, n.body, n.id
      from notes n where n.student_id = sid and n.academy_id = current_academy_id()
  ) t(ts, kind, title, body, ref)
  order by t.ts desc limit lim;
end $$;
create or replace function roster_of_student(sid uuid) returns table (phone text, role user_role)
language sql stable security definer set search_path = public as $$
  select phone, role from roster_phones where student_id = sid and academy_id = current_academy_id() and sid in (select staff_student_ids()) order by role, phone $$;
create or replace function makeup_attended(aid uuid) returns void language plpgsql security definer set search_path = public as $$
declare r absence_requests; cid uuid;
begin
  select * into r from absence_requests where id = aid and academy_id = current_academy_id();
  if r.id is null or not is_staff() or r.student_id not in (select staff_student_ids()) or r.status <> 'confirmed' then raise exception 'not allowed'; end if;
  update absence_requests set attended_at = now() where id = aid;
  if r.makeup_kind = 'saturday' and r.makeup_at is not null then
    select e.class_id into cid from enrollments e join classes c on c.id = e.class_id where e.student_id = r.student_id order by c.name limit 1;
    if cid is not null then
      insert into attendance (academy_id, student_id, class_id, date, status, marked_by)
      values (r.academy_id, r.student_id, cid, (r.makeup_at at time zone 'Asia/Seoul')::date, 'makeup', auth.uid())
      on conflict (student_id, class_id, date) do update set status = 'makeup';
    end if;
  end if;
end $$;
create or replace function list_teachers() returns table (user_id uuid, name text, phone text)
language sql stable security definer set search_path = public as $$
  select us.id, rp.name, rp.phone from roster_phones rp left join users us on us.phone = rp.phone
  where rp.academy_id = current_academy_id() and rp.role = 'teacher' and current_role_() = 'director' order by rp.name $$;

-- 3. 명부 RPC 는 원장만. 저장하면 퇴원생도 다시 다닌다(재입학).
create or replace function roster_save_student(sid uuid, p_name text, p_class_ids uuid[], p_student_phone text, p_parent_phones text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id(); s uuid := sid; ph text; u uuid; keep text[] := '{}'; r record;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'name required'; end if;
  if s is null then insert into students (academy_id, name) values (a, trim(p_name)) returning id into s;
  else
    if not exists (select 1 from students where id = s and academy_id = a) then raise exception 'not found'; end if;
    update students set name = trim(p_name), status = 'active', left_at = null where id = s;
  end if;
  if exists (select 1 from unnest(coalesce(p_class_ids, '{}'::uuid[])) c where c not in (select id from classes where academy_id = a)) then raise exception 'bad class'; end if;
  delete from enrollments where student_id = s and class_id <> all(coalesce(p_class_ids, '{}'::uuid[]));
  insert into enrollments (student_id, class_id) select s, c from unnest(coalesce(p_class_ids, '{}'::uuid[])) c on conflict do nothing;
  ph := normalize_phone(p_student_phone);
  if ph <> '' then
    keep := keep || ph;
    insert into roster_phones (academy_id, phone, role, name, student_id) values (a, ph, 'student', trim(p_name), s)
      on conflict (academy_id, phone, role, student_id) do update set name = excluded.name;
    select id into u from users where phone = ph;
    if u is not null then
      insert into memberships (user_id, academy_id, role, student_id) values (u, a, 'student', s) on conflict (user_id, academy_id, role, student_id) do nothing;
      update students set user_id = u where id = s;
    end if;
  end if;
  foreach ph in array coalesce(p_parent_phones, '{}'::text[]) loop
    ph := normalize_phone(ph); if ph = '' then continue; end if;
    keep := keep || ph;
    insert into roster_phones (academy_id, phone, role, name, student_id) values (a, ph, 'parent', trim(p_name) || ' 학부모', s)
      on conflict (academy_id, phone, role, student_id) do nothing;
    select id into u from users where phone = ph;
    if u is not null then
      insert into memberships (user_id, academy_id, role, student_id) values (u, a, 'parent', s) on conflict (user_id, academy_id, role, student_id) do nothing;
      insert into guardians (student_id, user_id) values (s, u) on conflict do nothing;
    end if;
  end loop;
  for r in select rp.phone, rp.role, us.id as uid from roster_phones rp left join users us on us.phone = rp.phone where rp.student_id = s and rp.phone <> all(keep) loop
    if r.uid is not null then
      delete from memberships where user_id = r.uid and student_id = s;
      delete from guardians where user_id = r.uid and student_id = s;
      if r.role = 'student' then update students set user_id = null where id = s and user_id = r.uid; end if;
    end if;
  end loop;
  delete from roster_phones where student_id = s and phone <> all(keep);
  return s;
end $$;
create or replace function student_leave(sid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if current_role_() <> 'director' or not exists (select 1 from students where id = sid and academy_id = current_academy_id()) then raise exception 'not allowed'; end if;
  update students set status = 'left', left_at = now() where id = sid;
  delete from memberships where student_id = sid;
  delete from guardians where student_id = sid;
  delete from roster_phones where student_id = sid;
  delete from enrollments where student_id = sid;
end $$;

-- 4. calendar unique: class_id null(전체) 도 중복을 막는다
with ranked as (select id, row_number() over (partition by academy_id, date, kind order by id) rn from calendar where class_id is null)
delete from calendar where id in (select id from ranked where rn > 1);
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'calendar'::regclass and contype = 'u' loop execute format('alter table calendar drop constraint %I', c); end loop;
end $$;
alter table calendar add constraint calendar_academy_date_kind_class_key unique nulls not distinct (academy_id, date, kind, class_id);
