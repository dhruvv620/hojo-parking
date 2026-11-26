-- Update 12: the guest check-in page only learns whether Lot 1 is open, not how many spots are free.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run more than once.
-- (Or just run schema.sql, which includes everything.)

create or replace function public.guest_lot_info(p_token text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  used int;
begin
  if p_token is null or not exists (select 1 from app_settings where key = 'checkin_token' and value = p_token) then
    return json_build_object('ok', false);
  end if;
  select count(*) into used from parking_records
   where status = 'parked' and location = 'inside' and checkout_at > now();
  return json_build_object(
    'ok', true,
    'lot1_open', used < lot_capacity(),
    'lots_full', coalesce(string_to_array(nullif((select value from app_settings where key = 'lots_full'), ''), ','), '{}'));
end;
$$;

notify pgrst, 'reload schema';
