-- 수강료 (3단계 구현, 스키마는 2단계에 미리). 자금 비보관: 돈은 PG가 학원 계좌로 직접 정산.
create type fee_period     as enum ('monthly','per_session');
create type invoice_status as enum ('issued','paid','partial','overdue','void');
create type pay_method     as enum ('transfer','card','cash','pg');

create table billing_rules (
  academy_id uuid primary key references academies(id),
  billing_day int not null default 1 check (billing_day between 1 and 28),
  due_day int not null default 5 check (due_day between 1 and 28),
  sibling_discount_pct int not null default 0 check (sibling_discount_pct between 0 and 100),
  prorate boolean not null default true,
  textbook_separate boolean not null default true,
  refund_policy text,
  updated_at timestamptz not null default now());

create table fee_plans (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  class_id uuid references classes(id) on delete set null,     -- null = 학원 공통
  name text not null, amount int not null check (amount >= 0),
  period fee_period not null default 'monthly',
  active boolean not null default true,
  created_at timestamptz not null default now());

create table invoices (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  student_id uuid not null references students(id),
  period_ym text not null check (period_ym ~ '^[0-9]{4}-[0-9]{2}$'),
  amount int not null default 0, discount int not null default 0, textbook int not null default 0,
  total int not null default 0,
  due_date date not null,
  status invoice_status not null default 'issued',
  issued_at timestamptz not null default now(), paid_at timestamptz, reminded_at timestamptz,
  memo text,
  unique (student_id, period_ym));

create table payments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount int not null check (amount > 0),
  method pay_method not null,
  paid_at timestamptz not null default now(),
  pg_provider text, pg_tx_id text unique, receipt_no text,
  recorded_by uuid references users(id),
  created_at timestamptz not null default now());

create index on invoices (academy_id, period_ym); create index on invoices (student_id);
create index on payments (invoice_id);

alter table billing_rules enable row level security;
alter table fee_plans     enable row level security;
alter table invoices      enable row level security;
alter table payments      enable row level security;

create policy billing_rules_staff on billing_rules for all using (is_staff() and academy_id = current_academy_id()) with check (current_role_() = 'director' and academy_id = current_academy_id());
create policy fee_plans_staff     on fee_plans     for all using (is_staff() and academy_id = current_academy_id()) with check (current_role_() = 'director' and academy_id = current_academy_id());
create policy invoices_read  on invoices for select using (academy_id = current_academy_id() and (is_staff() or student_id in (select my_student_ids())));
create policy invoices_write on invoices for all using (current_role_() = 'director' and academy_id = current_academy_id()) with check (current_role_() = 'director' and academy_id = current_academy_id());
create policy payments_read  on payments for select using (academy_id = current_academy_id() and (is_staff() or invoice_id in (select id from invoices where student_id in (select my_student_ids()))));
create policy payments_write on payments for all using (current_role_() = 'director' and academy_id = current_academy_id()) with check (current_role_() = 'director' and academy_id = current_academy_id());
