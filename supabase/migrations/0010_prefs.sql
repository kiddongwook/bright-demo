-- 7주차: 알림 설정(users.prefs) · 문 앞 학원 이름(public_academy) · 알림톡 [학원] 변수.
-- 그리고 보안 구멍 하나: users_self_upd 는 행 단위라 본인 행의 어느 열이든 고칠 수 있었다.
-- 학부모가 active_membership_id 를 원장 membership 으로 바꾸면 current_membership() 이 그걸 그대로 읽어
-- set_active_membership() 의 소유 검사를 건너뛰고 원장이 됐다(확인함: 그 뒤 학원 전체 학생이 보였다).

alter table users add column if not exists prefs jsonb not null default '{}'::jsonb;

-- 열 단위 grant 는 행 정책과 겹쳐 든다: 본인 행(policy) 의 name·prefs(grant) 만 고칠 수 있다.
revoke update on users from anon, authenticated;
grant update (name, prefs) on users to authenticated;

-- 문 화면이 로그인 전에 부른다. 이름·색만 나간다 (그 외 컬럼은 반환하지 않는다).
create or replace function public_academy(p_slug text) returns table (name text, brand_color text)
language sql stable security definer set search_path = public as $$
  select a.name, a.brand_color from academies a where a.slug = p_slug $$;
grant execute on function public_academy(text) to anon, authenticated;

-- 알림 → 카톡 줄. 0006 본문 그대로에 두 가지만 얹는다: params 의 '학원'(5종 모두)과 받는 사람의 알림 설정.
create or replace function trg_notification_outbox() returns trigger language plpgsql security definer set search_path = public as $$
declare v text; r uuid; code text; p jsonb; k text; pr jsonb;
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
  else
    return new;
  end if;
  -- 문구의 [학원] 은 DB 이름에서만 온다 (5종 모두)
  p := coalesce(p, '{}'::jsonb) || jsonb_build_object('학원', (select name from academies where id = new.academy_id));
  -- 받는 사람이 그 카톡을 껐으면 앱 알림·종 배지는 그대로 두고 줄에만 세우지 않는다
  select prefs into pr from users where id = new.user_id;
  if coalesce((pr->>k)::boolean, true) = false then return new; end if;
  insert into outbox (academy_id, to_user_id, channel, template_code, params, link_view, link_ref, idempotency_key)
  values (new.academy_id, new.user_id, 'alimtalk', code, p, v, r, 'n:' || new.id)
  on conflict (idempotency_key) do nothing;
  return new;
end $$;
