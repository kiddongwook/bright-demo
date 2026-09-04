-- 0020 알림 못 받는 사람 (2026-09-05)
-- 앱에 들어온 것과 알림을 받는 것은 다른 일이다.
--   알림은 (a) 푸시 구독이 있으면 웹 푸시로, (b) 없으면 알림톡/문자로 나간다(outbox).
--   그런데 문자 대행사가 아직 안 붙었다(Edge 비밀값 SMS_PROVIDER=console) — 콘솔에 찍고 끝이다.
--   그래서 오늘은 "푸시 구독이 없는 사람 = 앱 밖에서는 아무것도 못 받는 사람" 이다.
-- 원장이 그 사람을 명부에서 바로 보게 roster_entry_status 에 두 칸을 더한다.
--   push      — 살아 있는 푸시 구독이 하나라도 있나
--   kakao_ok  — 문자/알림톡이 실제로 나가는 상태인가 (대행사가 붙기 전에는 늘 false)
-- 반환형이 바뀌므로 create or replace 가 아니라 drop 먼저다. 나머지(원장 전용·정렬·기존 칸)는 0011 그대로.
drop function if exists roster_entry_status();
create function roster_entry_status()
returns table (role user_role, name text, phone text, student_name text, entered boolean, push boolean, kakao_ok boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  -- 문자/알림톡이 실제로 나가는가. app_settings 에 'sms_provider' 키가 생기고 그 값이 'console' 이 아니게 되는
  -- 순간(= 대행사 계약 후 Edge 비밀값 SMS_PROVIDER 와 같이 맞춰 넣는다) 이 칸이 true 로 뒤집힌다.
  -- 지금은 그 키가 없으므로 'console' 로 읽혀 false 다 — tools/setup-outbox.mjs 는 이 키를 아직 넣지 않는다.
  sms_on boolean := coalesce((select value from app_settings where key = 'sms_provider'), 'console') <> 'console';
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  return query
    select rp.role, rp.name, rp.phone, s.name,
      exists (select 1 from users u join memberships m on m.user_id = u.id
              where u.phone = rp.phone and m.academy_id = rp.academy_id
                and m.role = rp.role and m.student_id is not distinct from rp.student_id),
      -- 살아 있는 구독의 뜻은 발송기(_shared/outbox-send 의 failing())와 같게 둔다:
      -- failed_at 이 last_ok_at 보다 뒤면 죽은 것으로 본다.
      exists (select 1 from users u2 join push_subscriptions ps on ps.user_id = u2.id
              where u2.phone = rp.phone
                and not (ps.failed_at is not null and (ps.last_ok_at is null or ps.last_ok_at < ps.failed_at))),
      sms_on
    from roster_phones rp
    left join students s on s.id = rp.student_id
    where rp.academy_id = current_academy_id() and rp.role in ('parent', 'student')
    order by s.name, rp.role;
end $$;
