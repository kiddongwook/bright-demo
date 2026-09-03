-- 4주차: 명부 편집·퇴원·타임라인·월 출결·보강 완결·강사. roster_phones 는 정책이 없으므로 RPC(security definer)로만 만진다.

-- 0. unique 에 null 이 끼면 (원장·강사 행의 student_id) Postgres 는 null 을 서로 다르다고 보아 on conflict 가 안 잡힌다
--    → 로그인마다 원장 소속이 하나씩 늘었다. 중복을 정리하고 NULLS NOT DISTINCT 로 바꾼다 (Postgres 15+).
with ranked as (
  select m.id, row_number() over (partition by m.user_id, m.academy_id, m.role
    order by (exists (select 1 from users u where u.active_membership_id = m.id)) desc, m.created_at) rn
  from memberships m where m.student_id is null)
delete from memberships where id in (select id from ranked where rn > 1);
with ranked as (
  select r.id, row_number() over (partition by r.academy_id, r.phone, r.role order by r.id) rn
  from roster_phones r where r.student_id is null)
delete from roster_phones where id in (select id from ranked where rn > 1);
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'memberships'::regclass and contype = 'u' loop execute format('alter table memberships drop constraint %I', c); end loop;
  for c in select conname from pg_constraint where conrelid = 'roster_phones'::regclass and contype = 'u' loop execute format('alter table roster_phones drop constraint %I', c); end loop;
end $$;
alter table memberships   add constraint memberships_user_academy_role_student_key unique nulls not distinct (user_id, academy_id, role, student_id);
alter table roster_phones add constraint roster_phones_academy_phone_role_student_key unique nulls not distinct (academy_id, phone, role, student_id);

-- 1. 학생 하나의 이름·반·번호를 통째로 맞춘다. sid null 이면 새 학생.
create or replace function roster_save_student(sid uuid, p_name text, p_class_ids uuid[], p_student_phone text, p_parent_phones text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id(); s uuid := sid; ph text; u uuid; keep text[] := '{}'; r record;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'name required'; end if;
  if s is null then insert into students (academy_id, name) values (a, trim(p_name)) returning id into s;
  else
    if not exists (select 1 from students where id = s and academy_id = a) then raise exception 'not found'; end if;
    update students set name = trim(p_name) where id = s;
  end if;
  -- 반: 주어진 목록으로 맞춘다 (모두 이 학원 반이어야)
  if exists (select 1 from unnest(coalesce(p_class_ids, '{}'::uuid[])) c where c not in (select id from classes where academy_id = a)) then raise exception 'bad class'; end if;
  delete from enrollments where student_id = s and class_id <> all(coalesce(p_class_ids, '{}'::uuid[]));
  insert into enrollments (student_id, class_id) select s, c from unnest(coalesce(p_class_ids, '{}'::uuid[])) c on conflict do nothing;
  -- 학생 번호: 하나. 이미 들어와 있는 사용자면 바로 이어 준다.
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
  -- 학부모 번호: 여럿.
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
  -- 빠진 번호: roster 행과 그 번호로 이어진 membership·guardian·학생 연결을 지운다
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

-- 명부의 번호 보기 (staff)
create or replace function roster_of_student(sid uuid) returns table (phone text, role user_role)
language sql stable security definer set search_path = public as $$
  select phone, role from roster_phones where student_id = sid and academy_id = current_academy_id() and is_staff() order by role, phone $$;

-- 2. 퇴원: 데이터는 남기고 접근만 끊는다
create or replace function student_leave(sid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() or not exists (select 1 from students where id = sid and academy_id = current_academy_id()) then raise exception 'not allowed'; end if;
  update students set status = 'left', left_at = now() where id = sid;
  delete from memberships where student_id = sid;
  delete from guardians where student_id = sid;
  delete from roster_phones where student_id = sid;
  delete from enrollments where student_id = sid;
end $$;

-- 3. 학생 타임라인 (원장·강사)
create or replace function student_timeline(sid uuid, lim int) returns table (ts timestamptz, kind text, title text, body text, ref uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not allowed'; end if;
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

-- 4. 월 출결 (자기 자녀·본인·staff)
create or replace function month_attendance(sid uuid, ym text) returns table (date date, status att_status)
language sql stable security definer set search_path = public as $$
  select a.date, a.status from attendance a
  where a.student_id = sid and a.academy_id = current_academy_id()
    and (is_staff() or sid in (select my_student_ids()))
    and to_char(a.date, 'YYYY-MM') = ym
  order by a.date $$;

-- 5. 보강 완결: 왔다고 표시 + 출결에 makeup 행
create or replace function makeup_attended(aid uuid) returns void language plpgsql security definer set search_path = public as $$
declare r absence_requests; cid uuid;
begin
  select * into r from absence_requests where id = aid and academy_id = current_academy_id();
  if r.id is null or not is_staff() or r.status <> 'confirmed' then raise exception 'not allowed'; end if;
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

-- 6. 강사 명부 (원장만 넣고 뺀다). 강사는 staff 로 원장과 같은 권한 — 자기 반으로 좁히는 건 5주차.
create or replace function roster_save_teacher(p_name text, p_phone text) returns void language plpgsql security definer set search_path = public as $$
declare ph text := normalize_phone(p_phone); u uuid;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if ph = '' or trim(coalesce(p_name, '')) = '' then raise exception 'name and phone required'; end if;
  insert into roster_phones (academy_id, phone, role, name) values (current_academy_id(), ph, 'teacher', trim(p_name))
    on conflict (academy_id, phone, role, student_id) do update set name = excluded.name;
  select id into u from users where phone = ph;
  if u is not null then insert into memberships (user_id, academy_id, role) values (u, current_academy_id(), 'teacher') on conflict (user_id, academy_id, role, student_id) do nothing; end if;
end $$;
create or replace function roster_remove_teacher(p_phone text) returns void language plpgsql security definer set search_path = public as $$
declare ph text := normalize_phone(p_phone); u uuid;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  delete from roster_phones where academy_id = current_academy_id() and phone = ph and role = 'teacher';
  select id into u from users where phone = ph;
  if u is not null then
    delete from memberships where user_id = u and academy_id = current_academy_id() and role = 'teacher';
    update classes set teacher_id = null where academy_id = current_academy_id() and teacher_id = u;
  end if;
end $$;
create or replace function list_teachers() returns table (user_id uuid, name text, phone text)
language sql stable security definer set search_path = public as $$
  select us.id, rp.name, rp.phone from roster_phones rp left join users us on us.phone = rp.phone
  where rp.academy_id = current_academy_id() and rp.role = 'teacher' and is_staff() order by rp.name $$;
