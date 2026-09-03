-- 카톡 알림톡 줄(outbox). 알림 트리거 뒤에 붙어 학부모·학생 대상 5종만 줄에 선다.
create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table outbox add column if not exists link_view text, add column if not exists link_ref uuid, add column if not exists next_attempt_at timestamptz;
create index if not exists outbox_due on outbox (created_at) where status in ('queued','failed');

-- service role 만 읽는 설정 (정책을 만들지 않으면 anon/authenticated 는 못 본다)
create table if not exists app_settings (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table app_settings enable row level security;

-- 다시 알리기는 kind 'remind' 로 구분한다 (템플릿 NOTICE_REMIND)
create or replace function remind_notice(nid uuid) returns int language plpgsql security definer set search_path = public as $$
declare n notices; cnt int;
begin
  select * into n from notices where id = nid;
  if n.id is null or n.academy_id <> current_academy_id() or not is_staff() then raise exception 'not allowed'; end if;
  insert into notifications (academy_id, user_id, kind, title, body, link)
  select n.academy_id, a, 'remind', '「' || n.title || '」 아직 안 읽으셨어요', '원장님이 다시 알렸어요', 'notice-view:' || n.id
  from notice_audience(n, array['parent']::user_role[]) a
  where not exists (select 1 from notice_reads r where r.notice_id = n.id and r.user_id = a);
  get diagnostics cnt = row_count;
  update notices set reminded_at = now() where id = nid;
  return cnt;
end $$;

-- 출결 알림 링크에 출결 id 를 싣는다 (outbox 가 학생·상태를 읽으려고). 앱은 'child:'·'me:' 접두어만 본다.
create or replace function trg_attendance() returns trigger language plpgsql security definer set search_path = public as $$
declare sname text;
begin
  if new.status in ('late','absent') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select name into sname from students where id = new.student_id;
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, g.user_id, 'attendance',
      sname || ' 오늘 ' || case when new.status = 'late' then '지각' else '결석' end || '으로 기록됐어요', to_char(new.date, 'MM/DD'), 'child:' || new.id
    from guardians g where g.student_id = new.student_id;
    insert into notifications (academy_id, user_id, kind, title, body, link)
    select new.academy_id, s.user_id, 'attendance', '오늘 ' || case when new.status = 'late' then '지각' else '결석' end || '으로 기록됐어요', to_char(new.date, 'MM/DD'), 'me:' || new.id
    from students s where s.id = new.student_id and s.user_id is not null;
  end if;
  return new;
end $$;

-- 알림 → outbox. 대상 5종만. 나머지(원장 대상 문의 접수·결석 신청, 학생 출결)는 앱 알림으로 충분하다.
create or replace function trg_notification_outbox() returns trigger language plpgsql security definer set search_path = public as $$
declare v text; r uuid; code text; p jsonb;
begin
  v := split_part(new.link, ':', 1);
  begin r := nullif(split_part(new.link, ':', 2), '')::uuid; exception when others then r := null; end;
  if new.kind = 'notice' and v = 'notice-view' then
    code := 'NOTICE_NEW'; select jsonb_build_object('제목', title) into p from notices where id = r;
  elsif new.kind = 'remind' and v = 'notice-view' then
    code := 'NOTICE_REMIND'; select jsonb_build_object('제목', title) into p from notices where id = r;
  elsif new.kind = 'inquiry' and v = 'ask-mine' then
    code := 'INQUIRY_ANSWERED'; p := '{}'::jsonb;
  elsif new.kind = 'absence' and v = 'child' then
    code := 'MAKEUP_CONFIRMED';
    select jsonb_build_object('날짜', to_char(date, 'MM/DD'), '보강',
      case when makeup_kind = 'material' then '자료로 대체' else to_char(makeup_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || ' 보강' end)
    into p from absence_requests where id = r;
  elsif new.kind = 'attendance' and v = 'child' then
    code := 'ATTENDANCE';
    select jsonb_build_object('학생', s.name, '상태', case when a.status = 'late' then '지각' else '결석' end)
    into p from attendance a join students s on s.id = a.student_id where a.id = r;
  else
    return new;
  end if;
  insert into outbox (academy_id, to_user_id, channel, template_code, params, link_view, link_ref, idempotency_key)
  values (new.academy_id, new.user_id, 'alimtalk', code, coalesce(p, '{}'::jsonb), v, r, 'n:' || new.id)
  on conflict (idempotency_key) do nothing;
  return new;
end $$;
drop trigger if exists notifications_outbox on notifications;
create trigger notifications_outbox after insert on notifications for each row execute function trg_notification_outbox();

-- 발송기가 줄을 잡는다. 잡힌 행은 5분 뒤에야 다시 잡힌다 (동시 실행·재시도 모두 이 한 규칙).
create or replace function outbox_claim(n int) returns setof outbox language sql security definer set search_path = public as $$
  with c as (
    select id from outbox
    where status in ('queued','failed') and attempts < 5 and coalesce(next_attempt_at, created_at) <= now()
    order by created_at limit n for update skip locked)
  update outbox o set attempts = o.attempts + 1, next_attempt_at = now() + interval '5 minutes'
  from c where o.id = c.id returning o.* $$;
revoke execute on function outbox_claim(int) from public, anon, authenticated;
grant execute on function outbox_claim(int) to service_role;

-- 1분 틱: 보낼 게 있을 때만 발송 함수를 깨운다. URL·키는 app_settings (tools/setup-outbox.mjs 가 넣는다).
create or replace function outbox_tick() returns void language plpgsql security definer set search_path = public as $$
declare u text; k text;
begin
  select value into u from app_settings where key = 'outbox_url';
  select value into k from app_settings where key = 'outbox_key';
  if u is null or k is null then return; end if;
  if not exists (select 1 from outbox where status in ('queued','failed') and attempts < 5 and coalesce(next_attempt_at, created_at) <= now()) then return; end if;
  perform net.http_post(url := u, headers := jsonb_build_object('Content-Type', 'application/json', 'X-Outbox-Key', k), body := '{}'::jsonb);
end $$;
revoke execute on function outbox_tick() from public, anon, authenticated;
select cron.unschedule('outbox-tick') where exists (select 1 from cron.job where jobname = 'outbox-tick');
select cron.schedule('outbox-tick', '* * * * *', 'select outbox_tick()');
