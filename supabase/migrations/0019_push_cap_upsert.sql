-- 0019 푸시 구독 상한 트리거 손보기 (2026-09-04)
-- 0018 의 push_subscriptions_cap 은 "가장 오래된 것부터 4개만 남기고 지운다" 였다.
-- 같은 endpoint 로 다시 구독(upsert)하는 길에서는 그 행이 아직 표에 있으므로 5대가 찬 계정에서
-- 엉뚱한 기기 하나가 조용히 빠진다. 지금 앱(api.ts)은 delete → insert 라 닿지 않지만,
-- 0013 의 push_subs_upd 정책이 upsert 를 허용하므로 문이 열려 있다.
--   → 들어오는 endpoint 는 세지도 지우지도 않는다.
-- (0018 이 이미 배포된 뒤에 찾아서 새 파일로 낸다. 0018 본문도 같이 고쳐 새 DB 는 처음부터 이 판이 된다.)
create or replace function push_subscriptions_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from push_subscriptions
   where user_id = new.user_id and endpoint <> new.endpoint
     and id in (select id from push_subscriptions
                 where user_id = new.user_id and endpoint <> new.endpoint
                 order by created_at desc offset 4);
  return new;
end $$;
