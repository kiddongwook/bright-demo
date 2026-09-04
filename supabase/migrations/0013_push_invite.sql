-- 10주차: 웹 푸시 알림 + 개인 초대 링크.
-- 푸시는 지금의 notifications → outbox 파이프라인에 채널 'push' 를 하나 더 얹는 것뿐이다.
--   구독이 있는 사람 → 푸시(건당 비용 없음). 없는 사람 → 지금처럼 카톡. 둘 다 받고 싶으면 prefs.kakao_also = true.
-- 초대는 새 표 invite_tokens + Edge invite-login. link_tokens(알림톡 버튼, 이미 사용자인 사람의 제한 세션)와는 별개다:
--   초대 토큰은 "아직 users 행이 없는 사람" 을 명부를 근거로 만들어 정식 세션을 준다.

-- 0. 채널 하나 추가. 이 마이그레이션 안에서 이 값을 실제로 넣지는 않는다(같은 트랜잭션에서 새 enum 값을 쓰면 막힌다).
--    아래 트리거 본문의 'push' 는 실행 시점에 평가되므로 정의만으로는 문제가 없다.
alter type outbox_channel add value if not exists 'push';

-- ---------------------------------------------------------------- 1. 푸시 구독
-- 기기 하나 = 행 하나. endpoint 가 곧 그 기기의 주소라 unique.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failed_at timestamptz);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
-- 본인 행만. update 는 계약에 없지만 클라이언트가 같은 endpoint 로 다시 구독할 때(upsert) 필요하다.
drop policy if exists push_subs_sel on push_subscriptions;
drop policy if exists push_subs_ins on push_subscriptions;
drop policy if exists push_subs_upd on push_subscriptions;
drop policy if exists push_subs_del on push_subscriptions;
create policy push_subs_sel on push_subscriptions for select using (user_id = auth.uid());
create policy push_subs_ins on push_subscriptions for insert with check (user_id = auth.uid());
create policy push_subs_upd on push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subs_del on push_subscriptions for delete using (user_id = auth.uid());
grant select, insert, update, delete on push_subscriptions to authenticated;

-- ---------------------------------------------------------------- 2. 개인 초대 토큰
-- 원문 32 hex 는 링크에만, DB 에는 해시만. 정책 없음 → 서비스 키와 security definer 함수만 만진다.
create table if not exists invite_tokens (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  phone text not null,
  role text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now());
create index if not exists invite_tokens_academy_phone_idx on invite_tokens (academy_id, phone);
alter table invite_tokens enable row level security;

