-- 0017 레드팀·이음매 손보기 (2026-09-04)
--   RT-1  recalc_invoice — authenticated 에게 새어 있던 실행 권한을 걷고, JWT 로 부르면 본문에서도 막는다
--   RT-3  list_public_tables — security definer 인데 search_path 가 없었다. 검사용이니 service_role 만 부른다
--   RT-2  client_errors — 길이 상한 · academy_id 검증 · 사람마다 10분 20건 상한
--   S16   faqs — 같은 학원에 같은 질문은 하나만 (대소문자 무시)

-- ---------------------------------------------------------------- RT-1. recalc_invoice
-- 0014 의 revoke 가 authenticated 를 빠뜨려, 남의 학원 청구서 UUID 만 알면 학부모도 상태를 바꿀 수 있었다.
-- 권한을 걷는 것이 1차 방어. 본문 가드는 2차 — 언젠가 누가 다시 grant 해도 남의 학원은 못 건드리게.
-- 안쪽에서 부르는 record_payment/set_invoice_amount 는 definer(주인 권한)라 revoke 와 무관하고,
-- 이미 academy_id = current_academy_id() 로 좁힌 청구서만 넘기므로 가드도 통과한다.
-- 서비스키(auth.uid() 가 없다)로 부르는 살림·검사 스크립트는 그대로 둔다.
create or replace function recalc_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices; s int;
begin
  select * into inv from invoices where id = p_invoice;
  if inv.id is null then raise exception 'not found'; end if;
  -- JWT 로 부른 경우에만 본다. 소속이 없으면 is_staff() 가 null 이라 coalesce 로 눕힌다.
  if auth.uid() is not null
     and (not coalesce(is_staff(), false) or inv.academy_id is distinct from current_academy_id()) then
    raise exception 'not allowed';
  end if;
  if inv.status = 'void' then return; end if;
  select coalesce(sum(amount), 0) into s from payments where invoice_id = p_invoice;
  if inv.total > 0 and s >= inv.total then
    update invoices set status = 'paid', paid_at = (select max(paid_at) from payments where invoice_id = p_invoice) where id = p_invoice;
  elsif s > 0 then
    update invoices set status = 'partial', paid_at = null where id = p_invoice;
  else
    update invoices
       set status = (case when due_date < (now() at time zone 'Asia/Seoul')::date and total > 0 then 'overdue' else 'issued' end)::invoice_status,
           paid_at = null
     where id = p_invoice;
  end if;
end $$;
revoke execute on function recalc_invoice(uuid) from public, anon, authenticated;
grant execute on function recalc_invoice(uuid) to service_role;

-- ---------------------------------------------------------------- RT-3. list_public_tables
-- 검사 스크립트(tools/db-check.mjs)가 서비스키로만 쓴다. anon 에게 표 이름 31개를 흘릴 까닭이 없다.
create or replace function list_public_tables() returns table(table_name text)
language sql stable security definer set search_path = public as $$
  select t.table_name::text from information_schema.tables t where t.table_schema = 'public' order by 1 $$;
revoke execute on function list_public_tables() from public, anon, authenticated;
grant execute on function list_public_tables() to service_role;

-- ---------------------------------------------------------------- RT-2. client_errors
-- 있던 정책은 user_id = auth.uid() 만 봤다 — 400KB 짜리 행을 남의 학원 id 로 태그해 무한히 넣을 수 있었다.
-- 앱(report.ts)은 message·stack 을 1,000자로 잘라 보내고 1분에 5건까지만 보낸다. 상한은 그보다 넉넉하게.
drop policy if exists client_errors_ins on client_errors;
create policy client_errors_ins on client_errors for insert to authenticated with check (
  user_id = auth.uid()
  and length(message) <= 4000
  and (stack is null or length(stack) <= 8000)
  and (academy_id is null or academy_id = current_academy_id())
);

-- 사람마다 10분에 20건까지. 21번째부터 거절 — 앱은 1분 5건이라 정상 사용은 닿지 않는다.
create index if not exists client_errors_user_at_idx on client_errors (user_id, at);
create or replace function client_errors_rate_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.user_id is null then return new; end if;
  select count(*) into n from client_errors
   where user_id = new.user_id and at > now() - interval '10 minutes';
  if n >= 20 then
    raise exception 'client_errors rate limit: % rows in the last 10 minutes', n using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists client_errors_rate_guard_t on client_errors;
create trigger client_errors_rate_guard_t before insert on client_errors
for each row execute function client_errors_rate_guard();

-- ---------------------------------------------------------------- S16. faqs 중복
-- "이 답을 자주 묻는 질문에도 올리기" 를 두 번 누르면 같은 질문이 두 줄로 쌓였다.
-- 화면(Inbox.tsx)이 먼저 찾아 고치도록 고쳤고, 여기서 DB 가 마지막으로 막는다. 대소문자·앞뒤 공백은 같은 질문으로 본다.
create unique index if not exists faqs_academy_lower_q_uidx on faqs (academy_id, lower(btrim(q)));
