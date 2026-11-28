-- Update 14: manager PIN for risky actions, and payment on each stay (for receipts).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run more than once.
-- (Or just run schema.sql, which includes everything.) Run it right after merging the
-- matching app update: the PIN-protected actions only work once both are live.
--
-- Forgot the PIN? Run this in the SQL Editor, then set a new one on the Staff page:
--   update public.app_settings set value = '' where key = 'manager_pin';

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 1. Payment on each stay ---------------------------------------------------
alter table public.parking_records add column if not exists amount_paid numeric(10, 2) check (amount_paid >= 0 and amount_paid < 100000);
alter table public.parking_records add column if not exists payment_method text check (payment_method in ('cash', 'card', 'online', 'other'));

-- 2. Manager PIN ----------------------------------------------------------------
insert into public.app_settings (key, value) values ('manager_pin', '') on conflict (key) do nothing;

-- every PIN try (to lock after 5 wrong ones in 15 minutes); private
create table if not exists public.pin_attempts (
  id bigserial primary key,
  at timestamptz not null default now(),
  ok boolean not null
);
alter table public.pin_attempts enable row level security;

-- the PIN's scrambled form must never be readable by the app
drop policy if exists "staff can read settings" on public.app_settings;
create policy "staff can read settings" on public.app_settings for select to authenticated
  using (public.is_staff() and key <> 'manager_pin');
-- nothing in settings is changed directly any more (backup URL now goes through set_backup_url)
drop policy if exists "staff can change settings" on public.app_settings;

