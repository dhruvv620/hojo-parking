-- Update 13: device log and "Remove device".
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run more than once.
-- (Or just run schema.sql, which includes everything.)
--
-- Every phone/computer that uses the app gets a random device ID (saved in its
-- browser) and sends it with each request. The database keeps a log of devices
-- and blocks any device that was removed. A device that sends no ID (e.g. the
-- app version from before this update) is not affected.

create table if not exists public.devices (
  id          uuid primary key default gen_random_uuid(),
  device_key  text not null unique check (length(device_key) between 16 and 64),
  user_id     uuid references auth.users (id) on delete set null,
  user_email  text,
  name        text check (length(name) <= 40),        -- set by staff, e.g. "Front desk PC"
  label       text check (length(label) <= 60),       -- e.g. "Chrome on Windows"
  user_agent  text check (length(user_agent) <= 400),
  first_ip    text,
  last_ip     text,
  country     text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  sign_ins    int not null default 1,
  removed_at  timestamptz,
  removed_by  text
);
create index if not exists devices_last_seen_idx on public.devices (last_seen desc);
alter table public.devices enable row level security;

-- The hotel's internet address, to tell "at the hotel" from "outside".
insert into public.app_settings (key, value) values ('hotel_ip', '') on conflict (key) do nothing;

-- Which device made this request (from the x-device-id header).
create or replace function public.current_device_key()
returns text
language sql
stable
as $$
  select nullif(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-device-id', '')
$$;

create or replace function public.current_device_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(name, label) from devices where device_key = public.current_device_key()
$$;

create or replace function public.request_ip()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'cf-connecting-ip', ''),
    nullif(trim(split_part(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-forwarded-for', ',', 1)), ''))
$$;

-- Staff only, and never from a removed device.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and exists (select 1 from staff where user_id = auth.uid())
     and not exists (select 1 from devices where device_key = public.current_device_key() and removed_at is not null);
$$;

-- Called by the app when it opens and every minute: records the device and
-- says whether it has been removed.
create or replace function public.register_device(p_label text, p_user_agent text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k text := public.current_device_key();
  ip text := public.request_ip();
  ctry text := nullif(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'cf-ipcountry', '');
  d devices;
  hotel text := (select value from app_settings where key = 'hotel_ip');
begin
  if auth.uid() is null or not exists (select 1 from staff where user_id = auth.uid()) then
    return json_build_object('ok', false, 'reason', 'not_staff');
  end if;
  if k is null or length(k) < 16 or length(k) > 64 then
    return json_build_object('ok', false, 'reason', 'no_device');
  end if;

  select * into d from devices where device_key = k;
  if found and d.removed_at is not null then
    return json_build_object('ok', false, 'reason', 'removed', 'removed_at', d.removed_at);
  end if;

  if not found then
    insert into devices (device_key, user_id, user_email, label, user_agent, first_ip, last_ip, country)
    values (k, auth.uid(), (select email from auth.users where id = auth.uid()),
            left(nullif(trim(p_label), ''), 60), left(p_user_agent, 400), ip, ip, ctry)
    returning * into d;
  else
    update devices set
      last_seen = now(),
      last_ip = coalesce(ip, last_ip),
      country = coalesce(ctry, country),
      label = coalesce(left(nullif(trim(p_label), ''), 60), label),
      user_agent = coalesce(left(p_user_agent, 400), user_agent),
      user_id = auth.uid(),
      -- a new sign-in = first time seen in more than 12 hours
      sign_ins = sign_ins + case when last_seen < now() - interval '12 hours' then 1 else 0 end
    where id = d.id
    returning * into d;
  end if;

  return json_build_object('ok', true, 'id', d.id, 'at_hotel', coalesce(hotel, '') <> '' and d.last_ip = hotel);
end;
$$;

-- Remove a device (it is blocked straight away) or bring it back.
create or replace function public.set_device_removed(p_id uuid, p_removed boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  if p_removed and exists (select 1 from devices where id = p_id and device_key = public.current_device_key()) then
    raise exception 'You can''t remove the device you are using right now.';
  end if;
  update devices set
    removed_at = case when p_removed then now() end,
    removed_by = case when p_removed then coalesce(public.current_device_name(), public.current_staff_email(), 'staff') end
  where id = p_id;
end;
$$;

-- Give a device a name like "Front desk PC".
create or replace function public.rename_device(p_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  update devices set name = left(nullif(trim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', ' ', 'g')), ''), 40) where id = p_id;
end;
$$;

-- "This is the hotel's network": remember the internet address this request comes from.
create or replace function public.set_hotel_network()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ip text := public.request_ip();
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  if ip is null then
    raise exception 'Could not tell this network''s address.';
  end if;
  update app_settings set value = ip, updated_at = now() where key = 'hotel_ip';
  return ip;
end;
$$;

revoke all on function public.register_device(text, text) from public, anon;
revoke all on function public.set_device_removed(uuid, boolean) from public, anon;
revoke all on function public.rename_device(uuid, text) from public, anon;
revoke all on function public.set_hotel_network() from public, anon;
revoke all on function public.current_device_name() from public, anon;
grant execute on function public.register_device(text, text) to authenticated;
grant execute on function public.set_device_removed(uuid, boolean) to authenticated;
grant execute on function public.rename_device(uuid, text) to authenticated;
grant execute on function public.set_hotel_network() to authenticated;
grant execute on function public.current_device_name() to authenticated;

-- staff can read the device list; changes only through the functions above
drop policy if exists "staff can read devices" on public.devices;
create policy "staff can read devices" on public.devices for select to authenticated using (public.is_staff());

-- Stay history also records which device made each change.
alter table public.stay_changes add column if not exists changed_by_device text;

create or replace function public.parking_records_log_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dev text := public.current_device_name();
  k text;
  changed text[] := '{}';
  dates_changed boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.stay_changes (record_id, kind, new_arrival_at, new_days, new_checkout_at, new_location, changed_by_email, changed_by_device)
    values (new.id, case when new.status = 'reserved' then 'reserved' else 'created' end,
            new.arrival_at, new.days, new.checkout_at, coalesce(new.lot, new.location), public.current_staff_email(), dev);
    return null;
  end if;

  dates_changed := new.days is distinct from old.days or new.arrival_at is distinct from old.arrival_at;

  if new.status is distinct from old.status then
    k := case
      when old.status = 'reserved' and new.status = 'parked' then 'arrived'
      when new.status = 'checked_out' then 'checked_out'
      when new.status = 'cancelled' then 'cancelled'
      when old.status = 'cancelled' then 'restored'
      when old.status = 'checked_out' then 'reopened'
      else 'edited' end;
  elsif dates_changed then
    k := case
      when new.arrival_at is distinct from old.arrival_at and new.days = old.days then 'dates_changed'
      when new.checkout_at > old.checkout_at then 'extended'
      when new.checkout_at < old.checkout_at then 'shortened'
      else 'dates_changed' end;
  elsif new.lot is distinct from old.lot or new.location is distinct from old.location then
    k := 'moved';
  end if;

  if new.guest_name    is distinct from old.guest_name    then changed := array_append(changed, 'name'::text); end if;
  if new.license_plate is distinct from old.license_plate then changed := array_append(changed, 'plate'::text); end if;
  if new.plate_state   is distinct from old.plate_state   then changed := array_append(changed, 'state'::text); end if;
  if new.make          is distinct from old.make          then changed := array_append(changed, 'make'::text); end if;
  if new.model         is distinct from old.model         then changed := array_append(changed, 'model'::text); end if;
  if new.color         is distinct from old.color         then changed := array_append(changed, 'color'::text); end if;
  if new.phone         is distinct from old.phone         then changed := array_append(changed, 'phone'::text); end if;
  if new.room_number   is distinct from old.room_number   then changed := array_append(changed, 'room'::text); end if;
  if new.confirmation_number is distinct from old.confirmation_number then changed := array_append(changed, 'confirmation #'::text); end if;
  if new.vehicle_type is distinct from old.vehicle_type then changed := array_append(changed, 'vehicle type'::text); end if;
  if new.notes         is distinct from old.notes         then changed := array_append(changed, 'notes'::text); end if;
  if new.spot_x is distinct from old.spot_x or new.spot_y is distinct from old.spot_y or new.spot_map is distinct from old.spot_map then changed := array_append(changed, 'map pin'::text); end if;

  if k is null and cardinality(changed) > 0 then k := 'edited'; end if;
  if k is null and new.change_note is not null then k := 'note'; end if;

  if k is not null then
    insert into public.stay_changes (
      record_id, kind, old_arrival_at, old_days, old_checkout_at, new_arrival_at, new_days, new_checkout_at,
      old_location, new_location, details, payment, amount, note, changed_by_email, changed_by_device)
    values (
      new.id, k, old.arrival_at, old.days, old.checkout_at, new.arrival_at, new.days, new.checkout_at,
      coalesce(old.lot, old.location), coalesce(new.lot, new.location),
      case when cardinality(changed) > 0 then 'Changed ' || array_to_string(changed, ', ') end,
      new.change_payment, new.change_amount, nullif(trim(new.change_note), ''), public.current_staff_email(), dev);
  end if;

  -- clear the one-time fields so they are never reused
  new.change_note := null;
  new.change_payment := null;
  new.change_amount := null;
  return new;
end;
$$;

notify pgrst, 'reload schema';
