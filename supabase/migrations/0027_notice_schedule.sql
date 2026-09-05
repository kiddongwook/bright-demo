-- 0027_notice_schedule.sql — 공지 예약 발송 (4차 묶음 T4)
--
-- 공지에 '나갈 시각'(publish_at)과 '나간 시각'(fanned_at)을 둔다.
--   publish_at <= now()  이면 넣는 그 자리에서(제약 트리거) 뿌리고,
--   미래면 매분 크론(publish_due_notices)이 때가 된 것을 뿌린다.
-- 뿌리기 본체는 notice_fanout(nid) 하나 — 안에서 fanned_at 을 먼저 찍어 두 번 못 나가게 한다.
--
-- 보이기: 스태프가 아니면 아직 안 나간 공지(publish_at > now())는 없는 것과 같다.
--   notices_read · notice_targets_read(notice_readable) 는 모두 notice_visible_of 를 지나므로 그 한 곳만 고친다.
--   notice_reads_ins 는 `notice_id in (select id from notices …)` 가 부른 사람의 RLS 를 타서 저절로 막힌다.
--   todos.notice_id 로 걸린 숙제·시험은 따로 산다(공지가 안 보여도 숙제는 보인다).
--
-- 휴원일 연동 결정: 휴원 공지를 예약해도 휴원일은 작성 시점에 바로 달력에 들어간다
--   (휴원은 사실이고 학부모가 미리 알수록 좋다) — 화면(Notices.tsx)이 그대로 한다.

-- ---------------------------------------------------------------- 1. 칸
alter table notices add column if not exists publish_at timestamptz not null default now();
alter table notices add column if not exists fanned_at timestamptz;
-- 지금까지 있던 공지는 전부 이미 나갔다 — 나간 시각을 만든 시각으로 채운다(목록 차례도 그대로).
update notices set publish_at = created_at, fanned_at = created_at where fanned_at is null;
-- 크론이 매분 보는 줄만 좁게 인덱스
create index if not exists notices_due on notices (publish_at) where fanned_at is null;

