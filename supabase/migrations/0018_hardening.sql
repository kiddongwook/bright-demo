-- 0018 적대적 점검 뒷수습 — DB 층 (2026-09-04)
--   docs/reports/2026-09-04-redteam-integrity.md (INT-01…39)
--   docs/reports/2026-09-04-redteam-input.md     (INP-01…80)
--
-- 네 갈래로 묶었다.
--   1) 돈에 상한·바닥이 없다            INT-02·03·04·30·31·34·50·54, INP-51·52·53
--   2) "한 번만" 규칙이 동시 요청에 무너진다  INT-01·05·09·10·12
--   3) 사람을 빼는 동작이 뒤를 못 친다      INT-20·21·25·27·29·32·39
--   4) 가리키던 것이 사라져도 가리킨 쪽이 남는다 INT-22·23·38
--   그리고 어느 층에도 글자 수·모양 상한이 없다 INP-01·06·10·12·13·20·31·40·41·42·45·60·70·73·75
--
-- 순서: FK 갈아 끼우기 → 표 제약 → 함수 → 트리거 → 권한.
-- 함수는 전부 create or replace 라 0014·0017 에서 준 grant/revoke 는 그대로 살아 있다(새 함수 둘만 아래에서 준다).

-- ================================================================ 0. FK 갈아 끼우기용 도우미
-- 이름을 박아 두지 않는다 — 0004 가 만든 이름과 처음 스키마의 이름이 섞여 있다.
create or replace function _fk_swap(p_table text, p_column text, p_ref_table text, p_action text) returns void
language plpgsql as $$
declare c text; def text;
begin
  select conname, pg_get_constraintdef(oid) into c, def
    from pg_constraint
   where conrelid = ('public.' || p_table)::regclass and contype = 'f'
     and pg_get_constraintdef(oid) like 'FOREIGN KEY (' || p_column || ')%'
   limit 1;
  if c is null then c := p_table || '_' || p_column || '_fkey'; def := ''; end if;
  -- 이미 원하는 규칙이면 그대로 둔다
  if def ilike '%on delete ' || p_action || '%' then return; end if;
  if def <> '' then execute format('alter table public.%I drop constraint %I', p_table, c); end if;
  execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s',
    p_table, c, p_column, p_ref_table, p_action);
end $$;

-- ---------------------------------------------------------------- INT-22 / INT-23 반을 지우는 길
-- 반을 지우면 그 반 휴원일·요금제는 같이 간다. 요금제를 학원 공통(class_id=null)으로 눕히면
-- issue_invoices 의 폴백이 엉뚱한 학생에게 그 금액을 매긴다(INT-23 — 실제 청구서에 찍히는 것까지 확인됐다).
select _fk_swap('calendar',  'class_id', 'classes', 'cascade');
select _fk_swap('fee_plans', 'class_id', 'classes', 'cascade');
-- 반 공지는 지우지 않는다. 전체 공지로 둔갑(set null)하면 안 볼 사람에게 퍼지고,
-- cascade 로 지우면 읽은 기록까지 사라진다 → 원장이 공지를 먼저 정리하게 막는다(INT-22 는 절반만 닫힌다).
select _fk_swap('notices', 'target_class_id', 'classes', 'restrict');

-- ---------------------------------------------------------------- INT-25 / INT-29 사람을 지우는 길
-- users(id) 를 가리키는 FK 아홉 개에 on delete 가 없어 계정을 지울 수 없었다(강사 탈퇴·개인정보 삭제 요청).
-- 기록은 남기고 사람만 뗀다 → set null. outbox 는 "그 사람에게 보낼 줄" 이라 같이 간다 → cascade.
alter table notes            alter column author_id     drop not null;
alter table notices          alter column author_id     drop not null;
alter table absence_requests alter column requested_by  drop not null;
alter table inquiries        alter column asked_by      drop not null;
select _fk_swap('notes',            'author_id',    'users', 'set null');
select _fk_swap('notices',          'author_id',    'users', 'set null');
select _fk_swap('attendance',       'marked_by',    'users', 'set null');
select _fk_swap('absence_requests', 'requested_by', 'users', 'set null');
select _fk_swap('inquiries',        'asked_by',     'users', 'set null');
select _fk_swap('classes',          'teacher_id',   'users', 'set null');
select _fk_swap('students',         'user_id',      'users', 'set null');
select _fk_swap('outbox',           'to_user_id',   'users', 'cascade');
select _fk_swap('audit_log',        'actor_id',     'users', 'set null');

