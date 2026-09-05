-- 문(로그인 전) 화면도 가로 로고를 쓸 수 있게 public_academy 가 wordmark_path·wordmark_dark_path 를 함께 돌려준다.
-- 어두운 화면에서 네모 로고(흰 배경)가 회색 판처럼 보이던 것을 — 어두운 화면용 가로 로고가 있으면 그것으로 대신한다.
drop function if exists public_academy(text);
create function public_academy(p_slug text)
returns table (name text, brand_color text, logo_path text, wordmark_path text, wordmark_dark_path text)
language sql stable security definer set search_path = public as $$
  select a.name, a.brand_color, a.logo_path, a.wordmark_path, a.wordmark_dark_path from academies a where a.slug = p_slug $$;
revoke all on function public_academy(text) from public;
grant execute on function public_academy(text) to anon, authenticated;

notify pgrst, 'reload schema';
