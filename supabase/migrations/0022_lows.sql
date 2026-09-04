-- 0022_lows.sql — 적대적 점검의 "낮음" 을 닫는다.
-- INT-06  하루짜리 휴원일도 원자적으로 (찾고→넣기 대신 RPC 하나)
-- INT-11  10분 안에 내용이 똑같은 줄은 두 번 세우지 않는다
-- INT-26  명부에서 빠진 사람의 묵은 알림은 남은 JWT 로도 안 읽힌다
-- INT-35/36  같은 날 전체 휴원과 반 휴원이 나란히 서지 않는다 (전체가 이긴다)
-- INP-36  010 은 11자리뿐 — 표에서도 막는다
--
-- 앞 판(0018)의 본문을 가져다 쓰는 자리는 그렇게 적어 두었다. 그 판을 지우지 않고 create or replace 로 덮는다.

-- ================================================================ 1. 알림 읽기 범위 (INT-26)
-- notifications 의 select 정책이 `user_id = auth.uid()` 뿐이라, 명부에서 빠져 소속이 사라진 사람도
-- 아직 안 만료된 토큰으로 자기 옛 알림을 계속 읽을 수 있었다. 앱은 소속이 없으면 곧장 로그아웃시키지만
-- (session.tsx), API 를 직접 부르는 길이 열려 있었다. 그 학원에 소속이 하나라도 있어야 읽게 한다.
--
-- 왜 함수인가: 정책 안에서 memberships 를 바로 읽으면 그 표의 RLS(자기 소속만 보임)를 한 번 더 타고,
-- 앞으로 memberships 정책이 바뀌면 여기까지 흔들린다. 다른 자리(is_staff·current_academy_id)와 같은 꼴로 맞춘다.
-- '보고 있는 학원' 이 아니라 '아무 소속' 이다 — 학원 둘에 자녀가 있는 학부모는 양쪽 종을 다 봐야 한다.
create or replace function member_of(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.user_id = auth.uid() and m.academy_id = a) $$;
revoke execute on function member_of(uuid) from public, anon;
grant execute on function member_of(uuid) to authenticated;

drop policy if exists notifications_own on notifications;
create policy notifications_own on notifications for select
  using (user_id = auth.uid() and member_of(academy_id));
-- notifications_upd(읽음 표시)는 그대로 둔다 — 못 읽는 줄을 읽음으로 바꿔 봐야 아무 데도 안 보인다.

-- ================================================================ 2. 휴원일 (INT-06, INT-35/36)
-- 우선순위 규칙 — 여기서 한 번만 정하고 나머지는 이 규칙을 믿는다.
--  (a) 전체(class_id is null) 휴원은 모든 반을 덮는다. app/src/lib/api.ts 의 closedFor() 가
--      `전체 ∪ 그 반` 으로 읽는 것과 같은 뜻이다.
--  (b) 그래서 같은 날 전체 휴원과 반 휴원이 함께 서면 반 쪽은 군더더기다:
--      전체를 넣을 때 그 날의 반 휴원을 지우고, 반 휴원을 넣으려 할 때 전체가 있으면 넣지 않는다.
--      (전에는 둘이 나란히 남아 원장 목록에 같은 날이 두 줄로 보이고, 하나만 지워도 여전히 쉬었다 — INT-35)
--  (c) 같은 날의 closed 와 special(특강)은 서로 지우지 않는다. 판단은 closed 가 이긴다 —
--      쉬는 날에 특강을 따로 적어 두는 것은 실제로 있는 일이고(휴원 중 보충 특강), 학부모 화면의
--      '다음 수업' 은 정규 수업 이야기라 그날은 빠지는 게 맞다. closedFor() 가 closed 만 보는 것이 그 규칙이다(INT-36).

-- ---------------------------------------------------------------- INT-06 하루짜리도 원자적으로
-- 클라이언트가 "먼저 찾고 없으면 넣기" 를 하던 자리. 동시 두 번이면 한쪽이 23505 원문 오류를 봤다.
-- 이미 있는 날이면 메모를 고치는 지금 동작은 그대로 둔다(원장이 같은 날을 다시 저장하는 것은 메모 고치기다).
create or replace function upsert_calendar_day(p_date date, p_kind cal_kind, p_note text, p_class uuid)
returns int language plpgsql security definer set search_path = public as $$
declare a uuid := current_academy_id();
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  if p_class is not null and not exists (select 1 from classes where id = p_class and academy_id = a) then
    raise exception 'bad class';
  end if;
  if p_date is null then return 0; end if;

  if p_kind = 'closed' then
    if p_class is null then
      -- 전체가 덮으므로 그 날의 반 휴원은 군더더기 — 치운다
      delete from calendar where academy_id = a and date = p_date and kind = 'closed' and class_id is not null;
    elsif exists (select 1 from calendar where academy_id = a and date = p_date and kind = 'closed' and class_id is null) then
      raise exception 'closed_by_all: 이미 전체 휴원일이에요';
    end if;
  end if;

  insert into calendar (academy_id, date, kind, note, class_id)
  values (a, p_date, p_kind, nullif(btrim(coalesce(p_note, '')), ''), p_class)
  on conflict (academy_id, date, kind, class_id) do update set note = excluded.note;
  return 1;
