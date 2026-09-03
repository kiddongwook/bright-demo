-- 학원을 지우면 그 학원의 모든 데이터가 같이 지워진다 (탈퇴 = 내보내기 후 삭제).
-- 테스트 정리도 이걸로 단순해진다. auth.users 는 별도(스크립트가 지운다).
do $$
declare r record;
begin
  for r in
    select tc.table_name, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
      and kcu.column_name = 'academy_id' and ccu.table_name = 'academies'
  loop
    execute format('alter table public.%I drop constraint %I', r.table_name, r.constraint_name);
    execute format('alter table public.%I add constraint %I foreign key (academy_id) references public.academies(id) on delete cascade', r.table_name, r.constraint_name);
  end loop;
end $$;

-- 학생·반이 지워질 때 딸린 것도 같이 (이미 cascade 인 것은 그대로)
alter table attendance       drop constraint attendance_student_id_fkey,       add constraint attendance_student_id_fkey       foreign key (student_id) references students(id) on delete cascade;
alter table attendance       drop constraint attendance_class_id_fkey,         add constraint attendance_class_id_fkey         foreign key (class_id)   references classes(id)  on delete cascade;
alter table absence_requests drop constraint absence_requests_student_id_fkey, add constraint absence_requests_student_id_fkey foreign key (student_id) references students(id) on delete cascade;
alter table notes            drop constraint notes_student_id_fkey,            add constraint notes_student_id_fkey            foreign key (student_id) references students(id) on delete cascade;
alter table todos            drop constraint todos_class_id_fkey,              add constraint todos_class_id_fkey              foreign key (class_id)   references classes(id)  on delete cascade;
alter table invoices         drop constraint invoices_student_id_fkey,         add constraint invoices_student_id_fkey         foreign key (student_id) references students(id) on delete cascade;
