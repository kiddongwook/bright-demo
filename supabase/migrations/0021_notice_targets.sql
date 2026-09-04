-- 6주차: 공지 대상이 여러 반이 될 수 있다.
--
-- 대상(targets)의 뜻 한 곳:
--   notice_targets 줄이 하나라도 있으면 그 반들이 대상,
--   없으면 notices.target_class_id (그것도 null 이면 전체).
-- 옛 공지는 손대지 않는다 — 줄이 없으니 예전과 똑같이 target_class_id 로 읽힌다.
--
-- 보이는 규칙:  전체 공지이거나, 걸린 반 하나라도 내 반(my_class_ids) 이면 보인다.
-- 만지는 규칙:  원장이거나, 걸린 반이 모두 내 담당 반(staff_class_ids) 이면 만진다.
--               전체 공지는 원장만 만진다(예전 규칙 그대로).

-- ---------------------------------------------------------------- 1. 표
create table if not exists notice_targets (
  notice_id uuid not null references notices(id) on delete cascade,
  class_id  uuid not null references classes(id),
  primary key (notice_id, class_id));
create index if not exists notice_targets_class_idx on notice_targets (class_id);

-- 반을 지우려면 공지를 먼저 정리한다(0018 notices.target_class_id 와 같은 뜻).
-- 다만 검사는 트랜잭션 끝으로 미룬다(deferrable). 학원을 통째로 지우면 반과 공지가
-- 같은 cascade 로 함께 지워지는데, 즉시 검사(restrict)는 공지가 지워지기도 전에 터져
-- 학원 삭제(탈퇴·시험 뒷정리)를 통째로 막았다. 미루면 반만 지우려는 손은 그대로 막고
-- (커밋 때 같은 이름으로 터진다 — 화면 안내 문구가 이 이름을 본다) 학원 삭제는 지나간다.
alter table notice_targets drop constraint if exists notice_targets_class_id_fkey;
alter table notice_targets add constraint notice_targets_class_id_fkey
  foreign key (class_id) references classes(id) deferrable initially deferred;
alter table notices drop constraint if exists notices_target_class_id_fkey;
alter table notices add constraint notices_target_class_id_fkey
  foreign key (target_class_id) references classes(id) deferrable initially deferred;
alter table notice_targets enable row level security;
grant select, insert, delete on notice_targets to authenticated;

