-- 영어의 집 2단계 스키마. 모든 업무 테이블에 academy_id. 날짜는 Asia/Seoul 기준 date.
create extension if not exists pgcrypto;

create type user_role      as enum ('director','teacher','parent','student');
create type student_status as enum ('active','left');
create type att_status     as enum ('present','late','absent','makeup');
create type absence_status as enum ('requested','confirmed','declined');
create type makeup_kind    as enum ('saturday','material');
create type todo_kind      as enum ('homework','exam');
create type note_kind      as enum ('consult','memo');
create type cal_kind       as enum ('closed','makeup','special');
create type outbox_channel as enum ('alimtalk','sms');
create type outbox_status  as enum ('queued','sent','delivered','failed','dead');

create function kst_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;
create function normalize_phone(p text) returns text language sql immutable as $$ select regexp_replace(coalesce(p,''), '[^0-9]', '', 'g') $$;

create table academies (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null unique,
  brand_color text not null default '#2B5BD9', logo_path text,
  created_at timestamptz not null default now());

-- 사람 하나 = auth 사용자 하나. 역할·학원은 memberships.
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null, phone text not null unique,   -- normalize_phone 결과
  active_membership_id uuid,                        -- 지금 보고 있는 학원·역할 (FK는 아래에서)
  created_at timestamptz not null default now());

create table classes (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  name text not null, schedule jsonb not null default '[]'::jsonb,   -- [{"dow":2,"start":"20:00","end":"22:00"}]
  teacher_id uuid references users(id),
  created_at timestamptz not null default now());

create table students (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  name text not null, user_id uuid references users(id),
  status student_status not null default 'active', left_at timestamptz,
  created_at timestamptz not null default now());

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  academy_id uuid not null references academies(id),
  role user_role not null,
  student_id uuid references students(id) on delete cascade,   -- parent: 자녀, student: 본인
  created_at timestamptz not null default now(),
  unique (user_id, academy_id, role, student_id));
alter table users add constraint users_active_membership_fk foreign key (active_membership_id) references memberships(id) on delete set null;

create table enrollments (
  student_id uuid references students(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  primary key (student_id, class_id));

create table guardians (
  student_id uuid references students(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  relation text not null default '보호자',
  primary key (student_id, user_id));

-- 가입 전 대조용 명단. 원장이 관리. 클라이언트 접근 없음.
create table roster_phones (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  phone text not null, role user_role not null, name text not null,
  student_id uuid references students(id) on delete cascade,
  unique (academy_id, phone, role, student_id));

create table attendance (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  student_id uuid not null references students(id), class_id uuid not null references classes(id),
  date date not null, status att_status not null, note text,
  marked_by uuid references users(id), created_at timestamptz not null default now(),
  unique (student_id, class_id, date));

create table absence_requests (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  student_id uuid not null references students(id), requested_by uuid not null references users(id),
  date date not null, reason text not null,
  status absence_status not null default 'requested',
  makeup_kind makeup_kind, makeup_at timestamptz, decided_by uuid references users(id),
  attended_at timestamptz, created_at timestamptz not null default now());

create table notices (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  author_id uuid not null references users(id),
  title text not null, body text not null default '',
  target_class_id uuid references classes(id),     -- null = 전체
  reminded_at timestamptz, created_at timestamptz not null default now());

create table notice_reads (
  notice_id uuid references notices(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notice_id, user_id));

create table inquiries (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  student_id uuid references students(id), asked_by uuid not null references users(id),
  topic text not null, body text not null,
  answer text, answered_by uuid references users(id), answered_at timestamptz,
  created_at timestamptz not null default now());

create table faqs (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  q text not null, a text not null, sort int not null default 0);

create table todos (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  class_id uuid not null references classes(id),
  kind todo_kind not null, title text not null, due_date date not null,
  notice_id uuid references notices(id) on delete set null,
  created_at timestamptz not null default now());

create table todo_done (
  todo_id uuid references todos(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (todo_id, student_id));

create table notes (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  student_id uuid not null references students(id), author_id uuid not null references users(id),
  kind note_kind not null default 'memo', body text not null,
  created_at timestamptz not null default now());

create table calendar (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  date date not null, kind cal_kind not null, note text,
  class_id uuid references classes(id),
  unique (academy_id, date, kind, class_id));

create table notifications (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null, title text not null, body text not null default '', link text,
  read_at timestamptz, created_at timestamptz not null default now());

create table link_tokens (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  user_id uuid not null references users(id) on delete cascade,
  view text not null, ref_id uuid,
  token_hash text not null unique, expires_at timestamptz not null, used_at timestamptz,
  created_at timestamptz not null default now());

create table outbox (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id),
  to_user_id uuid not null references users(id),
  channel outbox_channel not null default 'alimtalk',
  template_code text not null, params jsonb not null default '{}'::jsonb,
  link_token_id uuid references link_tokens(id),
  status outbox_status not null default 'queued', attempts int not null default 0,
  idempotency_key text not null unique, provider_msg_id text, last_error text,
  created_at timestamptz not null default now(), sent_at timestamptz);

create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null, code_hash text not null,
  expires_at timestamptz not null, attempts int not null default 0, used_at timestamptz,
  created_at timestamptz not null default now());
create index otp_codes_phone_idx on otp_codes (phone, created_at desc);

create table audit_log (
  id bigserial primary key,
  academy_id uuid not null references academies(id),
  actor_id uuid references users(id), action text not null, target text, at timestamptz not null default now());

create index on classes (academy_id);            create index on students (academy_id);
create index on memberships (user_id);           create index on memberships (academy_id);
create index on roster_phones (phone);           create index on attendance (academy_id, date);
create index on absence_requests (academy_id, status); create index on notices (academy_id, created_at desc);
create index on inquiries (academy_id, answered_at); create index on todos (class_id, due_date);
create index on notifications (user_id, read_at); create index on outbox (status, created_at);

-- 검사 스크립트용
create function list_public_tables() returns table(table_name text) language sql stable security definer as $$
  select table_name::text from information_schema.tables where table_schema='public' order by 1 $$;
