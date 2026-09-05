-- 학원 가로 로고(워드마크): 앱바·PC 내비에 그림으로 보인다. logo_path(정사각)는 설치 아이콘·문 화면용 그대로.
-- 어두운 화면용은 따로 받는다 — 한 장을 반전해 쓰지 않는다(밝은 판 하나만 있으면 어두운 화면은 학원 이름 글자로).
-- 쓰기는 기존 academies_write(원장, 자기 학원)가 그대로 덮는다. public_academy·op_academies 는 건드리지 않는다.
alter table academies add column if not exists wordmark_path text;
alter table academies add column if not exists wordmark_dark_path text;