-- ---------------------------------------------------------------- 2. 뿌리기 본체
-- 0005 trg_notice_insert 의 몸통을 그대로 옮겼다(대상은 0021 notice_audience 가 notice_targets 까지 본다).
-- fanned_at 을 먼저 찍고, 이미 찍혀 있으면 아무것도 하지 않는다 — 크론 두 틱이 겹쳐도, 지금 보내기와 크론이
-- 겹쳐도 알림은 한 번만 난다. 클라이언트가 직접 부르지 못하게 authenticated 에서 뺀다.
create or replace function notice_fanout(nid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n notices;
begin
  update notices set fanned_at = now() where id = nid and fanned_at is null returning * into n;
  if n.id is null then return; end if;
  insert into notifications (academy_id, user_id, kind, title, body, link)
  select n.academy_id, a, 'notice', '새 공지 「' || n.title || '」', '', 'notice-view:' || n.id
  from notice_audience(n, array['parent','student']::user_role[]) a;
end $$;
revoke execute on function notice_fanout(uuid) from public, anon, authenticated;

-- 넣는 자리의 제약 트리거(0021 — deferrable initially deferred, 대상 줄까지 다 들어간 뒤 돈다)는 그대로 두고
-- 몸통만 바꾼다: 지금 나갈 것만 바로 뿌리고, 예약은 크론에 맡긴다.
create or replace function trg_notice_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.publish_at <= now() then perform notice_fanout(new.id); end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 3. 매분 크론
-- 때가 됐는데 아직 안 나간 것을 차례로 뿌린다. skip locked — 틱이 겹쳐도 같은 줄을 두 번 세지 않는다.
create or replace function publish_due_notices() returns int
language plpgsql security definer set search_path = public as $$
declare r record; cnt int := 0;
begin
  for r in select id from notices where publish_at <= now() and fanned_at is null order by publish_at for update skip locked loop
    perform notice_fanout(r.id);
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;
revoke execute on function publish_due_notices() from public, anon, authenticated;
grant execute on function publish_due_notices() to service_role;
select cron.unschedule('notices-publish') where exists (select 1 from cron.job where jobname = 'notices-publish');
select cron.schedule('notices-publish', '* * * * *', 'select publish_due_notices()');

-- ---------------------------------------------------------------- 4. 공지 + 대상 한 번에 (+ 예약 시각)
-- 인자가 늘어 같은 이름의 3인자 판을 지우고 다시 만든다(PostgREST 는 이름+인자로 고른다 — 셋만 주는
-- 옛 호출은 기본값으로 그대로 통한다). 검사는 0021 그대로, 예약은 90일 안까지.
drop function if exists create_notice_v2(text, text, uuid[]);
create or replace function create_notice_v2(p_title text, p_body text, p_class_ids uuid[], p_publish_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid; ids uuid[]; a uuid;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  if p_publish_at is not null and p_publish_at > now() + interval '90 days' then raise exception 'bad_time'; end if;
  a := current_academy_id();
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into ids from unnest(coalesce(p_class_ids, '{}'::uuid[])) x;
  if exists (select 1 from unnest(ids) x where x not in (select id from classes where academy_id = a)) then
    raise exception 'not allowed';
  end if;
  if current_role_() <> 'director' then
    if cardinality(ids) = 0 then raise exception 'not allowed'; end if;
    if exists (select 1 from unnest(ids) x where x not in (select staff_class_ids())) then raise exception 'not allowed'; end if;
  end if;
  insert into notices (academy_id, author_id, title, body, target_class_id, publish_at)
  values (a, auth.uid(), btrim(coalesce(p_title, '')), coalesce(p_body, ''),
          case when cardinality(ids) = 1 then ids[1] else null end,
          coalesce(p_publish_at, now()))
  returning id into nid;
  insert into notice_targets (notice_id, class_id) select nid, x from unnest(ids) x;
  return nid;
end $$;
revoke all on function create_notice_v2(text, text, uuid[], timestamptz) from public, anon;
grant execute on function create_notice_v2(text, text, uuid[], timestamptz) to authenticated;

-- ---------------------------------------------------------------- 5. 시각 바꾸기 · 지금 보내기
-- 아직 안 나간 공지만. 만질 수 있는 사람은 0021 notice_manage_of 규칙(원장, 또는 걸린 반이 모두 담당 반인 강사).
-- p_publish_at 이 null 이거나 이미 지난 시각이면 지금 바로 뿌린다(크론을 기다리지 않는다).
create or replace function reschedule_notice(p_notice uuid, p_publish_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare n notices;
begin
  select * into n from notices where id = p_notice;
  if n.id is null or n.academy_id <> current_academy_id() or not notice_manage_of(n.id, n.target_class_id) then
    raise exception 'not allowed';
  end if;
  if n.fanned_at is not null then raise exception 'already_published'; end if;
  if p_publish_at is null or p_publish_at <= now() then
    update notices set publish_at = now() where id = p_notice and fanned_at is null;
    perform notice_fanout(p_notice);
  else
    if p_publish_at > now() + interval '90 days' then raise exception 'bad_time'; end if;
    update notices set publish_at = p_publish_at where id = p_notice and fanned_at is null;
  end if;
end $$;
revoke all on function reschedule_notice(uuid, timestamptz) from public, anon;
grant execute on function reschedule_notice(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------- 6. 보이기
-- 스태프가 아니면 아직 안 나간 공지는 보이지 않는다. 이 함수는 select 정책(using)과 notice_readable 에서만
-- 쓰여 행이 이미 있는 자리라 notices 를 다시 읽어도 된다. is_staff() 는 소속이 없으면 null 이라 coalesce.
create or replace function notice_visible_of(nid uuid, tcid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (coalesce(is_staff(), false) or (select publish_at from notices where id = nid) <= now())
     and case when notice_class_ids_of(nid, tcid) is null then true
         else notice_class_ids_of(nid, tcid) && coalesce((select array_agg(x) from my_class_ids() x), '{}'::uuid[]) end $$;

-- 어떤 사람(uid)이 볼 수 있나 — 점검·발송용. 학부모·학생은 나간 뒤에만.
create or replace function notice_visible_to(nid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with n as (select id, academy_id, target_class_id, publish_at from notices where id = nid),
       t as (select notice_class_ids_of(n.id, n.target_class_id) as cids from n)
  select exists (
    select 1 from memberships m, n, t
    where m.user_id = uid and m.academy_id = n.academy_id
      and (m.role in ('director','teacher') or n.publish_at <= now())
      and (t.cids is null
        or m.role = 'director'
        or (m.role = 'teacher' and exists (select 1 from classes c where c.id = any(t.cids) and c.teacher_id = uid))
        or (m.student_id is not null and exists (select 1 from enrollments e where e.student_id = m.student_id and e.class_id = any(t.cids))))) $$;

-- ---------------------------------------------------------------- 7. 읽은 사람 · 다시 알리기는 나간 뒤에만
-- 0021 §6 몸통 그대로(강사 범위는 notice_manage), 아직 안 나간 공지면 'not_published'.
create or replace function notice_readers(nid uuid) returns table (user_id uuid, name text, read_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare n notices;
begin
  select * into n from notices where id = nid;
  if n.id is null or n.academy_id <> current_academy_id() or not notice_manage(n.id) then raise exception 'not allowed'; end if;
  if n.fanned_at is null then raise exception 'not_published'; end if;
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
  if n.fanned_at is null then raise exception 'not_published'; end if;
  insert into notifications (academy_id, user_id, kind, title, body, link)
  select n.academy_id, a, 'remind', '「' || n.title || '」 아직 안 읽으셨어요', '원장님이 다시 알렸어요', 'notice-view:' || n.id
  from notice_audience(n, array['parent']::user_role[]) a
  where not exists (select 1 from notice_reads r where r.notice_id = n.id and r.user_id = a);
  get diagnostics cnt = row_count;
  update notices set reminded_at = now() where id = nid;
  return cnt;
end $$;


-- ---------------------------------------------------------------- 예약 칸 보호
-- notices_write 는 모든 칸을 열어 두므로, 스태프가 PostgREST 로 fanned_at 을 비우면 크론이 같은 공지를 다시 뿌린다.
-- publish_at·fanned_at 은 create_notice_v2 / reschedule_notice / notice_fanout(모두 security definer = 소유자 실행) 로만 바뀐다.
create or replace function trg_notices_guard_schedule() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated'
     and (new.publish_at is distinct from old.publish_at or new.fanned_at is distinct from old.fanned_at) then
    raise exception 'not allowed';
  end if;
  return new;
end $$;
drop trigger if exists notices_guard_schedule on notices;
create trigger notices_guard_schedule before update on notices for each row execute function trg_notices_guard_schedule();

notify pgrst, 'reload schema';
