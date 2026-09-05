-- 0023_operator.sql — BRIGHT 운영자(사장님) 화면의 뒷단 (2026-09-05)
--
-- 운영자는 어느 학원의 소속도 아니다. 그래서 RLS 는 한 줄도 통과하지 못한다.
-- 운영자가 보는 모든 것은 여기 있는 security-definer RPC 를 지난다 — 첫 줄이 늘 is_operator() 검사다.
-- 운영자 등록은 서비스 키로만 (tools/set-operator.mjs). 앱에서 운영자를 늘리는 길은 없다.
--
-- 이 판이 더하는 것
--   app_operators        운영자 표 (user_id 하나)
--   academies.locked     이용 정지. 잠기면 로그인(_shared/auth.ts)이 403 academy_locked 로 거절한다.
--   academy_settings     학원별 문자 발신 모드·발신키
--   op_*                 운영자 전용 RPC 여덟 개
--
-- 발신키에 대해 (중요 — 문서에도 같은 말이 있다: docs/ops/operator.md)
--   pgcrypto 대칭 암호화는 비밀값을 GUC(app.settings_key)로 넣어야 하는데 Supabase 는 커스텀 GUC 를
--   심을 자리를 주지 않는다. 세션마다 set_config 를 부르면 그 비밀값이 로그·연결 풀에 남는다.
--   그래서 "암호화" 대신 "읽는 길을 좁히기" 로 간다:
--     · 표 자체는 RLS 켜고 정책 없음 → 어떤 로그인 사용자도 select 를 못 한다.
--     · 운영자는 op_get_sms() 로 마스킹된 값(****1234)만 본다. 원문은 아무 화면에도 안 나간다.
--     · 발송기(Edge outbox-send)는 service_role 전용 academy_sms_key() 로 원문을 가져간다.
--   즉 저장은 평문이다. 데이터베이스를 통째로 가져간 사람에게는 보인다 — 그 위험은 SUPABASE_SERVICE_KEY
--   자체와 같은 등급이고, 대행사 키는 언제든 대행사 화면에서 갈 수 있다.

-- ================================================================ 1. 잠금 · 학원 설정 표
alter table academies add column if not exists locked boolean not null default false;

create table if not exists app_operators (
  user_id uuid primary key references users(id) on delete cascade,
  created_at timestamptz not null default now());
alter table app_operators enable row level security;   -- 정책 없음: 서비스 키와 security definer 함수만

create table if not exists academy_settings (
  academy_id uuid primary key references academies(id) on delete cascade,
  sms_provider text not null default 'console' check (sms_provider in ('console','http')),
  sms_sender_key text,
  updated_at timestamptz not null default now());
alter table academy_settings enable row level security;   -- 정책 없음: op_* 와 service_role 만

-- 학원을 지우면 딸린 것이 전부 같이 가야 한다. 0004 가 돌린 고리를 그대로 한 번 더 돌린다 —
-- 그 뒤에 생긴 표(academy_settings 는 위에서 이미 cascade 로 만들었지만, 앞으로 생길 표도)가 빠지지 않게.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass::text as tbl
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.academies'::regclass
      and connamespace = 'public'::regnamespace
      and pg_get_constraintdef(c.oid) like 'FOREIGN KEY (academy_id)%'
      and pg_get_constraintdef(c.oid) not ilike '%on delete cascade%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (academy_id) references public.academies(id) on delete cascade', r.tbl, r.conname);
  end loop;
end $$;

-- ================================================================ 2. 운영자인가
-- auth.uid() 하나만 본다. 소속·역할과는 아무 상관이 없다 (사장님은 자기 학원의 원장이면서 운영자일 수 있다).
create or replace function is_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_operators o where o.user_id = auth.uid()) $$;
revoke execute on function is_operator() from public, anon;
grant execute on function is_operator() to authenticated, service_role;

