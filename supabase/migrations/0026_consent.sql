-- 0026_consent.sql — 이용약관·개인정보 처리방침 동의 기록 (2026-09-05, 4차 묶음 T2)
--
-- 이것은 UX 게이트다. 로그인한 사람이 약관·방침의 어느 판에 언제 동의했는지를 서버에 남기고,
-- 앱은 my_consent() 가 비어 있거나 판이 낮으면 Consent 화면을 한 번 띄운다(제한 세션 = 알림톡 링크는 건너뛴다).
-- 동의하지 않은 사람이 RPC 를 직접 불러 데이터를 읽는 것을 RLS 로 막지는 않는다 — 명부에 있는 사람이 자기 학원
-- 자료를 보는 권한은 원래 소속(memberships)에서 나오고, 동의 표는 "동의했다는 증거" 를 남기는 자리다.
-- 판 번호는 날짜 문자열(YYYY-MM-DD). 문서를 고쳐 앱의 TERMS_VERSION·PRIVACY_VERSION 을 올리면 모두 한 번 다시 동의한다.
--
-- 이 판이 더하는 것
--   consents                       user_id 하나 · 약관 판 · 방침 판 · 동의 시각
--   accept_terms(p_terms, p_privacy)  본인 행 upsert (security definer — 표에는 insert/update 정책이 없다)
--   my_consent()                    본인 행 읽기
-- 문서: docs/legal/terms.md · docs/legal/privacy.md · docs/ops/legal.md

create table if not exists consents (
  user_id uuid primary key references users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  agreed_at timestamptz not null default now());
alter table consents enable row level security;
-- 읽기는 본인 행만. 쓰기 정책은 없다 — accept_terms 만 쓴다.
drop policy if exists consents_select_own on consents;
create policy consents_select_own on consents for select to authenticated using (user_id = auth.uid());

create or replace function accept_terms(p_terms text, p_privacy text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_terms, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(p_privacy, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'bad_version';
  end if;
  insert into consents (user_id, terms_version, privacy_version, agreed_at)
  values (auth.uid(), p_terms, p_privacy, now())
  on conflict (user_id) do update set
    terms_version = excluded.terms_version,
    privacy_version = excluded.privacy_version,
    agreed_at = now();
end $$;
revoke all on function accept_terms(text, text) from public, anon;
grant execute on function accept_terms(text, text) to authenticated;

create or replace function my_consent() returns table (terms_version text, privacy_version text, agreed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.terms_version, c.privacy_version, c.agreed_at from consents c where c.user_id = auth.uid();
$$;
revoke all on function my_consent() from public, anon;
grant execute on function my_consent() to authenticated;
