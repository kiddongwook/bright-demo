-- 0029_weekly_summary.sql — 학부모 주간 요약 (T6)
-- 매주 정해진 요일·시(기본 금 18:00 KST)에 학원마다 한 번, 학부모에게 "이번 주 출결·숙제·다음 수업" 을 앱 알림으로,
-- 원장에게 "출석률·미납" 한 줄을 보낸다. 푸시로만 간다(알림톡 없음 = 비용 0).
--
--  - academies.weekly_summary / weekly_dow / weekly_hour — 학원 단위 설정. 원장은 academies_write 로 고친다.
--    weekly_dow 는 Postgres extract(dow) 와 같은 번호(0=일 … 5=금 … 6=토).
--  - users.prefs->'weekly' 가 false 인 학부모는 건너뛴다(기본 켬). 화면은 Prefs.tsx '주간 요약'.
--  - weekly_summary_for(학원, 월요일) — 실제 셈. authenticated 에서 revoke(크론·service role 만).
--  - weekly_summary_tick() — 매시 정각 크론. KST 요일·시가 맞고 이번 주에 아직 안 보낸 학원만.
--  - 0022 의 trg_notification_outbox 에 kind 'weekly' → 코드 WEEKLY, k null(푸시만) 가지를 얹는다.

-- ================================================================ 1. 학원 설정
alter table academies
  add column if not exists weekly_summary boolean not null default true,
  add column if not exists weekly_dow int not null default 5,
  add column if not exists weekly_hour int not null default 18,
  add column if not exists weekly_last_at timestamptz;
alter table academies drop constraint if exists academies_weekly_dow_ck;
alter table academies add constraint academies_weekly_dow_ck check (weekly_dow between 0 and 6);
alter table academies drop constraint if exists academies_weekly_hour_ck;
alter table academies add constraint academies_weekly_hour_ck check (weekly_hour between 6 and 22);

-- ================================================================ 2. 한 학원의 한 주 요약
-- p_week_start 는 월요일(KST 날짜). 주 = [월, 일].
-- 학부모 한 줄: '출석 3 · 지각 1 · 결석 0 · 숙제 2/3 · 다음 수업 월 19:00' (120자 안)
--   출결은 그 주의 attendance 행을 상태별로 센다(makeup 은 세지 않는다 — 보강은 정규 출결이 아니다).
--   숙제는 그 학생이 등록된 반의 kind='homework' 인 todos 중 마감이 이번 주인 것 / 그중 todo_done 이 있는 것.
--   다음 수업은 오늘(KST)부터 14일 안에서 등록된 반들의 시간표(classes.schedule) 가운데 가장 이른 것.
--   오늘 것은 시작 시각이 아직 안 지났을 때만. 휴원(calendar closed — 전체 또는 그 반)인 날은 건너뛰고 그다음 수업을 본다
--   (앱의 nextClassDays · closedFor 와 같은 규칙). 14일 안에 수업이 없으면 '다음 수업 없음'.
-- 원장 한 줄: '이번 주 요약 · 출석률 92% · 미납 2건' (출석률 = (출석+지각)/(출석+지각+결석), 행이 없으면 생략).
-- 같은 주에 두 번 부르면 이미 있는 사람은 건너뛴다(user_id·kind·title·created_at ≥ 월요일 — 자녀 둘인 학부모는 title 에 이름이 있어 따로 받는다).
create or replace function weekly_summary_for(p_academy uuid, p_week_start date)
returns int language plpgsql security definer set search_path = public as $$
declare
  week_end date := p_week_start + 6;
  week_from timestamptz := (p_week_start::timestamp) at time zone 'Asia/Seoul';
  now_k timestamp := now() at time zone 'Asia/Seoul';
  today_k date := now_k::date;
  m record; nx record;
  c_present int; c_late int; c_absent int; hw_total int; hw_done int;
  next_txt text; v_title text; v_body text; cnt int := 0;
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
    if exists (select 1 from notifications n
                where n.user_id = m.user_id and n.academy_id = p_academy and n.kind = 'weekly'
                  and n.title = v_title and n.created_at >= week_from) then
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
    values (p_academy, m.user_id, 'weekly', v_title, left(v_body, 120), 'child:');
    cnt := cnt + 1;
  end loop;

  -- ---- 원장 (학원 전체 출석률 · 미납 건수)
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