-- 운영자가 아니면 아무 일도 못 한다. 여덟 RPC 가 첫 줄에서 이걸 부른다.
create or replace function op_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_operator() then raise exception 'not_operator'; end if;
end $$;
revoke execute on function op_guard() from public, anon;

-- ================================================================ 3. 학원 목록 + 숫자
-- 화면(OpHome)의 카드 한 장이 이 표의 한 줄이다.
--   students         지금 다니는 학생 (퇴원 제외)
--   parents_total    명부의 학부모 번호 (같은 번호가 자녀 둘이면 한 사람으로 센다)
--   parents_entered  그 가운데 앱에 들어온 사람 (users 행이 있다)
--   no_push          들어온 학부모·학생 가운데 살아 있는 푸시 구독이 없는 사람
--                    — 0020 roster_entry_status 의 판정과 글자까지 같게 둔다(failed_at > last_ok_at 이면 죽은 구독).
--   invoices_month   이번 달(KST) 청구서 수 (면제 void 제외)
--   paid_month       그 가운데 완납
create or replace function op_academies()
returns table (
  id uuid, slug text, name text, brand_color text, logo_path text, created_at timestamptz, locked boolean,
  students int, parents_entered int, parents_total int, no_push int,
  invoices_month int, paid_month int, sms_provider text)
language plpgsql stable security definer set search_path = public as $$
declare ym text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
begin
  perform op_guard();
  return query
  select a.id, a.slug, a.name, a.brand_color, a.logo_path, a.created_at, a.locked,
    (select count(*)::int from students s where s.academy_id = a.id and s.status <> 'left'),
    (select count(distinct rp.phone)::int from roster_phones rp
      where rp.academy_id = a.id and rp.role = 'parent'
        and exists (select 1 from users u where u.phone = rp.phone)),
    (select count(distinct rp.phone)::int from roster_phones rp
      where rp.academy_id = a.id and rp.role = 'parent'),
    (select count(distinct u.id)::int from roster_phones rp join users u on u.phone = rp.phone
      where rp.academy_id = a.id and rp.role in ('parent','student')
        and not exists (select 1 from push_subscriptions ps
                         where ps.user_id = u.id
                           and not (ps.failed_at is not null and (ps.last_ok_at is null or ps.last_ok_at < ps.failed_at)))),
    (select count(*)::int from invoices i where i.academy_id = a.id and i.period_ym = ym and i.status <> 'void'),
    (select count(*)::int from invoices i where i.academy_id = a.id and i.period_ym = ym and i.status = 'paid'),
    coalesce((select st.sms_provider from academy_settings st where st.academy_id = a.id), 'console')
  from academies a
  order by a.created_at desc;
end $$;

-- ================================================================ 4. 학원 만들기
-- tools/new-academy.mjs 가 세 번에 나눠 하던 일(academies · 원장 roster_phones · invite_tokens 7일)을
-- 한 트랜잭션에서 한다. 중간에 터지면 학원이 반쯤 생기는 일이 없다.
create or replace function op_create_academy(
  p_slug text, p_name text, p_director_phone text, p_director_name text, p_brand_color text default null)
