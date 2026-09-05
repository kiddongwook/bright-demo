-- 수강료 자동화 (T5). 원장이 매달 "청구서 만들기"·"미납 안내 보내기" 를 누르지 않아도 되게 한다.
--   billing_rules.auto_issue / auto_remind / auto_remind_after_days  — 원장이 설정 화면에서 켠다
--   issue_invoices_for(a, ym) / remind_unpaid_for(a, ym)            — 0018 본체를 학원 인자로 뽑은 내부 함수 (service_role 만)
--   issue_invoices(ym) / remind_unpaid(ym)                          — 원장 검사 뒤 위임 (화면이 부르는 이름·시그니처는 그대로)
--   billing_tick()                                                   — 매일 00:00 UTC(09:00 KST). 청구일이면 발행, 납기+N일 지난 미납은 안내, 원장에게 알림 한 줄
--
-- billing_rules 쓰기 정책(billing_rules_staff, 0003)은 for all · with check current_role_()='director' 라
-- 새 칸 셋도 원장이 표를 직접 고친다(화면은 upsert). 학부모·강사는 표를 못 읽는다(0014 §7 참고).

-- ---------------------------------------------------------------- 1. 규칙 칸 셋
alter table billing_rules
  add column if not exists auto_issue boolean not null default false,
  add column if not exists auto_remind boolean not null default false,
  add column if not exists auto_remind_after_days int not null default 3;
alter table billing_rules drop constraint if exists billing_rules_auto_remind_after_days_check;
alter table billing_rules add constraint billing_rules_auto_remind_after_days_check check (auto_remind_after_days between 1 and 14);

-- ---------------------------------------------------------------- 2. 본체 — 학원 인자 (0018 INT-01 본문 그대로, a 만 인자)
-- 활성 학생(students.status='active')만 kids 에 들어간다 → 퇴원생 청구서는 애초에 안 만들어진다.
create or replace function issue_invoices_for(p_academy uuid, p_ym text) returns int
language plpgsql security definer set search_path = public as $$
declare a uuid := p_academy; r billing_rules; due date; cnt int := 0;
begin
  if a is null then raise exception 'no academy'; end if;
  if p_ym !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad month'; end if;
  select * into r from billing_rules where academy_id = a;
  due := to_date(p_ym || '-01', 'YYYY-MM-DD') + (coalesce(r.due_day, 5) - 1);

  with kids as (
    select s.id, s.created_at from students s where s.academy_id = a and s.status = 'active'),
  ph as (
    select rp.student_id, rp.phone from roster_phones rp
     where rp.academy_id = a and rp.role = 'parent' and rp.student_id in (select id from kids)),
  shared as (
    select phone from ph group by phone having count(distinct student_id) > 1),
  fam as (
    select k.id, k.created_at,
      coalesce((select min(p.phone) from ph p where p.student_id = k.id and p.phone in (select phone from shared)), k.id::text) as fkey
    from kids k),
  ranked as (
    select id, row_number() over (partition by fkey order by created_at, id) rn from fam),
  amt as (
    select rk.id, rk.rn,
      coalesce(
        (select fp.amount from fee_plans fp join enrollments e on e.class_id = fp.class_id
          where fp.academy_id = a and fp.active and e.student_id = rk.id order by fp.created_at limit 1),
        (select fp.amount from fee_plans fp where fp.academy_id = a and fp.active and fp.class_id is null order by fp.created_at limit 1),
        0) as amount
    from ranked rk)
  insert into invoices (academy_id, student_id, period_ym, amount, discount, textbook, total, due_date, status)
  select a, x.id, p_ym, x.amount, d.disc, 0, greatest(x.amount - d.disc, 0), due, 'issued'
  from amt x cross join lateral (
    select case when x.rn > 1 then round(x.amount * coalesce(r.sibling_discount_pct, 0) / 100.0)::int else 0 end as disc) d
  on conflict (student_id, period_ym) do nothing;
  get diagnostics cnt = row_count;
  return cnt;
end $$;

-- 0018 INT-12/INT-21 본문 그대로. 같은 청구서에는 20시간에 한 번(reminded_at), 퇴원생·남은 금액 0·받을 사람 없음은 UPDATE 에 안 걸린다.
create or replace function remind_unpaid_for(p_academy uuid, p_ym text) returns int
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
       and (i.reminded_at is null or i.reminded_at < now() - interval '20 hours')
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

-- 내부 함수: 크론(billing_tick, security definer)과 service_role 만. 로그인한 사람은 학원 인자를 고를 수 없어야 한다.
revoke all on function issue_invoices_for(uuid, text) from public, anon, authenticated;
revoke all on function remind_unpaid_for(uuid, text) from public, anon, authenticated;
grant execute on function issue_invoices_for(uuid, text) to service_role;
grant execute on function remind_unpaid_for(uuid, text) to service_role;

-- ---------------------------------------------------------------- 3. 화면이 부르는 두 함수 — 원장 검사 뒤 위임
-- create or replace 라 0014 의 grant(authenticated) 는 그대로 살아 있다.
create or replace function issue_invoices(p_ym text) returns int
language plpgsql security definer set search_path = public as $$
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if p_ym !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad month'; end if;
  return issue_invoices_for(current_academy_id(), p_ym);
end $$;

create or replace function remind_unpaid(p_ym text) returns int
language plpgsql security definer set search_path = public as $$
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if p_ym !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad month'; end if;
  return remind_unpaid_for(current_academy_id(), p_ym);
end $$;

-- ---------------------------------------------------------------- 4. 하루 한 번 — 발행·안내
-- 한국 날짜 기준. 청구일(billing_day)이 오늘이면 이번 달 청구서를 만든다(unique 가 중복을 막아 같은 날 두 번 돌아도 0).
-- 미납 안내: 이번 달·지난달 청구서 중 납기 + N일이 지났고 아직 남은 금액이 있으며 마지막 안내 뒤 6일이 지난 것이 있으면 그 달을 remind_unpaid_for 에 넘긴다 (첫 안내 → 이후 매주 한 번)
--   (billing_tick 은 마지막 안내 뒤 6일이 지난 청구서가 있을 때만 넘기므로 첫 안내 → 이후 매주 한 번. 원장이 수동으로 보낸 주는 건너뛴다).
-- 학원 하나에서 실패해도 다음 학원은 계속 돈다 — 학원별로 begin/exception 으로 감싸고 warning 만 남긴다.
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

    -- 미납 안내 (지난달 → 이번 달)
    if r.auto_remind then
      foreach mon in array array[prev_ym, ym] loop
        if exists (select 1 from invoices i
                    where i.academy_id = r.academy_id and i.period_ym = mon
                      and i.status in ('issued','partial','overdue')
                      and i.due_date + r.auto_remind_after_days <= today
                      and (i.reminded_at is null or i.reminded_at < now() - interval '6 days')   -- 하루 한 번이 아니라 일주일에 한 번
                      and i.total > coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
                      and exists (select 1 from students s where s.id = i.student_id and s.status <> 'left')) then
          touched := true;
          begin
            k := remind_unpaid_for(r.academy_id, mon);
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

-- 매일 00:00 UTC = 09:00 KST (0006/0009 와 같은 꼴 — 다시 돌려도 한 줄만 남는다)
select cron.unschedule('billing-tick') where exists (select 1 from cron.job where jobname = 'billing-tick');
select cron.schedule('billing-tick', '0 0 * * *', 'select billing_tick()');