drop function _fk_swap(text, text, text, text);

-- ================================================================ 1. 표 제약 — 모양·길이·금액
-- 어느 층에도 상한이 없어 2,000자 제목이 알림톡 문구까지 갔다(INP-01). 마지막 문은 표가 잡는다.

-- 돈 (INT-31, INP-50·54, INP-51·53). 상한 500만 원 = 한 달 수강료로 있을 수 없는 값.
alter table invoices drop constraint if exists invoices_amounts_ck;
alter table invoices add constraint invoices_amounts_ck check (
  amount >= 0 and discount >= 0 and textbook >= 0 and total >= 0 and total <= 5000000);
alter table fee_plans drop constraint if exists fee_plans_amount_cap_ck;
alter table fee_plans add constraint fee_plans_amount_cap_ck check (amount <= 5000000);

-- 없는 달 (INP-42). 모양만 보던 check 를 달 01~12 까지 보게 바꾼다.
do $$ declare c text; begin
  select conname into c from pg_constraint
   where conrelid = 'invoices'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%period_ym%';
  if c is not null then execute format('alter table invoices drop constraint %I', c); end if;
end $$;
alter table invoices add constraint invoices_period_ym_check check (period_ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- 글자 수 (INP-01·06·70·73·75)
alter table notices drop constraint if exists notices_title_ck;
alter table notices add constraint notices_title_ck check (btrim(title) <> '' and length(title) <= 80);
alter table students drop constraint if exists students_name_ck;
alter table students add constraint students_name_ck check (btrim(name) <> '' and length(name) <= 20);
alter table attendance drop constraint if exists attendance_note_ck;
alter table attendance add constraint attendance_note_ck check (note is null or length(note) <= 100);
alter table billing_rules drop constraint if exists billing_rules_bank_info_ck;
alter table billing_rules add constraint billing_rules_bank_info_ck check (bank_info is null or length(bank_info) <= 200);

-- 날짜 상·하한 (INP-40·41). 9999-12-31 짜리 할 것이 학부모 목록에 영원히 남아 있었다.
alter table calendar drop constraint if exists calendar_date_range_ck;
alter table calendar add constraint calendar_date_range_ck check (date >= date '2020-01-01' and date < date '2100-01-01');
alter table todos drop constraint if exists todos_due_date_range_ck;
alter table todos add constraint todos_due_date_range_ck check (due_date >= date '2020-01-01' and due_date < date '2100-01-01');

-- 푸시 구독 주소 (INP-10·12). http://192.0.2.1 짜리 죽은 구독 하나가 그 사람의 카톡까지 껐다(INP-11 의 입구).
alter table push_subscriptions drop constraint if exists push_subscriptions_endpoint_ck;
alter table push_subscriptions add constraint push_subscriptions_endpoint_ck
  check (endpoint ~ '^https://' and length(endpoint) <= 2048);

-- outbox.params (INP-20). 압축된 크기와 실제 JSON 길이를 둘 다 본다 — 30KB 짜리는 잘 압축돼 pg_column_size 만으로는 안 걸린다.
alter table outbox drop constraint if exists outbox_params_size_ck;
alter table outbox add constraint outbox_params_size_ck
  check (pg_column_size(params) <= 8192 and length(params::text) <= 8192);

-- 명부 번호 모양 (INP-31). '+82 10-…' 가 821012345678 로 앉으면 그 사람은 영영 못 들어온다.
alter table roster_phones drop constraint if exists roster_phones_phone_ck;
alter table roster_phones add constraint roster_phones_phone_ck check (phone ~ '^01[016789][0-9]{7,8}$');

-- ================================================================ 2. 시간표 모양 (INP-45·60·80)
-- 24:00 · 19:60 · dow 9 가 그대로 저장돼 hmToMin 이 조용히 버렸다 — 시간표는 있는데 "오늘 수업" 에 안 잡히는 반.
-- 앞 0 없는 '7:00' 도 막는다: nextClassDays 가 문자열로 비교해서 밤 11시 반에도 "다음 수업 오늘" 로 떴다.
create or replace function classes_schedule_guard() returns trigger
language plpgsql set search_path = public as $$
declare s jsonb;
begin
  if new.schedule is null then new.schedule := '[]'::jsonb; end if;
  if jsonb_typeof(new.schedule) <> 'array' then raise exception 'bad schedule: 배열이어야 합니다'; end if;
  if jsonb_array_length(new.schedule) > 14 then raise exception 'bad schedule: 시간대가 너무 많습니다'; end if;
  for s in select value from jsonb_array_elements(new.schedule) loop
    if jsonb_typeof(s) <> 'object'
       or coalesce(s->>'dow', '')   !~ '^[0-6]$'
       or coalesce(s->>'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(s->>'end', '')   !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (s->>'end') <= (s->>'start')
    then raise exception 'bad schedule: %', s::text; end if;
  end loop;
  return new;
end $$;
drop trigger if exists classes_schedule_guard_t on classes;
create trigger classes_schedule_guard_t before insert or update on classes
for each row execute function classes_schedule_guard();

-- ================================================================ 3. 푸시 구독 수 상한 (INP-13)
-- 한 사람 60행이면 outbox-send 가 알림 한 건에 60번 순차 발송 → Edge 타임아웃 → INP-21 로 이어진다.
-- 기기 5대까지. 넣기 전에 오래된 것부터 지운다(새 행은 아직 표에 없으니 4개만 남긴다).
create or replace function push_subscriptions_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 들어오는 기기(같은 endpoint 로 다시 구독)는 세지 않는다 — 그러지 않으면 upsert 한 번에
  -- 엉뚱한 기기 하나가 조용히 빠진다 (앱은 delete → insert 지만 RLS 는 upsert 도 허용한다).
  delete from push_subscriptions
   where user_id = new.user_id and endpoint <> new.endpoint
     and id in (select id from push_subscriptions
                 where user_id = new.user_id and endpoint <> new.endpoint
                 order by created_at desc offset 4);
  return new;
end $$;
drop trigger if exists push_subscriptions_cap_t on push_subscriptions;
create trigger push_subscriptions_cap_t before insert on push_subscriptions
for each row execute function push_subscriptions_cap();

-- ================================================================ 4. 돈 — 함수
-- ---------------------------------------------------------------- INT-01 청구서 만들기
-- not exists 로 먼저 훑고 넣어서, 동시 실행이면 unique 위반 원문이 원장 화면에 그대로 튀었다.
-- 훑기를 없애고 on conflict do nothing 으로 표에게 맡긴다 — 넣힌 수는 get diagnostics 가 정확히 센다.
create or replace function issue_invoices(p_ym text) returns int
language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id(); r billing_rules; due date; cnt int := 0;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
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

-- ---------------------------------------------------------------- INT-30 / INT-32 상태 다시 세기
-- 한 번 연체로 넘어간 청구서는 부분 납부가 들어와도 연체로 둔다 — 그러지 않으면
-- refresh_overdue 가 뒤집고 record_payment 가 되돌리기를 반복한다.
create or replace function recalc_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices; s int;
begin
  select * into inv from invoices where id = p_invoice;
  if inv.id is null then raise exception 'not found'; end if;
  if auth.uid() is not null
     and (not coalesce(is_staff(), false) or inv.academy_id is distinct from current_academy_id()) then
    raise exception 'not allowed';
  end if;
  if inv.status = 'void' then return; end if;
  select coalesce(sum(amount), 0) into s from payments where invoice_id = p_invoice;
  if inv.total > 0 and s >= inv.total then
    update invoices set status = 'paid', paid_at = (select max(paid_at) from payments where invoice_id = p_invoice) where id = p_invoice;
  elsif s > 0 then
    update invoices set status = (case when inv.status = 'overdue' then 'overdue' else 'partial' end)::invoice_status,
                        paid_at = null
     where id = p_invoice;
  else
    update invoices
       set status = (case when due_date < (now() at time zone 'Asia/Seoul')::date and total > 0 then 'overdue' else 'issued' end)::invoice_status,
           paid_at = null
     where id = p_invoice;
  end if;
end $$;

-- ---------------------------------------------------------------- INT-02 / INT-03 / INP-52 납부 적기
-- 과납 방어가 전혀 없어 동시 3회면 청구액의 3배가 그대로 적혔다. 청구서 행을 잠그고(for update)
-- 그 뒤에 낸 돈을 세어 남은 금액과 견준다 — 잠금이 없으면 세 요청이 같은 "남은 금액" 을 읽어 셋 다 통과한다.
create or replace function record_payment(p_invoice uuid, p_amount int, p_method pay_method, p_paid_at timestamptz default now(), p_memo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare inv invoices; paid int; rest int;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  select * into inv from invoices where id = p_invoice and academy_id = current_academy_id() for update;
  if inv.id is null then raise exception 'not found'; end if;
  if inv.status = 'void' then raise exception 'void invoice'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_amount > 5000000 then raise exception 'over_cap'; end if;
  select coalesce(sum(amount), 0) into paid from payments where invoice_id = inv.id;
  rest := inv.total - paid;
  if p_amount > rest then
    raise exception 'overpay: 남은 금액 %원, 적으려는 금액 %원', rest, p_amount;
  end if;
  insert into payments (academy_id, invoice_id, amount, method, paid_at, recorded_by)
  values (inv.academy_id, inv.id, p_amount, p_method, coalesce(p_paid_at, now()), auth.uid());
  if p_memo is not null and trim(p_memo) <> '' then update invoices set memo = p_memo where id = inv.id; end if;
  perform recalc_invoice(inv.id);
end $$;

-- ---------------------------------------------------------------- INT-34 면제
-- 전액 낸 청구서를 면제하면 청구는 void 인데 납부 10만 원이 남아 "받은 돈" 집계와 어긋났다.
-- 낸 돈이 있으면 면제를 막는다 — 먼저 납부 기록을 지우거나(환불) 금액을 고치라고 되돌려 보낸다.
create or replace function void_invoice(p_invoice uuid, p_memo text) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  select * into inv from invoices where id = p_invoice and academy_id = current_academy_id() for update;
  if inv.id is null then raise exception 'not found'; end if;
  if exists (select 1 from payments where invoice_id = p_invoice) then
    raise exception 'has_payments: 납부 기록이 있는 청구서는 면제할 수 없습니다 (환불·기록 삭제가 먼저)';
  end if;
  update invoices set status = 'void', paid_at = null, memo = coalesce(nullif(trim(coalesce(p_memo, '')), ''), memo) where id = p_invoice;
end $$;

-- ---------------------------------------------------------------- INT-30 / INT-31 / INP-50 금액 고치기
-- 칸마다 음수만 보고 합계는 안 봤다(총액 -40,000). 낸 돈보다 낮게 고치는 길도 열려 있었다.
create or replace function set_invoice_amount(p_invoice uuid, p_amount int, p_discount int, p_textbook int) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices; tot int; paid int;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  select * into inv from invoices where id = p_invoice and academy_id = current_academy_id() for update;
  if inv.id is null then raise exception 'not found'; end if;
  if coalesce(p_amount, 0) < 0 or coalesce(p_discount, 0) < 0 or coalesce(p_textbook, 0) < 0 then raise exception 'bad amount'; end if;
  tot := coalesce(p_amount, 0) - coalesce(p_discount, 0) + coalesce(p_textbook, 0);
  if tot < 0 then raise exception 'bad amount: 총액이 음수입니다 (%)', tot; end if;
  if tot > 5000000 then raise exception 'over_cap'; end if;
  select coalesce(sum(amount), 0) into paid from payments where invoice_id = inv.id;
  if tot < paid then
    raise exception 'below_paid: 이미 낸 돈 %원보다 낮은 총액 %원 (환불 먼저)', paid, tot;
  end if;
  update invoices
     set amount = coalesce(p_amount, 0), discount = coalesce(p_discount, 0), textbook = coalesce(p_textbook, 0),
         total = tot,
         status = case when status = 'void' then 'issued' else status end
   where id = p_invoice;
  perform recalc_invoice(p_invoice);
end $$;

-- ---------------------------------------------------------------- INT-21 / INT-32 연체 표시
-- ① 부분 납부도 뒤집는다(전에는 issued 만) ② 퇴원생 청구서는 빼 둔다(원장 화면 합계가 영원히 부풀었다)
create or replace function refresh_overdue() returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  update invoices i set status = 'overdue'
   where i.academy_id = current_academy_id() and i.status in ('issued','partial') and i.total > 0
     and i.due_date < (now() at time zone 'Asia/Seoul')::date
     and i.total > coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
     and exists (select 1 from students s where s.id = i.student_id and s.status <> 'left');
  get diagnostics c = row_count;
  return c;
end $$;

-- ---------------------------------------------------------------- INT-12 / INT-21 미납 안내
-- "20시간에 한 번" 을 읽고-쓰기로 만들어 동시 두 번이면 같은 학부모에게 두 번 갔다.
-- 이제 한 UPDATE 가 보낼 대상을 확정하고(잠금은 UPDATE 가 잡는다), 돌려받은 행만 알린다.
-- 받을 사람 없는 청구서·퇴원생 청구서·남은 금액 0원은 애초에 UPDATE 에 안 걸린다.
create or replace function remind_unpaid(p_ym text) returns int
language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id(); r billing_rules; anm text; ids uuid[]; inv invoices;
        paid int; rest int; n int; cnt int := 0;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
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

-- ---------------------------------------------------------------- INP-42 학부모 카드
-- 없는 달(2026-13)로 부르면 빈 줄. 표 check 가 그런 행을 못 만들게 됐지만 문은 여기서도 닫는다.
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
     and p_ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     and i.student_id in (select my_student_ids())
   limit 1 $$;

-- ================================================================ 5. "한 번만" 규칙
-- ---------------------------------------------------------------- INT-10 초대 링크
-- "옛 토큰 만료 → 새 토큰" 이 원자적이 아니라, 버튼을 두 번 누르면 쓸 수 있는 링크가 여럿 남았다.
-- 유출된 옛 링크를 새 링크 발급으로 무효화할 수 없다는 뜻이다. 학원×번호 단위 자문 잠금으로 줄을 세운다.
create or replace function create_invite(p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id(); ph text := normalize_phone(p_phone); r text; tok text;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if ph = '' then raise exception 'phone required'; end if;
  perform pg_advisory_xact_lock(hashtext(a::text || ':' || ph));
  select rp.role::text into r from roster_phones rp
   where rp.academy_id = a and rp.phone = ph
   order by case rp.role when 'director' then 0 when 'teacher' then 1 when 'parent' then 2 else 3 end
   limit 1;
  if r is null then raise exception 'not in roster'; end if;
  update invite_tokens set expires_at = now()
   where academy_id = a and phone = ph and used_at is null and expires_at > now();
  tok := replace(gen_random_uuid()::text, '-', '');
  insert into invite_tokens (academy_id, phone, role, token_hash, expires_at, created_by)
  values (a, ph, r, encode(sha256(convert_to(tok, 'utf8')), 'hex'), now() + interval '7 days', auth.uid());
  return tok;
end $$;

-- ---------------------------------------------------------------- INT-05 / INT-06 휴원일 여러 날
-- addCalendarMany 는 여러 날을 한 statement 로 넣어, 겹치는 날 하나 때문에 넣으려던 새 날짜까지 전부 없던 일이 됐다.
-- (걸러 내기를 클라이언트에 맡긴 것이 원인 — 다른 탭이 방금 넣은 날은 볼 수 없다.)
-- 계약 S4 "두 번째는 0행, 건너뜀 3" 대로 행마다 on conflict do nothing 하고 실제로 넣은 수를 돌려준다.
create or replace function add_calendar_many(p_dates date[], p_kind cal_kind, p_note text, p_class uuid)
returns int language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id(); cnt int := 0;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if p_class is not null and not exists (select 1 from classes where id = p_class and academy_id = a) then
    raise exception 'bad class';
  end if;
  if p_dates is null or array_length(p_dates, 1) is null then return 0; end if;
  if array_length(p_dates, 1) > 400 then raise exception 'too many dates'; end if;
  insert into calendar (academy_id, date, kind, note, class_id)
  select a, d, p_kind, nullif(btrim(coalesce(p_note, '')), ''), p_class
    from unnest(p_dates) d
  on conflict (academy_id, date, kind, class_id) do nothing;
  get diagnostics cnt = row_count;
  return cnt;
end $$;
revoke execute on function add_calendar_many(date[], cal_kind, text, uuid) from public, anon;
grant execute on function add_calendar_many(date[], cal_kind, text, uuid) to authenticated;

-- ---------------------------------------------------------------- INT-09 출결 알림 되풀이
-- 지각→출석→지각을 저장하면 같은 내용 알림이 다시 갔다. 진짜로 바뀐 것은 알리되,
-- 10분 안에 똑같은 알림(사람·종류·링크·제목)이 이미 있으면 새로 만들지 않는다.
-- 0015 본문(사유를 제목·본문에 붙이는 판)을 그대로 가져오고 not exists 한 줄만 얹었다.
create or replace function trg_attendance() returns trigger language plpgsql security definer set search_path = public as $$
declare sname text; why text; t_par text; t_self text; b text;
begin
  if new.status in ('late','absent') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select name into sname from students where id = new.student_id;
    why := coalesce(' · ' || nullif(btrim(new.note), ''), '');
    t_par  := sname || ' 오늘 ' || case when new.status = 'late' then '지각' else '결석' end || '으로 기록됐어요' || why;
    t_self := '오늘 ' || case when new.status = 'late' then '지각' else '결석' end || '으로 기록됐어요' || why;
    b := to_char(new.date, 'MM/DD') || why;
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, g.user_id, 'attendance', t_par, b, 'child:' || new.id
    from guardians g where g.student_id = new.student_id
      and not exists (select 1 from notifications n
                       where n.user_id = g.user_id and n.kind = 'attendance'
                         and n.link = 'child:' || new.id and n.title = t_par
                         and n.created_at > now() - interval '10 minutes');
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, s.user_id, 'attendance', t_self, b, 'me:' || new.id
    from students s where s.id = new.student_id and s.user_id is not null
      and not exists (select 1 from notifications n
                       where n.user_id = s.user_id and n.kind = 'attendance'
                         and n.link = 'me:' || new.id and n.title = t_self
                         and n.created_at > now() - interval '10 minutes');
  end if;
  return new;
end $$;

-- ================================================================ 6. 사람을 빼는 동작
-- ---------------------------------------------------------------- INT-20 / 21 / 27 / 39 퇴원
-- 전에는 명부·소속·보호자·수강등록만 지웠다. 남은 것: 푸시 구독·초대 토큰·앞으로의 청구서,
-- 그리고 자녀 둘 중 하나가 나가면 학부모의 active_membership_id 가 비어 남은 자녀도 안 보였다.
create or replace function student_leave(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id(); uids uuid[]; phones text[]; u uuid;
begin
  if current_role_() <> 'director' or not exists (select 1 from students where id = sid and academy_id = a) then raise exception 'not allowed'; end if;

  -- 지우기 전에 딸린 사람·번호를 적어 둔다
  select array_agg(distinct x) into uids from (
    select m.user_id as x from memberships m where m.student_id = sid
    union select g.user_id from guardians g where g.student_id = sid
    union select s.user_id from students s where s.id = sid and s.user_id is not null) t;
  select array_agg(distinct rp.phone) into phones from roster_phones rp where rp.student_id = sid;

  update students set status = 'left', left_at = now() where id = sid;
  delete from memberships where student_id = sid;
  delete from guardians where student_id = sid;
  delete from roster_phones where student_id = sid;
  delete from enrollments where student_id = sid;

  -- 앞으로 낼 것은 없다: 다음 달부터의 미납 청구서를 면제한다 (낸 돈이 있는 것은 그대로 — 기록이 어긋난다)
  update invoices i set status = 'void', paid_at = null
   where i.student_id = sid and i.academy_id = a and i.status <> 'void'
     and i.period_ym > to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM')
     and not exists (select 1 from payments p where p.invoice_id = i.id);

  -- 아직 안 쓴 초대 링크를 만료시킨다 (그 번호가 이 학원 명부에서 완전히 빠진 경우만)
  if phones is not null then
    update invite_tokens t set expires_at = now()
     where t.academy_id = a and t.phone = any(phones) and t.used_at is null and t.expires_at > now()
       and not exists (select 1 from roster_phones rp where rp.academy_id = a and rp.phone = t.phone);
  end if;

  if uids is not null then
    foreach u in array uids loop
      -- 보고 있던 소속이 사라졌으면(FK set null) 남은 소속 하나로 옮긴다 — 남은 자녀가 있는데 아무것도 안 보이던 자리
      update users set active_membership_id = (select m.id from memberships m where m.user_id = u order by m.created_at limit 1)
       where id = u and active_membership_id is null;
      -- 어느 학원에도 소속이 없으면 푸시 구독도 치운다
      if not exists (select 1 from memberships m where m.user_id = u) then
        delete from push_subscriptions where user_id = u;
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------- INT-39 퇴원 직전에 줄에 선 알림
-- 발송기(outbox-send)가 보내기 전에 물어볼 자리. 받는 사람이 그 학원에 아직 소속이 있나?
create or replace function outbox_recipient_active(p_outbox uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from outbox o join memberships m on m.user_id = o.to_user_id and m.academy_id = o.academy_id
     where o.id = p_outbox) $$;
revoke execute on function outbox_recipient_active(uuid) from public, anon, authenticated;
grant execute on function outbox_recipient_active(uuid) to service_role;

-- ---------------------------------------------------------------- INP-31 명부 번호 모양
create or replace function roster_save_student(sid uuid, p_name text, p_class_ids uuid[], p_student_phone text, p_parent_phones text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id(); s uuid := sid; ph text; u uuid; keep text[] := '{}'; r record;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'name required'; end if;
  if length(trim(p_name)) > 20 then raise exception 'name too long'; end if;
  -- 화면(Roster.tsx) 밖에서 온 값도 여기서 막는다: CSV 적용·API·다른 클라이언트
  ph := normalize_phone(p_student_phone);
  if ph <> '' and ph !~ '^01[016789][0-9]{7,8}$' then raise exception 'bad_phone: %', p_student_phone; end if;
  foreach ph in array coalesce(p_parent_phones, '{}'::text[]) loop
    ph := normalize_phone(ph); if ph = '' then continue; end if;
    if ph !~ '^01[016789][0-9]{7,8}$' then raise exception 'bad_phone: %', ph; end if;
  end loop;

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

create or replace function roster_save_teacher(p_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare ph text := normalize_phone(p_phone); u uuid;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if ph = '' or trim(coalesce(p_name, '')) = '' then raise exception 'name and phone required'; end if;
  if ph !~ '^01[016789][0-9]{7,8}$' then raise exception 'bad_phone: %', p_phone; end if;
  insert into roster_phones (academy_id, phone, role, name) values (current_academy_id(), ph, 'teacher', trim(p_name))
    on conflict (academy_id, phone, role, student_id) do update set name = excluded.name;
  select id into u from users where phone = ph;
  if u is not null then insert into memberships (user_id, academy_id, role) values (u, current_academy_id(), 'teacher') on conflict (user_id, academy_id, role, student_id) do nothing; end if;
end $$;

-- ================================================================ 7. 가리키던 것이 사라질 때
-- ---------------------------------------------------------------- INT-38 공지를 지우면
-- 알림·발송 줄이 남아, 종에서 누르면 없는 공지로 가고 아직 안 보낸 줄은 지워진 공지를 알리며 나갔다.
-- notifications.link 는 문자열, outbox.link_ref 는 FK 없는 uuid 라 아무도 안 치웠다.
create or replace function trg_notice_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from notifications where link = 'notice-view:' || old.id;
  update outbox set status = 'dead', last_error = coalesce(last_error, 'notice deleted')
   where link_view = 'notice-view' and link_ref = old.id and status in ('queued','failed');
  return old;
end $$;
drop trigger if exists notices_delete_cleanup on notices;
create trigger notices_delete_cleanup after delete on notices
for each row execute function trg_notice_delete();

-- ---------------------------------------------------------------- 사람이 지워졌을 때 터지지 않게
-- 위에서 author/asked_by/requested_by 를 set null 로 바꿨다. 그 사람이 지워진 뒤에도
-- 문의 답변·결석 승인이 계속 돌아야 한다 (notifications.user_id·title 은 not null).
create or replace function trg_inquiry() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, m.user_id, 'inquiry',
      coalesce((select name from users where id = new.asked_by), '학부모') || '이 문의를 보냈어요', new.topic, 'inbox:' || new.id
    from memberships m where m.academy_id = new.academy_id and m.role in ('director','teacher');
  elsif tg_op = 'UPDATE' and new.answer is not null and old.answer is null and new.asked_by is not null then
    insert into notifications (academy_id, user_id, kind, title, body, link)
    values (new.academy_id, new.asked_by, 'inquiry', '원장님이 문의에 답했어요', new.topic, 'ask-mine:' || new.id);
  end if;
  return new;
end $$;

create or replace function trg_absence() returns trigger language plpgsql security definer set search_path = public as $$
declare sname text;
begin
  select name into sname from students where id = new.student_id;
  if tg_op = 'INSERT' then
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, m.user_id, 'absence', sname || ' ' || to_char(new.date, 'MM/DD') || ' 결석 신청이 왔어요', new.reason, 'today:' || new.id
    from memberships m where m.academy_id = new.academy_id and m.role in ('director','teacher');
  elsif tg_op = 'UPDATE' and new.status = 'confirmed' and old.status <> 'confirmed' and new.requested_by is not null then
    insert into notifications (academy_id, user_id, kind, title, body, link)
    values (new.academy_id, new.requested_by, 'absence', to_char(new.date, 'MM/DD') || ' 결석 → ' ||
      case when new.makeup_kind = 'material' then '자료로 대체' else to_char(new.makeup_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || ' 보강' end,
      '원장님이 잡았어요', 'child:' || new.id);
  end if;
  return new;
end $$;

-- ================================================================ 8. 굳은 outbox 줄 (INP-21)
-- outbox_claim 이 attempts+1 을 먼저 커밋하고 상태 갱신은 발송 함수가 한다. Edge 타임아웃처럼
-- catch 밖에서 죽으면 status='queued' 인 채 attempts 만 올라, 5가 되면 attempts < 5 조건에서 영영 빠졌다.
-- dead 도 아니라 문자 대체(enqueueSms)도 안 걸리고 outbox_tick 의 "보낼 게 있나" 에도 안 잡혔다.
--   → ① 굳은 줄(queued + attempts>=5)을 failed·next_attempt_at=now() 로 한 번 풀어 준다.
--     발송기는 claim 이 준 attempts(=6) 가 5 이상이면 dead 로 적고, alimtalk 이면 문자로 대체한다 — 그 길이 다시 열린다.
--   ② 그러고도 줄에 남으면(또 죽었다) attempts>=6 에서 하드 스톱: 상태를 dead 로 박는다.
create or replace function outbox_claim(n int) returns setof outbox
language plpgsql security definer set search_path = public as $$
begin
  update outbox set status = 'failed', next_attempt_at = now(),
                    last_error = coalesce(last_error, 'stuck: claimed but never reported')
   where status = 'queued' and attempts >= 5 and coalesce(next_attempt_at, created_at) <= now();

  update outbox set status = 'dead', last_error = coalesce(last_error, 'stuck: gave up after 6 attempts')
   where status in ('queued','failed') and attempts >= 6;

  return query
  with c as (
    select o2.id from outbox o2
    where o2.status in ('queued','failed') and o2.attempts < 6 and coalesce(o2.next_attempt_at, o2.created_at) <= now()
    order by o2.created_at limit n for update skip locked)
  update outbox o set attempts = o.attempts + 1, next_attempt_at = now() + interval '5 minutes'
  from c where o.id = c.id returning o.*;
end $$;
revoke execute on function outbox_claim(int) from public, anon, authenticated;
grant execute on function outbox_claim(int) to service_role;

-- 1분 틱도 같은 조건을 봐야 굳은 줄이 발송기를 깨운다
create or replace function outbox_tick() returns void language plpgsql security definer set search_path = public as $$
declare u text; k text;
begin
  select value into u from app_settings where key = 'outbox_url';
  select value into k from app_settings where key = 'outbox_key';
  if u is null or k is null then return; end if;
  if not exists (select 1 from outbox where status in ('queued','failed') and attempts < 6 and coalesce(next_attempt_at, created_at) <= now()) then return; end if;
  perform net.http_post(url := u, headers := jsonb_build_object('Content-Type', 'application/json', 'X-Outbox-Key', k), body := '{}'::jsonb);
end $$;
revoke execute on function outbox_tick() from public, anon, authenticated;

-- ================================================================ 9. 살림 (INT-21 / INT-32)
-- 야간 일괄도 부분 납부를 뒤집고 퇴원생은 뺀다 (refresh_overdue 와 같은 조건).
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

  update invoices i set status = 'overdue'
   where i.status in ('issued','partial') and i.total > 0
     and i.due_date < (now() at time zone 'Asia/Seoul')::date
     and i.total > coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0)
     and exists (select 1 from students s where s.id = i.student_id and s.status <> 'left');
  get diagnostics c = row_count;
  what := 'invoices_overdue'; n := c; return next;
end $$;
revoke execute on function housekeeping() from public, anon, authenticated;
grant execute on function housekeeping() to service_role;