returns table (academy_id uuid, invite_url text)
language plpgsql security definer set search_path = public as $$
declare a uuid; ph text := normalize_phone(p_director_phone); tok text; base text; nm text := btrim(coalesce(p_name, '')); dn text := btrim(coalesce(p_director_name, ''));
begin
  perform op_guard();
  if p_slug !~ '^[a-z0-9-]{2,40}$' then raise exception 'bad_slug'; end if;
  if nm = '' or length(nm) > 40 then raise exception 'bad_name'; end if;
  if dn = '' or length(dn) > 20 then raise exception 'bad_director_name'; end if;
  -- 0022 의 roster_phones_phone_ck 와 같은 규칙. 표가 터지기 전에 우리 이름으로 거절한다.
  if ph !~ '^01[016789][0-9]{7,8}$' or (ph like '010%' and length(ph) <> 11) then raise exception 'bad_phone'; end if;
  if p_brand_color is not null and p_brand_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'bad_color'; end if;
  if exists (select 1 from academies x where x.slug = p_slug) then raise exception 'slug_taken'; end if;

  begin
    insert into academies (slug, name, brand_color)
    values (p_slug, nm, coalesce(p_brand_color, '#2B5BD9'))
    returning id into a;
  exception when unique_violation then raise exception 'slug_taken';   -- 둘이 동시에 같은 slug 를 눌렀다
  end;

  insert into roster_phones (academy_id, phone, role, name) values (a, ph, 'director', dn);

  -- 원장 초대 토큰. 원문 32 hex 는 이 반환값에만, DB 에는 해시만 (create_invite 와 같은 규칙).
  tok := replace(gen_random_uuid()::text, '-', '');
  insert into invite_tokens (academy_id, phone, role, token_hash, expires_at, created_by)
  values (a, ph, 'director', encode(sha256(convert_to(tok, 'utf8')), 'hex'), now() + interval '7 days', auth.uid());

  base := coalesce((select value from app_settings where key = 'app_url'), 'https://kiddongwook.github.io/bright-demo/pwa');
  academy_id := a;
  invite_url := rtrim(base, '/') || '/?a=' || p_slug || '&i=' || tok;
  return next;
end $$;

-- 원장 초대 링크 재발급. 옛 토큰은 여기서 만료된다 — 링크는 늘 마지막 것 하나만 산다(create_invite 와 같다).
create or replace function op_director_invite(p_academy uuid) returns text
language plpgsql security definer set search_path = public as $$
declare ph text; tok text; base text; sl text;
begin
  perform op_guard();
  select a.slug into sl from academies a where a.id = p_academy;
  if sl is null then raise exception 'not_found'; end if;
  select rp.phone into ph from roster_phones rp
   where rp.academy_id = p_academy and rp.role = 'director' order by rp.id limit 1;
  if ph is null then raise exception 'no_director'; end if;

  update invite_tokens set expires_at = now()
   where academy_id = p_academy and phone = ph and used_at is null and expires_at > now();
  tok := replace(gen_random_uuid()::text, '-', '');
  insert into invite_tokens (academy_id, phone, role, token_hash, expires_at, created_by)
  values (p_academy, ph, 'director', encode(sha256(convert_to(tok, 'utf8')), 'hex'), now() + interval '7 days', auth.uid());

  base := coalesce((select value from app_settings where key = 'app_url'), 'https://kiddongwook.github.io/bright-demo/pwa');
  return rtrim(base, '/') || '/?a=' || sl || '&i=' || tok;
end $$;

