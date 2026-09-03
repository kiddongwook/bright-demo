-- 9주차: 담당 강사를 "번호로" 지정한다.
-- 그동안 classes.teacher_id 는 users(id) 라, 아직 앱에 안 들어온 강사(users 행이 없다)는 고를 수 없었다.
-- → classes.teacher_phone 을 두어 원장이 명부에 넣자마자 배정하고, 그 강사가 처음 들어올 때 teacher_id 를 이어 준다.

alter table classes add column if not exists teacher_phone text;
update classes c set teacher_phone = u.phone from users u where c.teacher_id = u.id and c.teacher_phone is null;

-- 강사를 명부에서 빼면 담당 반도 같이 푼다 (번호·사용자 양쪽)
create or replace function roster_remove_teacher(p_phone text) returns void language plpgsql security definer set search_path = public as $$
declare ph text := normalize_phone(p_phone); u uuid;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  delete from roster_phones where academy_id = current_academy_id() and phone = ph and role = 'teacher';
  update classes set teacher_phone = null where academy_id = current_academy_id() and teacher_phone = ph;
  select id into u from users where phone = ph;
  if u is not null then
    delete from memberships where user_id = u and academy_id = current_academy_id() and role = 'teacher';
    update classes set teacher_id = null where academy_id = current_academy_id() and teacher_id = u;
  end if;
end $$;

-- 반의 담당 강사 배정: 명부에 있는 강사 번호면 된다. 아직 안 들어왔으면 teacher_id 는 null 로 두고 번호만 잡아 둔다.
create or replace function assign_class_teacher(p_class uuid, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare ph text := normalize_phone(p_phone); a uuid := current_academy_id();
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if not exists (select 1 from classes where id = p_class and academy_id = a) then raise exception 'not found'; end if;
  if ph = '' then
    update classes set teacher_phone = null, teacher_id = null where id = p_class;
    return;
  end if;
  if not exists (select 1 from roster_phones where academy_id = a and phone = ph and role = 'teacher') then raise exception 'not a teacher'; end if;
  update classes set teacher_phone = ph, teacher_id = (select id from users where phone = ph) where id = p_class;
end $$;
revoke execute on function assign_class_teacher(uuid, text) from public, anon;

-- 강사가 처음 들어올 때 otp-verify 가 부른다: 번호로 잡아 둔 반에 사용자를 이어 준다.
create or replace function link_teacher_classes(p_user uuid, p_phone text) returns int
language plpgsql security definer set search_path = public as $$
declare ph text := normalize_phone(p_phone); cnt int;
begin
  if ph = '' or p_user is null then return 0; end if;
  update classes set teacher_id = p_user
   where teacher_phone = ph and teacher_id is null
     and academy_id in (select academy_id from roster_phones where phone = ph and role = 'teacher');
  get diagnostics cnt = row_count;
  return cnt;
end $$;
revoke execute on function link_teacher_classes(uuid, text) from public, anon, authenticated;
grant execute on function link_teacher_classes(uuid, text) to service_role;
