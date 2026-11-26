-- Update 11: guests choose between the lots they're allowed to use
-- (cars & SUVs: Lot 1 or Lot 3; trucks: Lot 2 or Lot 3).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run more than once.
-- (Needs update 10 first. Or just run schema.sql, which includes everything.)

drop function if exists public.guest_check_in(text, text, text, text, text, text, text, text, text, text, date, text);

create or replace function public.guest_check_in(
  p_token text,
  p_name text,
  p_phone text,
  p_vehicle_type text,
  p_plate text,
  p_state text,
  p_make text,
  p_model text,
  p_color text,
  p_confirmation text,
  p_checkout_date date,
  p_website text default null,  -- hidden spam trap; real people leave it empty
  p_lot text default null       -- the lot the guest picked (optional)
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  today date := (now() at time zone 'America/Phoenix')::date;
  headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_ip text;
  n_days int;
  chosen text;
  used int;
  rec_id uuid;
  res_id uuid;
  dup record;
  plate_norm text;
  last_name text;
  flagged text[] := coalesce(string_to_array(nullif((select value from app_settings where key = 'lots_full'), ''), ','), '{}');
  wanted text;
begin
  -- who is asking (Supabase sits behind Cloudflare, which sets cf-connecting-ip)
  v_ip := coalesce(nullif(headers ->> 'cf-connecting-ip', ''), nullif(trim(split_part(headers ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');
  delete from guest_checkin_attempts where at < now() - interval '1 day';
  insert into guest_checkin_attempts (ip) values (v_ip);
  if (select count(*) from guest_checkin_attempts where guest_checkin_attempts.ip = v_ip and at > now() - interval '10 minutes') > 6 then
    return json_build_object('ok', false, 'error', 'Too many tries from this phone. Please wait a few minutes or ask the front desk.');
  end if;
  if (select count(*) from guest_checkin_attempts where at > now() - interval '10 minutes') > 40 then
    return json_build_object('ok', false, 'error', 'The check-in form is busy. Please wait a few minutes or ask the front desk.');
  end if;

  if p_token is null or not exists (select 1 from app_settings where key = 'checkin_token' and value = p_token) then
    return json_build_object('ok', false, 'error', 'This check-in link is no longer valid. Please ask the front desk.');
  end if;
  if coalesce(p_website, '') <> '' then
    return json_build_object('ok', false, 'error', 'Could not submit.');
  end if;

  -- clean every text: no control characters, trimmed
  p_name := trim(regexp_replace(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
  p_phone := trim(regexp_replace(regexp_replace(coalesce(p_phone, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
  p_plate := trim(regexp_replace(regexp_replace(coalesce(p_plate, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
  p_state := trim(regexp_replace(regexp_replace(coalesce(p_state, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
  p_make := trim(regexp_replace(regexp_replace(coalesce(p_make, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
  p_model := trim(regexp_replace(regexp_replace(coalesce(p_model, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
  p_color := trim(regexp_replace(regexp_replace(coalesce(p_color, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
  p_confirmation := trim(regexp_replace(regexp_replace(coalesce(p_confirmation, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));

  if length(p_name) < 2 or length(p_name) > 80 then return json_build_object('ok', false, 'error', 'Please enter your full name.'); end if;
  if length(p_plate) < 2 or length(p_plate) > 12 or p_plate !~ '^[A-Za-z0-9 -]+$' then
    return json_build_object('ok', false, 'error', 'Please enter your license plate (letters and numbers only).');
  end if;
  if p_vehicle_type is null or p_vehicle_type not in ('car', 'suv', 'truck') then return json_build_object('ok', false, 'error', 'Please choose Car, SUV or Truck.'); end if;
  if p_make = '' or p_model = '' or length(p_make) > 40 or length(p_model) > 40 then
    return json_build_object('ok', false, 'error', 'Please enter the make and model.');
  end if;
  if length(p_phone) > 25 or length(p_state) > 3 or length(p_color) > 30 or length(p_confirmation) > 40 then
    return json_build_object('ok', false, 'error', 'One of the fields is too long.');
  end if;
  n_days := p_checkout_date - today;
  if p_checkout_date is null or n_days < 1 or n_days > 60 then
    return json_build_object('ok', false, 'error', 'Please pick a check-out date after today (up to 60 days).');
  end if;

  -- same car already checked in (e.g. pressed Submit twice): show that one
  plate_norm := upper(regexp_replace(p_plate, '\s+', ' ', 'g'));
  select id, lot, checkout_at into dup from parking_records
   where status = 'parked' and checkout_at > now() and license_plate = plate_norm
   order by created_at desc limit 1;
  if found then
    return json_build_object('ok', true, 'ref', upper(substr(dup.id::text, 1, 5)), 'lot', dup.lot,
      'checkout_at', dup.checkout_at, 'matched_reservation', false, 'already', true, 'ask_desk', dup.lot is null);
  end if;

  -- where to park: trucks in Lot 2; cars and SUVs in Lot 1, or Lot 3 if Lot 1 is full
  select count(*) into used from parking_records
   where status = 'parked' and location = 'inside' and checkout_at > now();
  if p_vehicle_type = 'truck' then
    chosen := 'lot2';
  else
    chosen := case when used < lot_capacity() then 'lot1' else 'lot3' end;
  end if;
  -- the guest picked a lot: use it if their vehicle is allowed there, it isn't
  -- marked full, and (for Lot 1) there is still a spot
  if p_lot in ('lot1', 'lot2', 'lot3') and not (p_lot = any (flagged))
     and (p_lot = 'lot3'
          or (p_lot = 'lot1' and p_vehicle_type in ('car', 'suv') and used < lot_capacity())
          or (p_lot = 'lot2' and p_vehicle_type = 'truck')) then
    chosen := p_lot;
  end if;

  -- staff marked that lot full: no lot; the guest asks the front desk
  wanted := chosen;
  if chosen = any (flagged) then
    chosen := null;
  end if;

  perform set_config('request.jwt.claims', json_build_object('email', 'Guest self check-in')::text, true);

  -- online booking: confirmation # AND last name must both match
  if p_confirmation <> '' then
    last_name := lower((regexp_split_to_array(p_name, '\s+'))[array_length(regexp_split_to_array(p_name, '\s+'), 1)]);
    select id into res_id from parking_records
     where status = 'reserved'
       and lower(trim(confirmation_number)) = lower(p_confirmation)
       and last_name = any (regexp_split_to_array(lower(trim(guest_name)), '\s+'))
     order by arrival_at limit 1;
  end if;

  <<save>>
  loop
    begin
      if res_id is not null then
        update parking_records set
          status = 'parked', arrival_at = now(), days = n_days, lot = chosen,
          location = case when chosen = 'lot1' then 'inside' else 'outside' end,
          vehicle_type = p_vehicle_type, license_plate = p_plate, plate_state = nullif(p_state, ''),
          make = p_make, model = p_model, color = nullif(p_color, ''),
          phone = coalesce(nullif(p_phone, ''), phone)
        where id = res_id
        returning id into rec_id;
      else
        insert into parking_records (
          guest_name, phone, source, vehicle_type, license_plate, plate_state, make, model, color,
          confirmation_number, lot, location, status, arrival_at, days, created_by, updated_by)
        values (
          p_name, nullif(p_phone, ''), 'guest_form', p_vehicle_type, p_plate, nullif(p_state, ''),
          p_make, p_model, nullif(p_color, ''), nullif(p_confirmation, ''), chosen,
          case when chosen = 'lot1' then 'inside' else 'outside' end, 'parked', now(), n_days, null, null)
        returning id into rec_id;
      end if;
      exit save;
    exception when others then
      if sqlerrm like 'LOT_FULL%' and chosen = 'lot1' then
        wanted := 'lot3';
        chosen := case when 'lot3' = any (flagged) then null else 'lot3' end;
      else
        raise;
      end if;
    end;
  end loop;

  return json_build_object(
    'ok', true,
    'ref', upper(substr(rec_id::text, 1, 5)),
    'lot', chosen,
    'checkout_at', (select checkout_at from parking_records where id = rec_id),
    'matched_reservation', res_id is not null,
    'ask_desk', chosen is null,
    'full_lot', case when chosen is null then wanted end);
end;
$$;

revoke all on function public.guest_check_in(text, text, text, text, text, text, text, text, text, text, date, text, text) from public;
grant execute on function public.guest_check_in(text, text, text, text, text, text, text, text, text, text, date, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