-- ================================================================ 5. 잠금 (이용 정지)
-- 잠긴 학원은 로그인이 막힌다(_shared/auth.ts 의 ensureUser 가 403 academy_locked).
-- 이미 로그인해 있는 사람의 세션은 끊지 않는다 — 앱이 다음 진입 때 막힌다. 데이터는 그대로 남는다.
create or replace function op_set_lock(p_academy uuid, p_locked boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform op_guard();
  if not exists (select 1 from academies where id = p_academy) then raise exception 'not_found'; end if;
  update academies set locked = coalesce(p_locked, false) where id = p_academy;
  return coalesce(p_locked, false);
end $$;

-- ================================================================ 6. 학원별 문자 발신키
-- p_sender_key 가 null 이면 키는 그대로 두고 모드만 바꾼다. 빈 문자열이면 키를 지운다(전역 값으로 되돌아간다).
create or replace function op_set_sms(p_academy uuid, p_provider text, p_sender_key text default null) returns void
language plpgsql security definer set search_path = public as $$
declare k text := nullif(btrim(coalesce(p_sender_key, '')), '');
begin
  perform op_guard();
  if not exists (select 1 from academies where id = p_academy) then raise exception 'not_found'; end if;
  if coalesce(p_provider, '') not in ('console', 'http') then raise exception 'bad_provider'; end if;
  if k is not null and length(k) > 200 then raise exception 'bad_key'; end if;

  insert into academy_settings (academy_id, sms_provider, sms_sender_key, updated_at)
  values (p_academy, p_provider, k, now())
  on conflict (academy_id) do update set
    sms_provider = excluded.sms_provider,
    -- null 을 준 것은 "안 건드림", 빈 문자열은 "지움" 이다. 화면에는 마스킹된 값만 보이므로
    -- 원장이 모드만 바꾸려다 키를 날리는 일이 없어야 한다.
    sms_sender_key = case when p_sender_key is null then academy_settings.sms_sender_key else k end,
    updated_at = now();
end $$;

-- 운영자가 보는 값은 늘 마스킹이다. 원문은 어떤 화면에도 나가지 않는다.
create or replace function op_get_sms(p_academy uuid)
returns table (sms_provider text, sender_key_masked text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform op_guard();
  if not exists (select 1 from academies where id = p_academy) then raise exception 'not_found'; end if;
  return query
  select coalesce(st.sms_provider, 'console'),
         case when st.sms_sender_key is null or st.sms_sender_key = '' then null
              when length(st.sms_sender_key) <= 4 then '****'
              else '****' || right(st.sms_sender_key, 4) end,
         st.updated_at
  from academies a left join academy_settings st on st.academy_id = a.id
  where a.id = p_academy;
end $$;

-- 발송기 전용. service_role 만 부를 수 있다 — 운영자도 원문은 못 본다.
create or replace function academy_sms_key(p_academy uuid)
returns table (sms_provider text, sender_key text)
language sql stable security definer set search_path = public as $$
  select coalesce(st.sms_provider, 'console'), nullif(st.sms_sender_key, '')
  from academy_settings st where st.academy_id = p_academy $$;
revoke execute on function academy_sms_key(uuid) from public, anon, authenticated;
grant execute on function academy_sms_key(uuid) to service_role;

-- ================================================================ 7. 삭제
-- slug 를 손으로 다시 받아 맞을 때만. DB 는 cascade 로 다 지워지고, 저장소(logos/·notices/ 접두어)는
-- SQL 로 못 지운다 → Edge op-delete 가 먼저 비우고 이 함수를 부른다.
create or replace function op_delete_academy(p_academy uuid, p_confirm_slug text) returns text
language plpgsql security definer set search_path = public as $$
declare sl text; nm text;
begin
  perform op_guard();
  select a.slug, a.name into sl, nm from academies a where a.id = p_academy;
  if sl is null then raise exception 'not_found'; end if;
  if btrim(coalesce(p_confirm_slug, '')) <> sl then raise exception 'slug_mismatch'; end if;
  -- 이 학원에만 속한 사람의 auth 계정은 남는다(다른 학원 소속일 수 있다). 소속·명부는 cascade 로 사라진다.
  delete from academies where id = p_academy;
  return nm;
end $$;

-- 내려받기는 Edge export-academy 가 한다(운영자 JWT + ?academy=<id>). SQL 쪽은 대상이 맞는지만 확인해 준다.
create or replace function op_export_check(p_academy uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  perform op_guard();
  return exists (select 1 from academies where id = p_academy);
end $$;

-- ================================================================ 8. 권한
-- 전부 authenticated 에게 준다 — 막는 일은 함수 안 첫 줄(op_guard)이 한다.
-- anon 에게는 하나도 주지 않는다(로그인 전에는 부를 일이 없다).
do $$
declare f text;
begin
  foreach f in array array[
    'op_academies()',
    'op_create_academy(text, text, text, text, text)',
    'op_director_invite(uuid)',
    'op_set_lock(uuid, boolean)',
    'op_set_sms(uuid, text, text)',
    'op_get_sms(uuid)',
    'op_delete_academy(uuid, text)',
    'op_export_check(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