-- ---------------------------------------------------------------- 2. 대상 셈 헬퍼
-- 행을 이미 손에 쥔 자리(정책의 with check 등)에서는 (nid, tcid) 짝을 넘긴다.
-- 아직 안 보이는 새 행을 notices 에서 다시 읽으면 안 되기 때문이다.
create or replace function notice_class_ids_of(nid uuid, tcid uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce((select array_agg(t.class_id) from notice_targets t where t.notice_id = nid),
                  case when tcid is null then null::uuid[] else array[tcid] end) $$;

-- 이 공지가 걸린 반들. null 이면 전체 공지.
create or replace function notice_class_ids(nid uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select notice_class_ids_of(n.id, n.target_class_id) from notices n where n.id = nid $$;

-- 지금 보고 있는 사람이 이 공지를 볼 수 있나 (학원 대조는 정책이 따로 한다)
create or replace function notice_visible_of(nid uuid, tcid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when notice_class_ids_of(nid, tcid) is null then true
    else notice_class_ids_of(nid, tcid) && coalesce((select array_agg(x) from my_class_ids() x), '{}'::uuid[]) end $$;

-- 어떤 사람(uid)이 이 공지를 볼 수 있나 — 점검·발송이 쓴다. 그 사람의 모든 소속을 본다.
create or replace function notice_visible_to(nid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with n as (select id, academy_id, target_class_id from notices where id = nid),
       t as (select notice_class_ids_of(n.id, n.target_class_id) as cids from n)
  select exists (
    select 1 from memberships m, n, t
    where m.user_id = uid and m.academy_id = n.academy_id
      and (t.cids is null
        or m.role = 'director'
        or (m.role = 'teacher' and exists (select 1 from classes c where c.id = any(t.cids) and c.teacher_id = uid))
        or (m.student_id is not null and exists (select 1 from enrollments e where e.student_id = m.student_id and e.class_id = any(t.cids))))) $$;

-- 지금 보고 있는 staff 가 이 공지를 만질 수 있나
create or replace function notice_manage_of(nid uuid, tcid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when not is_staff() then false
    when current_role_() = 'director' then true
    else (select coalesce(bool_and(cid in (select staff_class_ids())), false)
            from unnest(coalesce(notice_class_ids_of(nid, tcid), '{}'::uuid[])) cid)
  end $$;
create or replace function notice_manage(nid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notices n where n.id = nid and n.academy_id = current_academy_id())
     and notice_manage_of(nid, (select n.target_class_id from notices n where n.id = nid)) $$;
create or replace function notice_readable(nid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notices n where n.id = nid and n.academy_id = current_academy_id()
                   and notice_visible_of(n.id, n.target_class_id)) $$;

-- ---------------------------------------------------------------- 3. 정책
drop policy if exists notices_read on notices;
create policy notices_read on notices for select
  using (academy_id = current_academy_id() and notice_visible_of(id, target_class_id));
drop policy if exists notices_write on notices;
create policy notices_write on notices for all
  using (academy_id = current_academy_id() and notice_manage_of(id, target_class_id))
  with check (academy_id = current_academy_id() and notice_manage_of(id, target_class_id));

drop policy if exists notice_targets_read on notice_targets;
create policy notice_targets_read on notice_targets for select using (notice_readable(notice_id));
drop policy if exists notice_targets_write on notice_targets;
create policy notice_targets_write on notice_targets for all
  using (notice_manage(notice_id)) with check (notice_manage(notice_id));

-- ---------------------------------------------------------------- 4. 알림이 갈 사람
-- 걸린 반 가운데 하나라도 듣는 학생의 학부모·학생. 전체면 학원 전체.
create or replace function notice_audience(n notices, roles user_role[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  with t as (select notice_class_ids_of(n.id, n.target_class_id) as cids)
  select distinct m.user_id from memberships m, t
  where m.academy_id = n.academy_id and m.role = any(roles)
    and (t.cids is null
      or m.student_id in (select e.student_id from enrollments e where e.class_id = any(t.cids))) $$;

-- 공지가 들어간 바로 그 순간에는 notice_targets 줄이 아직 없다(FK 때문에 공지가 먼저다).
-- 그래서 알림 뿌리기를 트랜잭션 끝으로 미룬다 — 대상 줄까지 다 들어간 뒤에 센다.
-- 한 길만 남긴다: create_notice_v2 도, 옛 insert 도 이 트리거 하나를 지난다.
drop trigger if exists notices_notify on notices;
create constraint trigger notices_notify after insert on notices
  deferrable initially deferred for each row execute function trg_notice_insert();

-- ---------------------------------------------------------------- 5. 공지 + 대상 한 번에
-- 공지와 대상 반을 한 트랜잭션에 넣고 id 를 돌려준다. 반이 딱 하나면 target_class_id 에도 적어
-- 옛 화면·질의가 그대로 읽게 둔다. p_class_ids 가 비면 전체 공지(원장만).
create or replace function create_notice_v2(p_title text, p_body text, p_class_ids uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid; ids uuid[]; a uuid;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  a := current_academy_id();
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into ids from unnest(coalesce(p_class_ids, '{}'::uuid[])) x;
  if exists (select 1 from unnest(ids) x where x not in (select id from classes where academy_id = a)) then
    raise exception 'not allowed';
  end if;
  if current_role_() <> 'director' then
    if cardinality(ids) = 0 then raise exception 'not allowed'; end if;
    if exists (select 1 from unnest(ids) x where x not in (select staff_class_ids())) then raise exception 'not allowed'; end if;
  end if;
  insert into notices (academy_id, author_id, title, body, target_class_id)
  values (a, auth.uid(), btrim(coalesce(p_title, '')), coalesce(p_body, ''),
          case when cardinality(ids) = 1 then ids[1] else null end)
  returning id into nid;
  insert into notice_targets (notice_id, class_id) select nid, x from unnest(ids) x;
  return nid;
end $$;
grant execute on function create_notice_v2(text, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------- 6. 읽은 사람 · 다시 알리기
create or replace function notice_readers(nid uuid) returns table (user_id uuid, name text, read_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare n notices;
begin
  select * into n from notices where id = nid;
  if n.id is null or n.academy_id <> current_academy_id() or not notice_manage(n.id) then raise exception 'not allowed'; end if;
  return query
    select a, u.name, r.read_at from notice_audience(n, array['parent']::user_role[]) a
    join users u on u.id = a left join notice_reads r on r.notice_id = n.id and r.user_id = a
    order by r.read_at nulls first, u.name;
end $$;

create or replace function remind_notice(nid uuid) returns int language plpgsql security definer set search_path = public as $$
declare n notices; cnt int;
begin
  select * into n from notices where id = nid;
  if n.id is null or n.academy_id <> current_academy_id() or not notice_manage(n.id) then raise exception 'not allowed'; end if;
  insert into notifications (academy_id, user_id, kind, title, body, link)
  select n.academy_id, a, 'remind', '「' || n.title || '」 아직 안 읽으셨어요', '원장님이 다시 알렸어요', 'notice-view:' || n.id
  from notice_audience(n, array['parent']::user_role[]) a
  where not exists (select 1 from notice_reads r where r.notice_id = n.id and r.user_id = a);
  get diagnostics cnt = row_count;
  update notices set reminded_at = now() where id = nid;
  return cnt;
end $$;

notify pgrst, 'reload schema';
