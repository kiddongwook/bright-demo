-- 수강료 — 수기 모드 (결제 연동 없음). 자금 비보관: 돈은 학원 계좌로 바로 간다. 앱은 "누가 냈나"만 적는다.
-- 표는 0003_billing.sql 에 이미 있다. 여기서는 계좌 안내 한 칸과, 원장이 누르는 동작 여섯 개(RPC)를 얹는다.
--   청구서 만들기 · 납부 적기 · 면제 · 금액 고치기 · 미납 안내 · 연체 표시
-- 규칙(요금제·청구일·납기일·형제 할인·계좌)은 billing_rules·fee_plans 에 있고, 화면이 그대로 보여 준다.

-- ---------------------------------------------------------------- 0. 계좌 안내 문구 (학부모에게 보인다)
alter table billing_rules add column if not exists bank_info text;

-- payments.recorded_by 는 on delete 가 없어, 납부를 적은 사람을 지울 수 없다 (탈퇴·테스트 정리가 막힌다).
-- 기록은 남기고 사람만 지운다 → set null.
do $$ declare c text; begin
  select conname into c from pg_constraint
   where conrelid = 'payments'::regclass and contype = 'f' and pg_get_constraintdef(oid) like '%recorded_by%';
  if c is not null then execute format('alter table payments drop constraint %I', c); end if;
  alter table payments add constraint payments_recorded_by_fkey foreign key (recorded_by) references users(id) on delete set null;
end $$;

