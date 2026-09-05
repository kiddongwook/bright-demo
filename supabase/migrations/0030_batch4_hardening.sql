-- 0030_batch4_hardening.sql — 4차 레드팀 마감 (2026-09-05, docs/reports/2026-09-05-redteam-batch4.md)
--
--   B4-N4  공지 헬퍼(0021/0027)의 기본 PUBLIC execute 회수 — 정책이 부르는 넷만 authenticated 에 남긴다
--   B4-N2  Storage notices 버킷 읽기 정책을 공지 단위로 — 예약(미발행)·비대상 반 공지 사진이 학부모·학생에게 내려오지 않는다
--   B4-L9  academies 운영 칸(id·slug·locked·created_at·weekly_last_at)을 로그인 사용자가 못 바꾼다 (before update 트리거)
--   B4-M1  academies 로고 경로 칸(logo_path·wordmark_path·wordmark_dark_path)은 `<자기 id>/(logo|wordmark|wordmark-dark).png` 만
--   B4-L4  잠긴 학원: set_active_membership 이 academy_locked 로 거절 · op_set_lock(true) 이 그 학원 활성 소속을 전부 해제 ·
--          current_membership() 이 잠긴 학원 소속이면 null (모든 RLS 가 닫힌다 — 0023 "세션은 끊지 않는다" 를 바꾼다)
--   B4-B5  remind_unpaid_for 에 납기 상한·안내 간격 인자 — billing_tick 은 문턱(납기+N일·6일 간격)을 넘은 청구서에만 보낸다
--   B4-W4  주간 요약 dedupe 키를 제목(이름) 대신 link('child:<student_id>') 로 — 같은 이름 자녀 둘도 각각 받는다
--   B4-D8  notices guard 트리거를 insert 까지 — PostgREST 직접 insert 도 fanned_at 비움·publish_at 과거→지금·90일 상한
--   B4-S3  create_notice_v2 / reschedule_notice: ±infinity → bad_time, 과거 시각 → now()
--   (B4-L7 은 supabase/functions/link-login/index.ts — _shared/auth.ts listMemberships 로 잠긴 학원 소속을 거른다)

-- ================================================================ B4-N4. 공지 헬퍼 execute 회수
-- 정책(using/with check)은 부른 사람의 역할로 돌므로 정책이 직접 부르는 넷(notice_visible_of·notice_manage_of·
-- notice_readable·notice_manage)만 authenticated 에 남긴다. 나머지는 security definer 함수 안(소유자)에서만 불린다.
-- 점검 스크립트(notice-targets-test 등)가 service_role 로 부르므로 service_role 에는 전부 준다.
do $$
declare f text;
begin
  foreach f in array array[
    'notice_class_ids_of(uuid, uuid)',
    'notice_class_ids(uuid)',
    'notice_visible_of(uuid, uuid)',
    'notice_visible_to(uuid, uuid)',
    'notice_manage_of(uuid, uuid)',
    'notice_manage(uuid)',
    'notice_readable(uuid)',
    'notice_audience(notices, user_role[])',
    'notice_fanout(uuid)',
    'publish_due_notices()']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
grant execute on function notice_visible_of(uuid, uuid) to authenticated;   -- notices_read · storage notices_read
grant execute on function notice_manage_of(uuid, uuid)  to authenticated;   -- notices_write
grant execute on function notice_readable(uuid)         to authenticated;   -- notice_targets_read
grant execute on function notice_manage(uuid)           to authenticated;   -- notice_targets_write

