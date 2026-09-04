-- 출결 사유를 푸시 본문에도 싣는다.
-- 0015 는 사유를 앱 알림(notifications.title/body)에만 넣었다. 그래서 푸시로 받는 학부모는
-- "박첫째 오늘 출결이 기록됐어요. 지각" 까지만 보고 "10분" 을 못 봤다 — 같은 알림인데 받는 길에 따라 내용이 달랐다.
--
-- 카톡(alimtalk)은 손대지 않는다: ATTENDANCE 는 심사받은 템플릿이라 사유 칸을 못 늘린다.
-- 그래서 사유는 채널 'push' 줄의 params 에만 '사유' 로 얹고(아래), 본문에 붙이는 것은
-- _shared/push.ts 의 pushPayload 가 한다 (ATTENDANCE 이고 params['사유'] 가 있을 때만 ' · <사유>').
-- _shared/alimtalk.ts 의 TEMPLATES 는 아는 키만 읽으므로 모르는 키가 와도 터지지 않지만,
-- 애초에 카톡 줄의 params 에는 넣지 않으니 tools/attendance-note-test.mjs C 절(사유가 카톡 params 에 새지 않는다)도 그대로 통과한다.
--
-- 본문은 0013_push_invite.sql 의 것을 그대로 가져오고 why 한 줄만 늘렸다.
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
    insert into outbox (academy_id, to_user_id, channel, template_code, params, link_view, link_ref, idempotency_key)
    values (new.academy_id, new.user_id, 'push', code, push_p, v, r, 'push:' || new.id)
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