-- ---------------------------------------------------------------- 1. 청구서 만들기
-- 활성 학생마다 한 장. 금액은 그 학생 반의 요금제 → 학원 공통 요금제 → 0.
-- 형제 할인: 학부모 번호를 함께 쓰는 학생끼리 묶고, 먼저 등록한 아이 다음(2번째부터)에 %를 뺀다.
-- 이미 있는 학생×달은 건너뛴다(unique) → "다시 만들기" 는 새 학생만 만든다.
create or replace function issue_invoices(p_ym text) returns int
language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id(); r billing_rules; due date; cnt int := 0;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if p_ym !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'bad month'; end if;
  select * into r from billing_rules where academy_id = a;
  due := to_date(p_ym || '-01', 'YYYY-MM-DD') + (coalesce(r.due_day, 5) - 1);

  with kids as (
    select s.id, s.created_at from students s where s.academy_id = a and s.status = 'active'),
  ph as (
    select rp.student_id, rp.phone from roster_phones rp
     where rp.academy_id = a and rp.role = 'parent' and rp.student_id in (select id from kids)),
  shared as (   -- 두 학생 이상이 함께 쓰는 학부모 번호 = 형제의 표시
    select phone from ph group by phone having count(distinct student_id) > 1),
  fam as (      -- 형제 묶음 열쇠: 함께 쓰는 번호 중 가장 작은 것, 없으면 자기 자신(혼자)
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
  select a, x.id, p_ym, x.amount, d.disc, 0, x.amount - d.disc, due, 'issued'
  from amt x cross join lateral (
    select case when x.rn > 1 then round(x.amount * coalesce(r.sibling_discount_pct, 0) / 100.0)::int else 0 end as disc) d
  where not exists (select 1 from invoices i where i.student_id = x.id and i.period_ym = p_ym);
  get diagnostics cnt = row_count;
  return cnt;
end $$;

-- ---------------------------------------------------------------- 2. 상태 다시 세기 (납부 합계 ↔ 청구액)
-- 면제(void)는 건드리지 않는다. 낼 것이 없으면(총액 0) 납부로 치지 않는다 — 원장이 금액을 정하라고 남겨 둔다.
create or replace function recalc_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices; s int;
begin
  select * into inv from invoices where id = p_invoice;
  if inv.id is null then raise exception 'not found'; end if;
  if inv.status = 'void' then return; end if;
  select coalesce(sum(amount), 0) into s from payments where invoice_id = p_invoice;
  if inv.total > 0 and s >= inv.total then
    update invoices set status = 'paid', paid_at = (select max(paid_at) from payments where invoice_id = p_invoice) where id = p_invoice;
  elsif s > 0 then
    update invoices set status = 'partial', paid_at = null where id = p_invoice;
  else
    update invoices
       set status = (case when due_date < (now() at time zone 'Asia/Seoul')::date and total > 0 then 'overdue' else 'issued' end)::invoice_status,
           paid_at = null
     where id = p_invoice;
  end if;
end $$;

-- ---------------------------------------------------------------- 3. 납부 적기 (계좌이체·현금·카드 — 원장이 통장을 보고 누른다)
create or replace function record_payment(p_invoice uuid, p_amount int, p_method pay_method, p_paid_at timestamptz default now(), p_memo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare inv invoices;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  select * into inv from invoices where id = p_invoice and academy_id = current_academy_id();
  if inv.id is null then raise exception 'not found'; end if;
  if inv.status = 'void' then raise exception 'void invoice'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  insert into payments (academy_id, invoice_id, amount, method, paid_at, recorded_by)
  values (inv.academy_id, inv.id, p_amount, p_method, coalesce(p_paid_at, now()), auth.uid());
  if p_memo is not null and trim(p_memo) <> '' then update invoices set memo = p_memo where id = inv.id; end if;
  perform recalc_invoice(inv.id);
end $$;

-- ---------------------------------------------------------------- 4. 면제·취소 / 금액 고치기
create or replace function void_invoice(p_invoice uuid, p_memo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if not exists (select 1 from invoices where id = p_invoice and academy_id = current_academy_id()) then raise exception 'not found'; end if;
  update invoices set status = 'void', paid_at = null, memo = coalesce(nullif(trim(coalesce(p_memo, '')), ''), memo) where id = p_invoice;
end $$;

create or replace function set_invoice_amount(p_invoice uuid, p_amount int, p_discount int, p_textbook int) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  select * into inv from invoices where id = p_invoice and academy_id = current_academy_id();
  if inv.id is null then raise exception 'not found'; end if;
  if coalesce(p_amount, 0) < 0 or coalesce(p_discount, 0) < 0 or coalesce(p_textbook, 0) < 0 then raise exception 'bad amount'; end if;
  update invoices
     set amount = coalesce(p_amount, 0), discount = coalesce(p_discount, 0), textbook = coalesce(p_textbook, 0),
         total = coalesce(p_amount, 0) - coalesce(p_discount, 0) + coalesce(p_textbook, 0),
         status = case when status = 'void' then 'issued' else status end
   where id = p_invoice;
  perform recalc_invoice(p_invoice);
end $$;

-- ---------------------------------------------------------------- 5. 연체 표시 (화면이 열릴 때 · 살림이 하루 한 번)
create or replace function refresh_overdue() returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  update invoices set status = 'overdue'
   where academy_id = current_academy_id() and status = 'issued' and total > 0
     and due_date < (now() at time zone 'Asia/Seoul')::date;
  get diagnostics c = row_count;
  return c;
end $$;

-- ---------------------------------------------------------------- 6. 미납 안내
-- 알림 한 줄 → 0013 트리거가 푸시(catch-all NOTIFY)로 민다. 심사받은 알림톡 템플릿이 아직 없어 카톡에는 안 간다.
-- link 는 'child:' — 학부모가 알림을 누르면 우리 아이 화면(수강료 카드가 있는 자리)으로 간다.
-- 같은 청구서에 하루 두 번 보내지 않는다(20시간).
create or replace function remind_unpaid(p_ym text) returns int
language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id(); r billing_rules; anm text; inv record; rest int; n int; cnt int := 0;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if p_ym !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'bad month'; end if;
  update invoices set status = 'overdue'
   where academy_id = a and period_ym = p_ym and status = 'issued' and total > 0
     and due_date < (now() at time zone 'Asia/Seoul')::date;
  select * into r from billing_rules where academy_id = a;
  select name into anm from academies where id = a;

  for inv in
    select i.*, coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0) as paid_sum
      from invoices i
     where i.academy_id = a and i.period_ym = p_ym and i.status in ('issued', 'partial', 'overdue')
       and (i.reminded_at is null or i.reminded_at < now() - interval '20 hours')
     order by i.due_date
  loop
    rest := inv.total - inv.paid_sum;
    if rest <= 0 then continue; end if;
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
    if n = 0 then continue; end if;   -- 받을 사람이 아직 없으면 보낸 것으로 치지 않는다 (나중에 다시 시도)
    update invoices set reminded_at = now() where id = inv.id;
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;

-- ---------------------------------------------------------------- 7. 학부모·학생: 내 청구서 한 장
-- billing_rules 는 staff 만 읽을 수 있어(계좌 안내가 그 안에 있다) security definer 로 한 줄만 내보낸다.
create or replace function my_invoice(p_ym text)
returns table (id uuid, period_ym text, amount int, discount int, textbook int, total int, paid int,
               due_date date, status invoice_status, memo text, bank_info text, student_name text)
language sql stable security definer set search_path = public as $$
  select i.id, i.period_ym, i.amount, i.discount, i.textbook, i.total,
         coalesce((select sum(p.amount)::int from payments p where p.invoice_id = i.id), 0),
         i.due_date, i.status, i.memo, br.bank_info, s.name
    from invoices i
    join students s on s.id = i.student_id
    left join billing_rules br on br.academy_id = i.academy_id
   where i.academy_id = current_academy_id() and i.period_ym = p_ym
     and i.student_id in (select my_student_ids())
   limit 1 $$;

-- ---------------------------------------------------------------- 8. 권한
revoke execute on function issue_invoices(text) from public, anon;
revoke execute on function recalc_invoice(uuid) from public, anon;
revoke execute on function record_payment(uuid, int, pay_method, timestamptz, text) from public, anon;
revoke execute on function void_invoice(uuid, text) from public, anon;
revoke execute on function set_invoice_amount(uuid, int, int, int) from public, anon;
revoke execute on function refresh_overdue() from public, anon;
revoke execute on function remind_unpaid(text) from public, anon;
revoke execute on function my_invoice(text) from public, anon;
grant execute on function issue_invoices(text) to authenticated;
grant execute on function record_payment(uuid, int, pay_method, timestamptz, text) to authenticated;
grant execute on function void_invoice(uuid, text) to authenticated;
grant execute on function set_invoice_amount(uuid, int, int, int) to authenticated;
grant execute on function refresh_overdue() to authenticated;
grant execute on function remind_unpaid(text) to authenticated;
grant execute on function my_invoice(text) to authenticated;
grant execute on function recalc_invoice(uuid) to service_role;

-- ---------------------------------------------------------------- 9. 살림에 한 줄 (0013 본문 + 연체 표시)
create or replace function housekeeping() returns table (what text, n int) language plpgsql security definer set search_path = public as $$
declare c int;
begin
  delete from otp_codes where created_at < now() - interval '1 day'; get diagnostics c = row_count;
  what := 'otp_codes'; n := c; return next;

  delete from link_tokens where expires_at < now() - interval '7 days'; get diagnostics c = row_count;
  what := 'link_tokens'; n := c; return next;

  delete from invite_tokens where expires_at < now() - interval '30 days'; get diagnostics c = row_count;
  what := 'invite_tokens'; n := c; return next;

  delete from notifications where read_at is not null and created_at < now() - interval '90 days'; get diagnostics c = row_count;
  what := 'notifications'; n := c; return next;

  delete from outbox where status in ('sent','delivered') and created_at < now() - interval '90 days'; get diagnostics c = row_count;
  what := 'outbox'; n := c; return next;

  delete from client_errors where at < now() - interval '30 days'; get diagnostics c = row_count;
  what := 'client_errors'; n := c; return next;

  update invoices set status = 'overdue'
   where status = 'issued' and total > 0 and due_date < (now() at time zone 'Asia/Seoul')::date;
  get diagnostics c = row_count;
  what := 'invoices_overdue'; n := c; return next;
end $$;
revoke execute on function housekeeping() from public, anon, authenticated;
grant execute on function housekeeping() to service_role;