-- ================================================================ B4-N2. 공지 사진은 공지 행이 보일 때만
-- 경로는 notices/<academy_id>/<notice_id>/<n>.jpg (app/src/lib/files.ts). 둘째 폴더를 공지 id 로 보고
-- 그 공지가 notices_read 와 같은 규칙(notice_visible_of — 0027 이 예약 조건을 넣은 곳)으로 보일 때만 읽는다.
-- 둘째 폴더가 uuid 모양이 아닐 수 있어 캐스트하지 않고 text 로 비교한다. 스태프는 notices_write(for all) 가 그대로 읽게 한다.
drop policy if exists notices_read on storage.objects;
create policy notices_read on storage.objects for select
  using (bucket_id = 'notices'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and exists (select 1 from public.notices n
                 where n.id::text = (storage.foldername(name))[2]
                   and n.academy_id = public.current_academy_id()
                   and public.notice_visible_of(n.id, n.target_class_id)));

-- ================================================================ B4-L9 · B4-M1. academies 칸 보호
-- academies_write(0002) 는 행만 보고 열을 안 본다. 0027 notices_guard_schedule 과 같은 꼴로 트리거에서 막는다.
--   · UPDATE 를 로그인 사용자(current_user='authenticated')가 하면 id·slug·locked·created_at·weekly_last_at 은 못 바꾼다.
--     op_set_lock·weekly_summary_tick·op_create_academy 는 security definer(소유자 실행), Edge·도구는 service_role 이라 지나간다.
--     앱이 이 표를 고치는 자리는 lib/api.ts(brand_color·logo_path·wordmark_path·wordmark_dark_path) 와
--     lib/weekly.ts(weekly_summary·weekly_dow·weekly_hour) 뿐이다.
--   · 로고 경로 셋은 null 이거나 `<자기 id>/(logo|wordmark|wordmark-dark).png`. 누가 쓰든 검사한다(도구도 같은 자리를 쓴다:
--     set-academy-logo.mjs `<id>/logo.png`, set-wordmark.mjs `<id>/wordmark.png`·`wordmark-dark.png`, lib/logo.ts 같음).
--     UPDATE 에서는 바뀐 칸만 본다 — 옛 값이 다른 모양이어도 brand_color 같은 다른 칸 갱신이 막히지 않게.
create or replace function trg_academies_guard() returns trigger language plpgsql as $$
declare pat text := '^' || new.id::text || '/(logo|wordmark|wordmark-dark)\.png$';
begin
  if tg_op = 'UPDATE' then
    if current_user = 'authenticated'
       and (new.id is distinct from old.id
         or new.slug is distinct from old.slug
         or new.locked is distinct from old.locked
         or new.created_at is distinct from old.created_at
         or new.weekly_last_at is distinct from old.weekly_last_at) then
      raise exception 'not allowed';
    end if;
    if new.logo_path is distinct from old.logo_path and new.logo_path is not null and new.logo_path !~ pat then raise exception 'bad_path'; end if;
    if new.wordmark_path is distinct from old.wordmark_path and new.wordmark_path is not null and new.wordmark_path !~ pat then raise exception 'bad_path'; end if;
    if new.wordmark_dark_path is distinct from old.wordmark_dark_path and new.wordmark_dark_path is not null and new.wordmark_dark_path !~ pat then raise exception 'bad_path'; end if;
  else
    if new.logo_path is not null and new.logo_path !~ pat then raise exception 'bad_path'; end if;
    if new.wordmark_path is not null and new.wordmark_path !~ pat then raise exception 'bad_path'; end if;
    if new.wordmark_dark_path is not null and new.wordmark_dark_path !~ pat then raise exception 'bad_path'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_academies_guard on academies;
create trigger trg_academies_guard before insert or update on academies for each row execute function trg_academies_guard();

-- ================================================================ B4-L4. 잠금은 로그인 게이트가 아니라 이용 정지
-- (a) 잠긴 학원 소속으로는 갈아탈 수 없다 (소유 검사는 0002 그대로, 그 뒤 잠금 검사).
create or replace function set_active_membership(m uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from memberships where id = m and user_id = auth.uid()) then raise exception 'not your membership'; end if;
  if exists (select 1 from memberships ms join academies a on a.id = ms.academy_id where ms.id = m and a.locked) then
    raise exception 'academy_locked';
  end if;
  update users set active_membership_id = m where id = auth.uid();