-- ================================================================ 3. 매시 크론
-- KST 로 요일·시가 맞는 학원 가운데 이번 주(월요일 0시 KST 이후)에 아직 안 보낸 곳만. 학원 하나가 실패해도 나머지는 간다.
create or replace function weekly_summary_tick() returns int language plpgsql security definer set search_path = public as $$
declare
  ts timestamp := now() at time zone 'Asia/Seoul';
  week_start_ts timestamptz := (date_trunc('week', ts)) at time zone 'Asia/Seoul';
  monday date := date_trunc('week', ts)::date;
  a record; total int := 0; n int;
begin
  for a in
    select id from academies
     where weekly_summary
       and weekly_dow = extract(dow from ts)::int
       and weekly_hour = extract(hour from ts)::int
       and (weekly_last_at is null or weekly_last_at < week_start_ts)
  loop
    begin
      n := weekly_summary_for(a.id, monday);
      update academies set weekly_last_at = now() where id = a.id;
      total := total + coalesce(n, 0);
    exception when others then
      raise warning 'weekly_summary_tick: academy % failed: %', a.id, sqlerrm;
    end;
  end loop;
  return total;
end $$;
revoke execute on function weekly_summary_tick() from public, anon, authenticated;
grant execute on function weekly_summary_tick() to service_role;

select cron.unschedule('weekly-summary') where exists (select 1 from cron.job where jobname = 'weekly-summary');
select cron.schedule('weekly-summary', '0 * * * *', 'select weekly_summary_tick()');

-- ================================================================ 4. 알림 → outbox 트리거: weekly 는 푸시로만
-- 0022_lows.sql 의 본문을 그대로 가져오고 `weekly` 가지 하나만 얹었다(코드 WEEKLY, k null → 알림톡 줄 없음).
-- 푸시 문구는 params['알림'](제목) 과 params['요약'](본문) — supabase/functions/_shared/push.ts 가 WEEKLY 를 따로 그린다.
create or replace function trg_notification_outbox() returns trigger language plpgsql security definer set search_path = public as $$
declare v text; r uuid; code text; p jsonb; k text; pr jsonb; has_push boolean; why text; push_p jsonb;
begin
  v := split_part(new.link, ':', 1);
  begin r := nullif(split_part(new.link, ':', 2), '')::uuid; exception when others then r := null; end;
  if new.kind = 'weekly' then
    code := 'WEEKLY'; k := null; p := jsonb_build_object('요약', left(new.body, 120));
  elsif new.kind = 'notice' and v = 'notice-view' then
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
    select jsonb_build_object('학생', s.name, '상태', case when a.status = 'late' then '지각' else '결석' end), nullif(btrim(a.note), '')
      into p, why
      from attendance a join students s on s.id = a.student_id where a.id = r;
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
    -- 푸시 줄에만 사유를 싣는다 (카톡 줄의 params 는 아래에서 p 그대로 쓴다)
    push_p := p || jsonb_build_object('알림', new.title);
    if why is not null then push_p := push_p || jsonb_build_object('사유', why); end if;
    if not exists (select 1 from outbox o
                    where o.to_user_id = new.user_id and o.channel = 'push'
                      and o.template_code = code and o.params = push_p
                      and o.link_view is not distinct from v and o.link_ref is not distinct from r
                      and o.created_at > now() - interval '10 minutes') then
      insert into outbox (academy_id, to_user_id, channel, template_code, params, link_view, link_ref, idempotency_key)
      values (new.academy_id, new.user_id, 'push', code, push_p, v, r, 'push:' || new.id)
      on conflict (idempotency_key) do nothing;
    end if;
  end if;

  if k is null then return new; end if;
  -- 받는 사람이 그 카톡을 껐으면 앱 알림·종 배지는 그대로 두고 줄에만 세우지 않는다
  if coalesce((pr->>k)::boolean, true) = false then return new; end if;
  -- 푸시로 갔으면 카톡은 생략한다 ('카톡도 같이 받기' 를 켠 사람만 둘 다)
  if has_push and coalesce((pr->>'kakao_also')::boolean, false) is not true then return new; end if;
  if exists (select 1 from outbox o
              where o.to_user_id = new.user_id and o.channel = 'alimtalk'
                and o.template_code = code and o.params = p
                and o.link_view is not distinct from v and o.link_ref is not distinct from r
                and o.created_at > now() - interval '10 minutes') then return new; end if;
  insert into outbox (academy_id, to_user_id, channel, template_code, params, link_view, link_ref, idempotency_key)
  values (new.academy_id, new.user_id, 'alimtalk', code, p, v, r, 'n:' || new.id)
  on conflict (idempotency_key) do nothing;
  return new;
end $$;
