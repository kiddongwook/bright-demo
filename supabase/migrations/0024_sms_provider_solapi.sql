-- 학원별 발신 모드에 solapi 를 허용한다 (_shared/solapi.ts 어댑터). 키 형식은 "apiKey:apiSecret[:from]".
alter table academy_settings drop constraint if exists academy_settings_sms_provider_check;
alter table academy_settings add constraint academy_settings_sms_provider_check check (sms_provider in ('console', 'http', 'solapi'));

create or replace function op_set_sms(p_academy uuid, p_provider text, p_sender_key text default null) returns void
language plpgsql security definer set search_path = public as $$
declare k text := nullif(btrim(coalesce(p_sender_key, '')), '');
begin
  perform op_guard();
  if not exists (select 1 from academies where id = p_academy) then raise exception 'not_found'; end if;
  if coalesce(p_provider, '') not in ('console', 'http', 'solapi') then raise exception 'bad_provider'; end if;
  if k is not null and length(k) > 200 then raise exception 'bad_key'; end if;
  -- solapi 키는 "apiKey:apiSecret" 또는 "apiKey:apiSecret:발신번호" 모양이어야 한다
  if p_provider = 'solapi' and k is not null and k !~ '^[A-Za-z0-9]{8,}:[A-Za-z0-9]{8,}(:0\d{8,10})?$' then raise exception 'bad_key'; end if;

  insert into academy_settings (academy_id, sms_provider, sms_sender_key, updated_at)
  values (p_academy, p_provider, k, now())
  on conflict (academy_id) do update set
    sms_provider = excluded.sms_provider,
    sms_sender_key = case when p_sender_key is null then academy_settings.sms_sender_key else k end,
    updated_at = now();
end $$;
revoke all on function op_set_sms(uuid, text, text) from public, anon;
grant execute on function op_set_sms(uuid, text, text) to authenticated;
