-- 살림: 오래된 임시 데이터를 지운다 (OTP·만료 토큰·읽은 지 오래된 알림·처리 끝난 outbox·오래된 클라 오류).
create table client_errors (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid references academies(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  at timestamptz not null default now(),
  version text, screen text, env text,
  message text not null, stack text, ua text);
alter table client_errors enable row level security;
create index client_errors_at_idx on client_errors (at);

-- 본인 것만 기록 가능. select 정책 없음: service role 만 읽는다.
create policy client_errors_ins on client_errors for insert to authenticated with check (user_id = auth.uid());

-- outbox.link_token_id 는 on delete 지정이 없어 만료 토큰 삭제가 막힌다. set null 로 바꾼다.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'outbox'::regclass and contype = 'f' and pg_get_constraintdef(oid) like '%link_tokens%';
  if c is not null then
    execute format('alter table outbox drop constraint %I', c);
  end if;
  alter table outbox add constraint outbox_link_token_id_fkey foreign key (link_token_id) references link_tokens(id) on delete set null;
end $$;

create or replace function housekeeping() returns table (what text, n int) language plpgsql security definer set search_path = public as $$
declare c int;
begin
  delete from otp_codes where created_at < now() - interval '1 day'; get diagnostics c = row_count;
  what := 'otp_codes'; n := c; return next;

  delete from link_tokens where expires_at < now() - interval '7 days'; get diagnostics c = row_count;
  what := 'link_tokens'; n := c; return next;

  delete from notifications where read_at is not null and created_at < now() - interval '90 days'; get diagnostics c = row_count;
  what := 'notifications'; n := c; return next;

  delete from outbox where status in ('sent','delivered') and created_at < now() - interval '90 days'; get diagnostics c = row_count;
  what := 'outbox'; n := c; return next;

  delete from client_errors where at < now() - interval '30 days'; get diagnostics c = row_count;
  what := 'client_errors'; n := c; return next;
end $$;
revoke execute on function housekeeping() from public, anon, authenticated;
grant execute on function housekeeping() to service_role;

select cron.unschedule('housekeeping-daily') where exists (select 1 from cron.job where jobname = 'housekeeping-daily');
select cron.schedule('housekeeping-daily', '0 19 * * *', 'select housekeeping()');