-- Checks the PIN. Returns null when OK, or a message to show.
-- (Returns instead of raising so wrong tries are still counted.)
create or replace function public.pin_problem(p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  h text := (select value from app_settings where key = 'manager_pin');
begin
  if coalesce(h, '') = '' then
    return null;  -- no PIN set yet: allowed (the Staff page asks you to set one)
  end if;
  delete from pin_attempts where at < now() - interval '1 day';
  if (select count(*) from pin_attempts where not ok and at > now() - interval '15 minutes') >= 5 then
    return 'Too many wrong PINs. Try again in 15 minutes.';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' or crypt(p_pin, h) <> h then
    insert into pin_attempts (ok) values (false);
    return 'Wrong PIN.';
  end if;
  insert into pin_attempts (ok) values (true);
  return null;
end;
$$;
revoke all on function public.pin_problem(text) from public, anon, authenticated;

create or replace function public.pin_status()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  return json_build_object(
    'set', coalesce((select value from app_settings where key = 'manager_pin'), '') <> '',
    'locked', (select count(*) from pin_attempts where not ok and at > now() - interval '15 minutes') >= 5);
end;
$$;

create or replace function public.set_manager_pin(p_old text, p_new text)
returns json
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  problem text;
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  problem := pin_problem(p_old);
  if problem is not null then
    return json_build_object('ok', false, 'error', problem);
  end if;
  if p_new is null or p_new !~ '^[0-9]{4,6}$' then
    return json_build_object('ok', false, 'error', 'The PIN must be 4 to 6 digits.');
  end if;
  update app_settings set value = crypt(p_new, gen_salt('bf', 8)), updated_at = now() where key = 'manager_pin';
  return json_build_object('ok', true);
end;
$$;

-- 3. Risky actions now need the PIN ------------------------------------------
-- Each returns {"ok": true} or {"ok": false, "error": "..."}.

-- delete a record (no longer possible directly)
drop policy if exists "staff can delete" on public.parking_records;
create or replace function public.delete_record(p_id uuid, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  problem text;
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  problem := pin_problem(p_pin);
  if problem is not null then
    return json_build_object('ok', false, 'error', problem);
  end if;
  delete from parking_records where id = p_id;
  return json_build_object('ok', true);
end;
$$;

-- remove / restore a device
drop function if exists public.set_device_removed(uuid, boolean);
create or replace function public.set_device_removed(p_id uuid, p_removed boolean, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  problem text;
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  if p_removed and exists (select 1 from devices where id = p_id and device_key = public.current_device_key()) then
    return json_build_object('ok', false, 'error', 'You can''t remove the device you are using right now.');
  end if;
  problem := pin_problem(p_pin);
  if problem is not null then
    return json_build_object('ok', false, 'error', problem);
  end if;
  update devices set
    removed_at = case when p_removed then now() end,
    removed_by = case when p_removed then coalesce(public.current_device_name(), public.current_staff_email(), 'staff') end
  where id = p_id;
  return json_build_object('ok', true);
end;
$$;

-- new QR code
drop function if exists public.rotate_checkin_token();
create or replace function public.rotate_checkin_token(p_pin text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t text := replace(gen_random_uuid()::text, '-', '');
  problem text;
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  problem := pin_problem(p_pin);
  if problem is not null then
    return json_build_object('ok', false, 'error', problem);
  end if;
  update app_settings set value = t, updated_at = now() where key = 'checkin_token';
  return json_build_object('ok', true, 'token', t);
end;
$$;

-- approve staff (no PIN) / remove staff (PIN)
drop function if exists public.staff_set(uuid, boolean);
create or replace function public.staff_set(p_user uuid, p_on boolean, p_pin text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me text := (select email from auth.users where id = auth.uid());
  problem text;
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  if p_on then
    insert into staff (user_id, email, added_by)
    select id, email, coalesce(me, 'staff') from auth.users where id = p_user
    on conflict (user_id) do nothing;
    return json_build_object('ok', true);
  end if;
  if p_user = auth.uid() then
    return json_build_object('ok', false, 'error', 'You can''t remove your own access.');
  end if;
  problem := pin_problem(p_pin);
  if problem is not null then
    return json_build_object('ok', false, 'error', problem);
  end if;
  delete from staff where user_id = p_user;
  return json_build_object('ok', true);
end;
$$;

-- connect / change / stop the Google Sheet backup
create or replace function public.set_backup_url(p_url text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  problem text;
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  if coalesce(p_url, '') <> '' and p_url !~ '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec\?key=[A-Za-z0-9]+$' then
    return json_build_object('ok', false, 'error', 'That isn''t a Google Apps Script web app URL.');
  end if;
  problem := pin_problem(p_pin);
  if problem is not null then
    return json_build_object('ok', false, 'error', problem);
  end if;
  update app_settings set value = coalesce(p_url, ''), updated_at = now() where key = 'backup_url';
  return json_build_object('ok', true);
end;
$$;

-- hotel network
drop function if exists public.set_hotel_network();
create or replace function public.set_hotel_network(p_pin text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ip text := public.request_ip();
  problem text;
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  if ip is null then
    return json_build_object('ok', false, 'error', 'Could not tell this network''s address.');
  end if;
  problem := pin_problem(p_pin);
  if problem is not null then
    return json_build_object('ok', false, 'error', problem);
  end if;
  update app_settings set value = ip, updated_at = now() where key = 'hotel_ip';
  return json_build_object('ok', true, 'ip', ip);
end;
$$;

revoke all on function public.pin_status() from public, anon;
revoke all on function public.set_manager_pin(text, text) from public, anon;
revoke all on function public.delete_record(uuid, text) from public, anon;
revoke all on function public.set_device_removed(uuid, boolean, text) from public, anon;
revoke all on function public.rotate_checkin_token(text) from public, anon;
revoke all on function public.staff_set(uuid, boolean, text) from public, anon;
revoke all on function public.set_backup_url(text, text) from public, anon;
revoke all on function public.set_hotel_network(text) from public, anon;
grant execute on function public.pin_status() to authenticated;
grant execute on function public.set_manager_pin(text, text) to authenticated;
grant execute on function public.delete_record(uuid, text) to authenticated;
grant execute on function public.set_device_removed(uuid, boolean, text) to authenticated;
grant execute on function public.rotate_checkin_token(text) to authenticated;
grant execute on function public.staff_set(uuid, boolean, text) to authenticated;
grant execute on function public.set_backup_url(text, text) to authenticated;
grant execute on function public.set_hotel_network(text) to authenticated;

-- 4. Stay history also notes payment changes ---------------------------------
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
  if new.amount_paid is distinct from old.amount_paid or new.payment_method is distinct from old.payment_method then changed := array_append(changed, 'payment'::text); end if;
  if new.notes         is distinct from old.notes         then changed := array_append(changed, 'notes'::text); end if;
  if new.spot_x is distinct from old.spot_x or new.spot_y is distinct from old.spot_y or new.spot_map is distinct from old.spot_map then changed := array_append(changed, 'map pin'::text); end if;

  if k is null and cardinality(changed) > 0 then k := 'edited'; end if;
  if k is null and new.change_note is not null then k := 'note'; end if;
  -- the Undo button on a toast puts things back; show that plainly
  if k is not null and new.change_note = 'Undo' then k := 'undone'; end if;

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

-- Undo of "Update stay": the payment logged with that change no longer applies.
-- Only the newest entry of the last 2 minutes, so it can't touch old history.
create or replace function public.void_last_payment(p_record uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  update stay_changes set payment = null, amount = null,
         details = concat_ws(' · ', details, 'Payment cancelled by Undo')
   where id = (select id from stay_changes where record_id = p_record order by changed_at desc limit 1)
     and changed_at > now() - interval '2 minutes'
     and payment is not null;
end;
$$;
revoke all on function public.void_last_payment(uuid) from public, anon;
grant execute on function public.void_last_payment(uuid) to authenticated;

notify pgrst, 'reload schema';
