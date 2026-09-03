-- 8주차: 공지 사진·학원 로고 파일(Storage 두 버킷·정책), 아직 안 들어온 사람 RPC, 숙제 검사 정책, 문 앞 로고.
-- 파일 경로의 첫 폴더가 학원 id 다: notices/<academy_id>/<notice_id>/<n>.jpg, logos/<academy_id>/logo.png.
-- 정책은 그 첫 폴더를 current_academy_id() 와 맞춰 본다 — 다른 학원 사진은 서명 URL 도 못 만든다.

-- 1. 버킷 (대시보드 손작업 없이 재현 가능하게)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('notices', 'notices', false, 5242880, '{image/jpeg,image/png}'),
  ('logos',   'logos',   true,  1048576, '{image/png,image/jpeg}')
on conflict (id) do nothing;

-- 2. Storage 정책. 공지 사진은 같은 학원이면 읽고 staff 만 쓴다. 로고는 공개 읽기(정책 불필요) + 원장만 쓴다.
drop policy if exists notices_read  on storage.objects;
drop policy if exists notices_write on storage.objects;
drop policy if exists logos_write   on storage.objects;
create policy notices_read on storage.objects for select
  using (bucket_id = 'notices' and (storage.foldername(name))[1] = public.current_academy_id()::text);
create policy notices_write on storage.objects for all
  using      (bucket_id = 'notices' and (storage.foldername(name))[1] = public.current_academy_id()::text and public.is_staff())
  with check (bucket_id = 'notices' and (storage.foldername(name))[1] = public.current_academy_id()::text and public.is_staff());
create policy logos_write on storage.objects for all
  using      (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_academy_id()::text and public.current_role_() = 'director')
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_academy_id()::text and public.current_role_() = 'director');

-- 3. 공지에 붙은 사진 경로들 (문자열 배열, 최대 3장)
alter table notices add column if not exists photos jsonb not null default '[]'::jsonb;

-- 4. 아직 앱에 안 들어온 사람. 번호가 나가므로 원장만.
--    명부(roster_phones) 의 학부모·학생 행 × 같은 번호의 사용자가 이 학원에 같은 역할·같은 자녀로 소속됐는지.
create or replace function roster_entry_status()
returns table (role user_role, name text, phone text, student_name text, entered boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if current_role_() <> 'director' then raise exception 'not allowed'; end if;
  return query
    select rp.role, rp.name, rp.phone, s.name,
      exists (select 1 from users u join memberships m on m.user_id = u.id
              where u.phone = rp.phone and m.academy_id = rp.academy_id
                and m.role = rp.role and m.student_id is not distinct from rp.student_id)
    from roster_phones rp
    left join students s on s.id = rp.student_id
    where rp.academy_id = current_academy_id() and rp.role in ('parent', 'student')
    order by s.name, rp.role;
end $$;

-- 5. 숙제 검사: 원장·강사가 담당 반 학생 대신 체크한다 (학생 본인 정책은 0002 의 todo_done_student 그대로)
drop policy if exists todo_done_staff on todo_done;
create policy todo_done_staff on todo_done for all
  using      (todo_id in (select id from todos where class_id in (select staff_class_ids())))
  with check (todo_id in (select id from todos where class_id in (select staff_class_ids())));

-- 6. 문 화면이 로그인 전에 로고도 가져간다 (반환형이 바뀌므로 drop 먼저)
drop function if exists public_academy(text);
create function public_academy(p_slug text) returns table (name text, brand_color text, logo_path text)
language sql stable security definer set search_path = public as $$
  select a.name, a.brand_color, a.logo_path from academies a where a.slug = p_slug $$;
grant execute on function public_academy(text) to anon, authenticated;