-- 원장이 명부의 한 번호에게 줄 1회용 링크를 만든다. 돌려주는 원문 토큰은 이 한 번만 볼 수 있다.
-- 같은 번호의 아직 안 쓴 토큰은 여기서 만료시킨다 — 링크는 늘 마지막 것 하나만 산다.
create or replace function create_invite(p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id(); ph text := normalize_phone(p_phone); r text; tok text;
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if ph = '' then raise exception 'phone required'; end if;
  select rp.role::text into r from roster_phones rp
   where rp.academy_id = a and rp.phone = ph
   order by case rp.role when 'director' then 0 when 'teacher' then 1 when 'parent' then 2 else 3 end
   limit 1;
  if r is null then raise exception 'not in roster'; end if;
  update invite_tokens set expires_at = now()
   where academy_id = a and phone = ph and used_at is null and expires_at > now();
  tok := replace(gen_random_uuid()::text, '-', '');   -- 32 hex. pgcrypto 를 search_path 로 끌어오지 않는다.
  insert into invite_tokens (academy_id, phone, role, token_hash, expires_at, created_by)
  values (a, ph, r, encode(sha256(convert_to(tok, 'utf8')), 'hex'), now() + interval '7 days', auth.uid());
  return tok;
end $$;
revoke execute on function create_invite(text) from public, anon;
grant execute on function create_invite(text) to authenticated;

-- ---------------------------------------------------------------- 3. 알림 → 줄 (푸시 + 카톡)
-- 0010 본문에 두 가지를 얹는다.
--  (a) 모든 알림에 대해, 받는 사람에게 푸시 구독이 하나라도 있으면 channel 'push' 행을 넣는다.
--      카톡에 안 가는 종류(원장 대상 문의 접수·결석 신청, 학생 본인 출결)도 푸시로는 간다.
--  (b) 카톡 행은 지금 규칙 그대로이되, 푸시 구독이 있고 prefs.kakao_also 가 true 가 아니면 넣지 않는다(푸시가 대신한다).
-- 푸시 전용 코드(INQUIRY_NEW·ABSENCE_REQUESTED·ATTENDANCE_SELF·NOTIFY)는 심사받은 알림톡 템플릿이 아니므로
-- _shared/alimtalk.ts TEMPLATES 에 넣지 않는다. 문구는 params['알림'](= notifications.title)에서 온다.
create or replace function trg_notification_outbox() returns trigger language plpgsql security definer set search_path = public as $$
declare v text; r uuid; code text; p jsonb; k text; pr jsonb; has_push boolean;
begin
  v := split_part(new.link, ':', 1);
  begin r := nullif(split_part(new.link, ':', 2), '')::uuid; exception when others then r := null; end;
  if new.kind = 'notice' and v = 'notice-view' then
    code := 'NOTICE_NEW'; k := 'kakao_notice'; select jsonb_build_object('제목', title) into p from notices where id = r;
  elsif new.kind = 'remind' and v = 'notice-view' then
    code := 'NOTICE_REMIND'; k := 'kakao_remind'; select jsonb_build_object('제목', title) into p from notices where id = r;
  elsif new.kind = 'inquiry' and v = 'ask-mine' then
    code := 'INQUIRY_ANSWERED'; k := 'kakao_answer'; p := '{}'::jsonb;
  elsif new.kind = 'absence' and v = 'child' then
    code := 'MAKEUP_CONFIRMED'; k := 'kakao_makeup';
    select jsonb_build_object('날짜', to_char(date, 'MM/DD'), '보강',
      case when makeup_kind = 'material' then '자료로 대체' else to_char(makeup_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || ' 보강' end)
    into p from absence_requests where id = r;
  elsif new.kind = 'attendance' and v = 'child' then
    code := 'ATTENDANCE'; k := 'kakao_attendance';
    select jsonb_build_object('학생', s.name, '상태', case when a.status = 'late' then '지각' else '결석' end)
    into p from attendance a join students s on s.id = a.student_id where a.id = r;
  -- 여기부터는 카톡에 안 가는 종류(k is null): 푸시로만 간다
  elsif new.kind = 'inquiry' and v = 'inbox' then code := 'INQUIRY_NEW'; p := '{}'::jsonb;
  elsif new.kind = 'absence' and v = 'today' then code := 'ABSENCE_REQUESTED'; p := '{}'::jsonb;
  elsif new.kind = 'attendance' and v = 'me' then code := 'ATTENDANCE_SELF'; p := '{}'::jsonb;
  else
    code := 'NOTIFY'; p := '{}'::jsonb;   -- 앞으로 늘어날 종류도 푸시는 받는다
  end if;
  -- 문구의 [학원] 은 DB 이름에서만 온다
  p := coalesce(p, '{}'::jsonb) || jsonb_build_object('학원', (select name from academies where id = new.academy_id));
  select prefs into pr from users where id = new.user_id;
  has_push := exists (select 1 from push_subscriptions where user_id = new.user_id);

  if has_push then
    insert into outbox (academy_id, to_user_id, channel, template_code, params, link_view, link_ref, idempotency_key)
    values (new.academy_id, new.user_id, 'push', code, p || jsonb_build_object('알림', new.title), v, r, 'push:' || new.id)
    on conflict (idempotency_key) do nothing;
  end if;

  if k is null then return new; end if;
  -- 받는 사람이 그 카톡을 껐으면 앱 알림·종 배지는 그대로 두고 줄에만 세우지 않는다
  if coalesce((pr->>k)::boolean, true) = false then return new; end if;
  -- 푸시로 갔으면 카톡은 생략한다 ('카톡도 같이 받기' 를 켠 사람만 둘 다)
  if has_push and coalesce((pr->>'kakao_also')::boolean, false) is not true then return new; end if;
  insert into outbox (academy_id, to_user_id, channel, template_code, params, link_view, link_ref, idempotency_key)
  values (new.academy_id, new.user_id, 'alimtalk', code, p, v, r, 'n:' || new.id)
  on conflict (idempotency_key) do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------- 4. 살림
-- 만료된 초대 토큰도 링크 토큰과 같이 치운다.
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
end $$;
revoke execute on function housekeeping() from public, anon, authenticated;
grant execute on function housekeeping() to service_role;
