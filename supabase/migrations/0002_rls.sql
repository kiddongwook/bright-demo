-- 헬퍼: 전부 security definer + search_path 고정. 권한의 기준은 users.active_membership_id.
create function current_membership() returns memberships language sql stable security definer set search_path = public as $$
  select m.* from memberships m join users u on u.active_membership_id = m.id where u.id = auth.uid() $$;
create function current_academy_id() returns uuid language sql stable security definer set search_path = public as $$
  select (current_membership()).academy_id $$;
create function current_role_() returns user_role language sql stable security definer set search_path = public as $$
  select (current_membership()).role $$;
create function is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select current_role_() in ('director','teacher') $$;
create function my_student_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  select (current_membership()).student_id where (current_membership()).student_id is not null $$;
create function my_class_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  select case when is_staff() then c.id else e.class_id end
  from classes c left join enrollments e on e.class_id = c.id and e.student_id in (select my_student_ids())
  where c.academy_id = current_academy_id() and (is_staff() or e.class_id is not null) $$;

-- 로그인 뒤 역할·자녀 선택: 본인 membership 만 고를 수 있다
create function set_active_membership(m uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from memberships where id = m and user_id = auth.uid()) then raise exception 'not your membership'; end if;
  update users set active_membership_id = m where id = auth.uid();
end $$;

alter table academies        enable row level security;
alter table users            enable row level security;
alter table memberships      enable row level security;
alter table classes          enable row level security;
alter table students         enable row level security;
alter table enrollments      enable row level security;
alter table guardians        enable row level security;
alter table roster_phones    enable row level security;   -- 정책 없음: 서비스 키만
alter table attendance       enable row level security;
alter table absence_requests enable row level security;
alter table notices          enable row level security;
alter table notice_reads     enable row level security;
alter table inquiries        enable row level security;
alter table faqs             enable row level security;
alter table todos            enable row level security;
alter table todo_done        enable row level security;
alter table notes            enable row level security;
alter table calendar         enable row level security;
alter table notifications    enable row level security;
alter table link_tokens      enable row level security;   -- 정책 없음
alter table outbox           enable row level security;   -- 정책 없음
alter table otp_codes        enable row level security;   -- 정책 없음
alter table audit_log        enable row level security;   -- 정책 없음

create policy academies_read  on academies for select using (id = current_academy_id());
create policy academies_write on academies for update using (id = current_academy_id() and current_role_() = 'director');

create policy users_self      on users for select using (id = auth.uid());
create policy users_staff     on users for select using (is_staff() and id in (select user_id from memberships where academy_id = current_academy_id()));
create policy users_self_upd  on users for update using (id = auth.uid()) with check (id = auth.uid());

create policy memberships_self  on memberships for select using (user_id = auth.uid());
create policy memberships_staff on memberships for select using (is_staff() and academy_id = current_academy_id());

create policy classes_read  on classes for select using (academy_id = current_academy_id());
create policy classes_write on classes for all using (is_staff() and academy_id = current_academy_id()) with check (is_staff() and academy_id = current_academy_id());

create policy students_read  on students for select using (academy_id = current_academy_id() and (is_staff() or id in (select my_student_ids())));
create policy students_write on students for all using (is_staff() and academy_id = current_academy_id()) with check (is_staff() and academy_id = current_academy_id());

create policy enrollments_read  on enrollments for select using (student_id in (select id from students where academy_id = current_academy_id()) and (is_staff() or student_id in (select my_student_ids())));
create policy enrollments_write on enrollments for all using (is_staff() and class_id in (select id from classes where academy_id = current_academy_id())) with check (is_staff() and class_id in (select id from classes where academy_id = current_academy_id()));

create policy guardians_read  on guardians for select using (student_id in (select id from students where academy_id = current_academy_id()) and (is_staff() or user_id = auth.uid()));
create policy guardians_write on guardians for all using (is_staff() and student_id in (select id from students where academy_id = current_academy_id())) with check (is_staff() and student_id in (select id from students where academy_id = current_academy_id()));

create policy attendance_read  on attendance for select using (academy_id = current_academy_id() and (is_staff() or student_id in (select my_student_ids())));
create policy attendance_write on attendance for all using (is_staff() and academy_id = current_academy_id()) with check (is_staff() and academy_id = current_academy_id());

create policy absence_read   on absence_requests for select using (academy_id = current_academy_id() and (is_staff() or student_id in (select my_student_ids())));
create policy absence_parent on absence_requests for insert with check (academy_id = current_academy_id() and current_role_() = 'parent' and requested_by = auth.uid() and student_id in (select my_student_ids()));
create policy absence_staff  on absence_requests for update using (is_staff() and academy_id = current_academy_id()) with check (is_staff() and academy_id = current_academy_id());

create policy notices_read  on notices for select using (academy_id = current_academy_id() and (is_staff() or target_class_id is null or target_class_id in (select my_class_ids())));
create policy notices_write on notices for all using (is_staff() and academy_id = current_academy_id()) with check (is_staff() and academy_id = current_academy_id());

create policy notice_reads_read on notice_reads for select using (user_id = auth.uid() or (is_staff() and notice_id in (select id from notices where academy_id = current_academy_id())));
create policy notice_reads_ins  on notice_reads for insert with check (user_id = auth.uid() and notice_id in (select id from notices where academy_id = current_academy_id()));

create policy inquiries_read   on inquiries for select using (academy_id = current_academy_id() and (is_staff() or asked_by = auth.uid()));
create policy inquiries_parent on inquiries for insert with check (academy_id = current_academy_id() and current_role_() = 'parent' and asked_by = auth.uid() and (student_id is null or student_id in (select my_student_ids())));
create policy inquiries_staff  on inquiries for update using (is_staff() and academy_id = current_academy_id()) with check (is_staff() and academy_id = current_academy_id());

create policy faqs_read  on faqs for select using (academy_id = current_academy_id());
create policy faqs_write on faqs for all using (is_staff() and academy_id = current_academy_id()) with check (is_staff() and academy_id = current_academy_id());

create policy todos_read  on todos for select using (academy_id = current_academy_id() and (is_staff() or class_id in (select my_class_ids())));
create policy todos_write on todos for all using (is_staff() and academy_id = current_academy_id()) with check (is_staff() and academy_id = current_academy_id());

create policy todo_done_read    on todo_done for select using (todo_id in (select id from todos where academy_id = current_academy_id()) and (is_staff() or student_id in (select my_student_ids())));
create policy todo_done_student on todo_done for all using (current_role_() = 'student' and student_id in (select my_student_ids())) with check (current_role_() = 'student' and student_id in (select my_student_ids()));

create policy notes_staff on notes for all using (is_staff() and academy_id = current_academy_id()) with check (is_staff() and academy_id = current_academy_id());

create policy calendar_read  on calendar for select using (academy_id = current_academy_id());
create policy calendar_write on calendar for all using (is_staff() and academy_id = current_academy_id()) with check (is_staff() and academy_id = current_academy_id());

create policy notifications_own on notifications for select using (user_id = auth.uid());
create policy notifications_upd on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