end $$;
revoke execute on function upsert_calendar_day(date, cal_kind, text, uuid) from public, anon;
grant execute on function upsert_calendar_day(date, cal_kind, text, uuid) to authenticated;

-- ---------------------------------------------------------------- INT-35 여러 날에도 같은 규칙
-- 0018 본문을 그대로 가져오고 우선순위 두 줄만 얹는다. 전체에 덮인 날은 '건너뛴 날' 로 세어져
-- 화면의 "(이미 있던 N일은 건너뜀)" 문구에 그대로 실린다.
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

  if p_kind = 'closed' and p_class is null then
    delete from calendar
     where academy_id = a and kind = 'closed' and class_id is not null and date = any(p_dates);
  end if;

  insert into calendar (academy_id, date, kind, note, class_id)
  select a, d, p_kind, nullif(btrim(coalesce(p_note, '')), ''), p_class
    from unnest(p_dates) d
   where not (p_kind = 'closed' and p_class is not null
              and exists (select 1 from calendar c
                           where c.academy_id = a and c.date = d and c.kind = 'closed' and c.class_id is null))
  on conflict (academy_id, date, kind, class_id) do nothing;
  get diagnostics cnt = row_count;
  return cnt;
end $$;
revoke execute on function add_calendar_many(date[], cal_kind, text, uuid) from public, anon;
grant execute on function add_calendar_many(date[], cal_kind, text, uuid) to authenticated;

-- ================================================================ 3. 같은 내용 알림 묶기 (INT-11)
-- outbox 의 멱등키는 notifications.id 라 트리거 재발화만 막았다. 내용이 똑같은 알림이 두 줄이면
-- (출결을 되돌렸다 다시 넣기, 같은 공지를 두 번 알리기) 카톡·푸시도 두 번 나갔다.
--
-- 왜 not exists 인가: '최근 10분' 은 now() 를 봐야 하는데 부분 unique 인덱스의 where 절에는
-- now() 같은 변하는 함수를 못 쓴다. 해시 칸을 하나 두어도 시간 창은 결국 트리거가 봐야 한다 —
-- 그러면 칸을 늘릴 이유가 없다. 0018 이 trg_attendance 에 넣은 것과 같은 꼴로 맞춘다.
--
-- 같은 줄인지 보는 열쇠: (받는 사람, 채널, 템플릿, params, 링크). params 만으로는 부족하다 —
-- NOTICE_NEW 의 params 는 {제목, 학원} 뿐이라, 제목이 같은 다른 공지 둘을 10분 안에 올리면
-- 두 번째 공지의 카톡이 소리 없이 사라진다. link_ref(공지 id)까지 봐야 그 일이 안 난다.
--
-- 남는 틈: 두 알림이 정말 동시에 들어오면 양쪽 not exists 가 다 통과할 수 있다(읽고-쓰기).
-- INT-09 를 고친 자리와 같은 종류의 틈이고, 여기서 막으려는 것은 '사람이 두 번 누르는' 초 단위가 아니라
-- '되돌렸다 다시 넣는' 분 단위라 그대로 받아들인다.
--
-- 본문은 0016_attendance_reason_param.sql 것을 그대로 가져오고 not exists 두 곳만 얹었다.
create or replace function trg_notification_outbox() returns trigger language plpgsql security definer set search_path = public as $$
declare v text; r uuid; code text; p jsonb; k text; pr jsonb; has_push boolean; why text; push_p jsonb;
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

-- 위 not exists 두 개가 훑는 자리 — 사람 하나의 최근 줄만 보면 된다.
create index if not exists outbox_recent_by_user on outbox (to_user_id, created_at desc);

-- ================================================================ 4. 010 은 11자리 (INP-36)
-- 0018 의 검사는 `^01[016789][0-9]{7,8}$` 라 010 + 7자리(=10자리)를 통과시켰다. 010 은 11자리뿐이고
-- 10자리는 011·016 같은 옛 번호다. 그 번호는 명부에 앉은 뒤 문자를 못 받는다.
-- app/src/lib/phone.ts 의 isValidMobile 은 이미 같은 규칙이다 — 표를 거기에 맞춘다.
-- not valid: 이미 들어 있는 행을 다시 검사하지 않는다(옛 씨앗 데이터 때문에 배포가 멈추지 않게).
-- 앞으로 넣거나 고치는 행은 검사한다.
alter table roster_phones drop constraint if exists roster_phones_phone_ck;
alter table roster_phones add constraint roster_phones_phone_ck
  check (phone ~ '^01[016789][0-9]{7,8}$' and not (phone like '010%' and length(phone) <> 11)) not valid;