end $$;

-- (b) 잠그면 그 학원을 가리키는 활성 소속을 전부 푼다 — 남은 세션은 역할 선택으로 떨어진다(다른 학원 소속은 그대로 고를 수 있다).
create or replace function op_set_lock(p_academy uuid, p_locked boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform op_guard();
  if not exists (select 1 from academies where id = p_academy) then raise exception 'not_found'; end if;
  update academies set locked = coalesce(p_locked, false) where id = p_academy;
  if coalesce(p_locked, false) then
    update users set active_membership_id = null
     where active_membership_id in (select id from memberships where academy_id = p_academy);
  end if;
  return coalesce(p_locked, false);
end $$;

-- (c) 잠긴 학원 소속이 활성이면 소속이 없는 것과 같다. current_academy_id()·current_role_()·is_staff()·my_class_ids() 가
--     전부 이 함수 위에 있어 모든 정책이 한 번에 닫힌다(0002 본문 + academies PK 조인 하나).
--     0023 문서의 "이미 로그인한 세션은 끊지 않는다" 는 이제 "잠기는 순간부터 아무것도 못 읽는다" 로 바뀐다.
create or replace function current_membership() returns memberships
language sql stable security definer set search_path = public as $$
  select m.* from memberships m
  join users u on u.active_membership_id = m.id
  join academies a on a.id = m.academy_id
  where u.id = auth.uid() and not a.locked $$;

-- ================================================================ B4-B5. 미납 안내는 문턱을 넘은 청구서에만
-- 0028 본문 그대로에 인자 둘: p_due_before(납기가 이 날 이하인 것만 — null 이면 전부), p_min_gap(마지막 안내 뒤 이만큼 지난 것만).
-- 원장 수동 버튼(remind_unpaid)은 기본값(납기 무관·20시간)으로 지금과 같고, 크론(billing_tick)은 납기+N일·6일 간격을 넘긴다.
-- 인자가 늘어 2인자 판을 지운다 — 둘이 함께 있으면 PostgREST 호출이 모호해진다(0027 create_notice_v2 와 같은 이유).
drop function if exists remind_unpaid_for(uuid, text);
create or replace function remind_unpaid_for(p_academy uuid, p_ym text, p_due_before date default null, p_min_gap interval default interval '20 hours') returns int
language plpgsql security definer set search_path = public as $$
declare a uuid := p_academy; r billing_rules; anm text; ids uuid[]; inv invoices;
        paid int; rest int; n int; cnt int := 0;
begin
  if a is null then raise exception 'no academy'; end if;
  if p_ym !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad month'; end if;

  update invoices i set status = 'overdue'
   where i.academy_id = a and i.period_ym = p_ym and i.status in ('issued','partial') and i.total > 0
     and i.due_date < (now() at time zone 'Asia/Seoul')::date
     and i.total > coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
     and exists (select 1 from students s where s.id = i.student_id and s.status <> 'left');

  select * into r from billing_rules where academy_id = a;
  select name into anm from academies where id = a;

  with upd as (
    update invoices i set reminded_at = now()
     where i.academy_id = a and i.period_ym = p_ym and i.status in ('issued','partial','overdue')
       and (p_due_before is null or i.due_date <= p_due_before)
       and (i.reminded_at is null or i.reminded_at < now() - coalesce(p_min_gap, interval '20 hours'))
       and i.total > coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
       and exists (select 1 from students s where s.id = i.student_id and s.status <> 'left')
       and (exists (select 1 from memberships m where m.academy_id = a and m.role = 'parent' and m.student_id = i.student_id)
            or exists (select 1 from guardians g where g.student_id = i.student_id))
    returning i.id)
  select array_agg(id) into ids from upd;
  if ids is null then return 0; end if;

  for inv in select * from invoices where id = any(ids) order by due_date loop
    select coalesce(sum(p.amount), 0) into paid from payments p where p.invoice_id = inv.id;
    rest := inv.total - paid;
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select a, t.u, 'billing',
      '[' || coalesce(anm, '학원') || '] ' || ltrim(split_part(inv.period_ym, '-', 2), '0') || '월 수강료 안내 · 남은 금액 '
        || to_char(rest, 'FM999,999,999') || '원 · 납기 ' || to_char(inv.due_date, 'FMMM/FMDD'),
      coalesce(r.bank_info, ''), 'child:'
    from (
      select m.user_id as u from memberships m where m.academy_id = a and m.role = 'parent' and m.student_id = inv.student_id
      union
      select g.user_id from guardians g where g.student_id = inv.student_id
    ) t;
    get diagnostics n = row_count;
    if n = 0 then
      update invoices set reminded_at = null where id = inv.id;   -- 받을 사람이 사라졌으면 보낸 것으로 치지 않는다
      continue;
    end if;
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;
revoke all on function remind_unpaid_for(uuid, text, date, interval) from public, anon, authenticated;
grant execute on function remind_unpaid_for(uuid, text, date, interval) to service_role;

-- 원장 수동 버튼: 기본값으로 위임 (0028 본문 그대로 — 0014 의 authenticated grant 는 create or replace 로 살아 있다)
create or replace function remind_unpaid(p_ym text) returns int
language plpgsql security definer set search_path = public as $$
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if p_ym !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad month'; end if;
  return remind_unpaid_for(current_academy_id(), p_ym);
end $$;

-- 크론: 0028 본문 그대로, 미납 안내 호출만 remind_unpaid_for(학원, 달, 오늘 - N일, 6일) — 앞의 exists 검사와 같은 조건.
-- 이 함수의 out 칸(academy_id·issued·reminded)은 plpgsql 변수라, 안의 SQL 은 표 칸을 전부 별칭으로 적는다(모호함 방지).
create or replace function billing_tick() returns table (academy_id uuid, issued int, reminded int)
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Seoul')::date;
        ym text := to_char(today, 'YYYY-MM');
        prev_ym text := to_char((today - interval '1 month')::date, 'YYYY-MM');
        last_day int := extract(day from (date_trunc('month', today::timestamp) + interval '1 month - 1 day'))::int;
        r billing_rules; anm text; due date; mon text; k int; touched boolean;
begin
  for r in select br.* from billing_rules br where br.auto_issue or br.auto_remind order by br.academy_id loop
    issued := 0; reminded := 0; touched := false;
    select ac.name into anm from academies ac where ac.id = r.academy_id;

    -- 발행 (billing_day 가 그 달 마지막 날보다 크면 마지막 날에 — 지금은 1..28 이라 안 걸리지만 값을 넓혀도 안전하게)
    if r.auto_issue and least(r.billing_day, last_day) = extract(day from today)::int then
      touched := true;
      begin
        issued := issue_invoices_for(r.academy_id, ym);
      exception when others then
        issued := 0;
        raise warning 'billing_tick issue % (%): %', r.academy_id, ym, sqlerrm;
      end;
      if issued > 0 then
        begin
          due := to_date(ym || '-01', 'YYYY-MM-DD') + (coalesce(r.due_day, 5) - 1);
          insert into notifications (academy_id, user_id, kind, title, body, link)
          select r.academy_id, mb.user_id, 'billing',
                 '[' || coalesce(anm, '학원') || '] ' || ltrim(split_part(ym, '-', 2), '0') || '월 청구서 ' || issued || '건 자동 발행',
                 '학부모 수강료 카드에 바로 보여요 · 납기 ' || to_char(due, 'FMMM/FMDD'),
                 'billing:'
            from memberships mb where mb.academy_id = r.academy_id and mb.role = 'director';
        exception when others then
          raise warning 'billing_tick issue-notify % (%): %', r.academy_id, ym, sqlerrm;
        end;
      end if;
    end if;

    -- 미납 안내 (지난달 → 이번 달). 납기 + N일이 지났고, 마지막 안내 뒤 6일이 지난 청구서에만 (첫 안내 → 이후 매주 한 번).
    if r.auto_remind then
      foreach mon in array array[prev_ym, ym] loop
        if exists (select 1 from invoices i
                    where i.academy_id = r.academy_id and i.period_ym = mon
                      and i.status in ('issued','partial','overdue')
                      and i.due_date <= today - r.auto_remind_after_days
                      and (i.reminded_at is null or i.reminded_at < now() - interval '6 days')
                      and i.total > coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
                      and exists (select 1 from students s where s.id = i.student_id and s.status <> 'left')) then
          touched := true;
          begin
            k := remind_unpaid_for(r.academy_id, mon, today - r.auto_remind_after_days, interval '6 days');
            reminded := reminded + coalesce(k, 0);
          exception when others then
            raise warning 'billing_tick remind % (%): %', r.academy_id, mon, sqlerrm;
          end;
        end if;
      end loop;
      if reminded > 0 then
        begin
          insert into notifications (academy_id, user_id, kind, title, body, link)
          select r.academy_id, mb.user_id, 'billing',
                 '[' || coalesce(anm, '학원') || '] 미납 ' || reminded || '명에게 안내를 보냈어요',
                 '납기 ' || r.auto_remind_after_days || '일 뒤 자동 안내 · 남은 금액과 계좌 안내가 함께 갔어요',
                 'billing:'
            from memberships mb where mb.academy_id = r.academy_id and mb.role = 'director';
        exception when others then
          raise warning 'billing_tick remind-notify %: %', r.academy_id, sqlerrm;
        end;
      end if;
    end if;

    if touched then academy_id := r.academy_id; return next; end if;
  end loop;
end $$;
revoke all on function billing_tick() from public, anon, authenticated;
grant execute on function billing_tick() to service_role;

-- ================================================================ B4-W4. 주간 요약 dedupe 를 학생 id 로
-- 0029 본문 그대로. 학부모 알림의 link 를 'child:<student_id>' 로 두고 "같은 주에 이미 보냈나" 를 link 로 본다.
-- 앱의 linkToNav 는 'child' 접두어만 보고 뒤의 id 는 버린다(출결 알림 'child:<attendance_id>' 와 같은 꼴) — 화면은 그대로 우리 아이.
-- trg_notification_outbox 의 link_ref 가 학생 id 가 되지만 WEEKLY 가지는 r 을 안 쓴다. 원장 요약은 그대로.
create or replace function weekly_summary_for(p_academy uuid, p_week_start date)
returns int language plpgsql security definer set search_path = public as $$
declare
  week_end date := p_week_start + 6;
  week_from timestamptz := (p_week_start::timestamp) at time zone 'Asia/Seoul';
  now_k timestamp := now() at time zone 'Asia/Seoul';
  today_k date := now_k::date;
  m record; nx record;
  c_present int; c_late int; c_absent int; hw_total int; hw_done int;
  next_txt text; v_title text; v_body text; v_link text; cnt int := 0;
  dow_ko text[] := array['일','월','화','수','목','금','토'];
  a_present int; a_late int; a_absent int; unpaid int; rate_txt text;
begin
  if p_academy is null or p_week_start is null then return 0; end if;

  -- ---- 학부모 (학생이 붙은 membership · 학생 재원 · prefs.weekly 가 false 가 아닌 사람)
  for m in
    select ms.user_id, ms.student_id, s.name as sname
      from memberships ms
      join students s on s.id = ms.student_id
      join users u on u.id = ms.user_id
     where ms.academy_id = p_academy and ms.role = 'parent' and ms.student_id is not null
       and s.status = 'active'
       and coalesce((u.prefs->>'weekly')::boolean, true)
  loop
    v_title := '이번 주 ' || m.sname || ' 요약';
    v_link := 'child:' || m.student_id;
    if exists (select 1 from notifications n
                where n.user_id = m.user_id and n.academy_id = p_academy and n.kind = 'weekly'
                  and n.link = v_link and n.created_at >= week_from) then
      continue;
    end if;

    select count(*) filter (where a.status = 'present'),
           count(*) filter (where a.status = 'late'),
           count(*) filter (where a.status = 'absent')
      into c_present, c_late, c_absent
      from attendance a
     where a.academy_id = p_academy and a.student_id = m.student_id
       and a.date between p_week_start and week_end;

    select count(*), count(d.todo_id)
      into hw_total, hw_done
      from todos t
      join enrollments e on e.class_id = t.class_id and e.student_id = m.student_id
      left join todo_done d on d.todo_id = t.id and d.student_id = m.student_id
     where t.academy_id = p_academy and t.kind = 'homework'
       and t.due_date between p_week_start and week_end;

    -- 다음 수업: 오늘부터 14일, 등록된 반의 시간표에서 가장 이른 (날, 시작). 휴원일(전체 또는 그 반)은 후보에서 뺀다.
    select x.d, x.class_id, x.start_hm
      into nx
      from (
        select (today_k + g.i)::date as d, cl.id as class_id, sl->>'start' as start_hm
          from generate_series(0, 13) as g(i)
          join enrollments e on e.student_id = m.student_id
          join classes cl on cl.id = e.class_id and cl.academy_id = p_academy
          cross join lateral jsonb_array_elements(coalesce(cl.schedule, '[]'::jsonb)) sl
         -- 0018 이전에 저장된 시간표에 이상한 값이 있어도 터지지 않게: 모양이 맞을 때만 캐스팅한다(and 의 평가 순서는 보장되지 않는다)
         where (case when (sl->>'dow') ~ '^[0-6]$' then (sl->>'dow')::int end) = extract(dow from (today_k + g.i)::date)::int
           and (sl->>'start') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           and (g.i > 0 or (case when (sl->>'start') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (sl->>'start')::time end) > now_k::time)
           and not exists (select 1 from calendar c
                            where c.academy_id = p_academy and c.kind = 'closed' and c.date = (today_k + g.i)::date
                              and (c.class_id is null or c.class_id = cl.id))
      ) x
     order by x.d, x.start_hm
     limit 1;

    if nx.d is null then next_txt := '다음 수업 없음';
    else next_txt := '다음 수업 ' || dow_ko[extract(dow from nx.d)::int + 1] || ' ' || nx.start_hm;
    end if;

    v_body := '출석 ' || c_present || ' · 지각 ' || c_late || ' · 결석 ' || c_absent
         || ' · 숙제 ' || hw_done || '/' || hw_total
         || coalesce(' · ' || next_txt, '');

    insert into notifications (academy_id, user_id, kind, title, body, link)
    values (p_academy, m.user_id, 'weekly', v_title, left(v_body, 120), v_link);
    cnt := cnt + 1;
  end loop;

  -- ---- 원장 (학원 전체 출석률 · 미납 건수) — 0029 그대로
  select count(*) filter (where a.status = 'present'),
         count(*) filter (where a.status = 'late'),
         count(*) filter (where a.status = 'absent')
    into a_present, a_late, a_absent
    from attendance a
   where a.academy_id = p_academy and a.date between p_week_start and week_end;
  select count(*) into unpaid from invoices i
   where i.academy_id = p_academy and i.status in ('issued', 'partial', 'overdue');
  if (a_present + a_late + a_absent) > 0 then
    rate_txt := ' · 출석률 ' || round(100.0 * (a_present + a_late) / (a_present + a_late + a_absent)) || '%';
  else
    rate_txt := ' · 이번 주 출결 기록 없음';
  end if;
  v_body := left('이번 주 요약' || rate_txt || ' · 미납 ' || unpaid || '건', 120);

  for m in
    select ms.user_id from memberships ms
     where ms.academy_id = p_academy and ms.role = 'director'
       and not exists (select 1 from notifications n
                        where n.user_id = ms.user_id and n.academy_id = p_academy and n.kind = 'weekly'
                          and n.title = '이번 주 학원 요약' and n.created_at >= week_from)
  loop
    insert into notifications (academy_id, user_id, kind, title, body, link)
    values (p_academy, m.user_id, 'weekly', '이번 주 학원 요약', v_body, 'today:');
    cnt := cnt + 1;
  end loop;

  return cnt;
end $$;
revoke execute on function weekly_summary_for(uuid, date) from public, anon, authenticated;
grant execute on function weekly_summary_for(uuid, date) to service_role;

-- ================================================================ B4-D8. 예약 칸 보호를 insert 까지
-- notices_write 는 insert 도 열어 두므로 스태프가 PostgREST 로 직접 넣는 길은 남는다(RLS 는 그대로). 그 길도 create_notice_v2 와
-- 같은 모양이 되게 한다: fanned_at 은 늘 비우고(뿌리기는 notices_notify 트리거·크론만), publish_at 이 없거나 과거면 지금, 90일 밖이면 bad_time.
-- UPDATE 분지는 0027 그대로. create_notice_v2·reschedule_notice·notice_fanout 은 소유자로 돌아 이 검사를 지나지 않는다.
create or replace function trg_notices_guard_schedule() returns trigger language plpgsql as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    new.fanned_at := null;
    if new.publish_at is null or new.publish_at < now() then new.publish_at := now(); end if;
    if new.publish_at > now() + interval '90 days' then raise exception 'bad_time'; end if;
  elsif new.publish_at is distinct from old.publish_at or new.fanned_at is distinct from old.fanned_at then
    raise exception 'not allowed';
  end if;
  return new;
end $$;
drop trigger if exists notices_guard_schedule on notices;
create trigger notices_guard_schedule before insert or update on notices for each row execute function trg_notices_guard_schedule();

-- ================================================================ B4-S3. ±infinity 거절 · 과거 = 지금
-- 0027 본문 그대로에 두 줄: 비유한 시각은 bad_time, 과거 시각은 now() 로 저장(reschedule_notice 와 같은 규칙).
-- 시그니처가 같아 create or replace — 0027 의 grant(authenticated) 는 살아 있다.
create or replace function create_notice_v2(p_title text, p_body text, p_class_ids uuid[], p_publish_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid; ids uuid[]; a uuid;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  if p_publish_at is not null and (p_publish_at = 'infinity'::timestamptz or p_publish_at = '-infinity'::timestamptz) then raise exception 'bad_time'; end if;
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
          case when p_publish_at is null or p_publish_at <= now() then now() else p_publish_at end)
  returning id into nid;
  insert into notice_targets (notice_id, class_id) select nid, x from unnest(ids) x;
  return nid;
end $$;

create or replace function reschedule_notice(p_notice uuid, p_publish_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare n notices;
begin
  select * into n from notices where id = p_notice;
  if n.id is null or n.academy_id <> current_academy_id() or not notice_manage_of(n.id, n.target_class_id) then
    raise exception 'not allowed';
  end if;
  if n.fanned_at is not null then raise exception 'already_published'; end if;
  if p_publish_at is not null and (p_publish_at = 'infinity'::timestamptz or p_publish_at = '-infinity'::timestamptz) then raise exception 'bad_time'; end if;
  if p_publish_at is null or p_publish_at <= now() then
    update notices set publish_at = now() where id = p_notice and fanned_at is null;
    perform notice_fanout(p_notice);
  else
    if p_publish_at > now() + interval '90 days' then raise exception 'bad_time'; end if;
    update notices set publish_at = p_publish_at where id = p_notice and fanned_at is null;
  end if;
end $$;

notify pgrst, 'reload schema';
