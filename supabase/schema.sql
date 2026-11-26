-- Howard Johnson Parking Manager: database setup
-- Run this whole file once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to run again: it only creates things that do not exist yet and
-- replaces the functions/trigger.

-- 1. How many cars fit inside the fence.
--    If the lot size ever changes, change 67 here AND in src/lib/config.ts.
create or replace function public.lot_capacity()
returns int
language sql
immutable
as $$ select 67 $$;

-- 2. The parking book.
create table if not exists public.parking_records (
  id             uuid primary key default gen_random_uuid(),
  guest_name     text not null check (length(trim(guest_name)) > 0),
  phone          text,
  room_number    text,
  source         text not null default 'walk_in' check (source in ('walk_in', 'online')),
  license_plate  text not null check (length(trim(license_plate)) > 0),
  plate_state    text,
  make           text,
  model          text,
  color          text,
  -- inside  = inside the fence, counts toward the 67
  -- outside = parked outside the fence because the lot was full
  location       text not null default 'inside' check (location in ('inside', 'outside')),
  -- reserved    = future reservation, not here yet, takes no spot
  -- parked      = car is here (auto checks out when checkout_at passes)
  -- checked_out = checked out early by staff
  -- cancelled   = reservation that never came
  status         text not null default 'parked'
                 check (status in ('reserved', 'parked', 'checked_out', 'cancelled')),
  arrival_at     timestamptz not null default now(),
  days           int not null default 1 check (days between 1 and 365),
  -- always arrival_at + days x 24 hours, filled in by the trigger below
  checkout_at    timestamptz not null default now(),
  checked_out_at timestamptz,
  fence_told     boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_by     uuid default auth.uid()
);

-- Added later: confirmation number from online bookings, map pin.
-- Where the car is parked on the lot map (optional).
-- Stored as a position on the map picture: 0-100 from the left and from the top.
alter table public.parking_records add column if not exists spot_x numeric(5, 2) check (spot_x between 0 and 100);
alter table public.parking_records add column if not exists spot_y numeric(5, 2) check (spot_y between 0 and 100);
-- Which parking area the map pin is on: fenced (402/406 E Melvin St),
-- lot401 (401 E Melvin St) or hotel (behind the hotel, 4120 E Van Buren St).
alter table public.parking_records add column if not exists spot_map text;
update public.parking_records set spot_map = 'fenced' where spot_x is not null and spot_map is null;
-- confirmation number:
alter table public.parking_records add column if not exists confirmation_number text;

create index if not exists parking_records_status_idx   on public.parking_records (status, checkout_at);
create index if not exists parking_records_arrival_idx  on public.parking_records (arrival_at);
create index if not exists parking_records_plate_idx    on public.parking_records (license_plate);
create index if not exists parking_records_name_idx     on public.parking_records (lower(guest_name));
create index if not exists parking_records_conf_idx     on public.parking_records (confirmation_number);

-- 3. Before every save: clean up the plate, work out the check-out time,
--    and refuse to put a 68th car inside the fence.
create or replace function public.parking_records_before_save()
returns trigger
language plpgsql
as $$
declare
  inside_now int;
  newly_inside boolean;
begin
  new.license_plate := upper(regexp_replace(trim(new.license_plate), '\s+', ' ', 'g'));
  new.plate_state   := nullif(upper(trim(coalesce(new.plate_state, ''))), '');
  new.checkout_at   := new.arrival_at + make_interval(hours => new.days * 24);
  new.updated_at    := now();
  new.updated_by    := coalesce(auth.uid(), new.updated_by);

  if new.status = 'checked_out' and new.checked_out_at is null then
    new.checked_out_at := now();
  elsif new.status <> 'checked_out' then
    new.checked_out_at := null;
  end if;

  -- Only check the limit when this save makes the car take an inside spot
  -- it did not already have (so editing a parked car's name never fails).
  if new.status = 'parked' and new.location = 'inside' and new.checkout_at > now() then
    if tg_op = 'INSERT' then
      newly_inside := true;
    else
      newly_inside := not (old.status = 'parked' and old.location = 'inside' and old.checkout_at > now());
    end if;

    if newly_inside then
      -- one save at a time, so two desks cannot both take the last spot
      perform pg_advisory_xact_lock(67067);
      select count(*) into inside_now
        from public.parking_records
       where status = 'parked'
         and location = 'inside'
         and checkout_at > now()
         and id <> new.id;
      if inside_now >= public.lot_capacity() then
        raise exception 'LOT_FULL: all % inside spots are taken', public.lot_capacity()
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists parking_records_before_save on public.parking_records;
create trigger parking_records_before_save
  before insert or update on public.parking_records
  for each row execute function public.parking_records_before_save();

-- 4. Only logged-in staff can see or change anything.
alter table public.parking_records enable row level security;

drop policy if exists "staff can read"   on public.parking_records;
drop policy if exists "staff can add"    on public.parking_records;
drop policy if exists "staff can edit"   on public.parking_records;
drop policy if exists "staff can delete" on public.parking_records;

create policy "staff can read"   on public.parking_records for select to authenticated using (true);
create policy "staff can add"    on public.parking_records for insert to authenticated with check (true);
create policy "staff can edit"   on public.parking_records for update to authenticated using (true) with check (true);
create policy "staff can delete" on public.parking_records for delete to authenticated using (true);

-- 5. Live updates: when one desk adds a car, every open screen updates.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'parking_records'
  ) then
    alter publication supabase_realtime add table public.parking_records;
  end if;
end;
$$;

-- 6. Tell Supabase's API to pick up any new columns right away.
notify pgrst, 'reload schema';

-- 7. Stay history log (same as update-3-stay-history.sql)

-- Fields the app fills in with an update so the log can record WHY it changed.
-- They are cleared again straight away; the log keeps the values.
alter table public.parking_records add column if not exists change_note    text;
alter table public.parking_records add column if not exists change_payment text;
alter table public.parking_records add column if not exists change_amount  numeric(10, 2);

-- One row per change to a stay.
create table if not exists public.stay_changes (
  id             uuid primary key default gen_random_uuid(),
  record_id      uuid not null references public.parking_records (id) on delete cascade,
  changed_at     timestamptz not null default now(),
  changed_by     uuid default auth.uid(),
  changed_by_email text,
  -- created, arrived, extended, shortened, dates_changed, checked_out, reopened,
  -- cancelled, restored, moved, edited, note
  kind           text not null,
  old_arrival_at timestamptz,
  old_days       int,
  old_checkout_at timestamptz,
  new_arrival_at timestamptz,
  new_days       int,
  new_checkout_at timestamptz,
  old_location   text,
  new_location   text,
  details        text,
  -- paid / unpaid / free (null = not about money)
  payment        text check (payment in ('paid', 'unpaid', 'free')),
  amount         numeric(10, 2),
  note           text,
  paid_marked_at timestamptz
);
create index if not exists stay_changes_record_idx on public.stay_changes (record_id, changed_at desc);

-- Email of the staff member making the change (from their login).
create or replace function public.current_staff_email()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email'
$$;

-- Writes a log row for every meaningful change.
create or replace function public.parking_records_log_changes()
returns trigger
language plpgsql
as $$
declare
  k text;
  changed text[] := '{}';
  dates_changed boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.stay_changes (record_id, kind, new_arrival_at, new_days, new_checkout_at, new_location, changed_by_email)
    values (new.id, case when new.status = 'reserved' then 'reserved' else 'created' end,
            new.arrival_at, new.days, new.checkout_at, new.location, public.current_staff_email());
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
  elsif new.location is distinct from old.location then
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
  if new.notes         is distinct from old.notes         then changed := array_append(changed, 'notes'::text); end if;
  if new.spot_x is distinct from old.spot_x or new.spot_y is distinct from old.spot_y or new.spot_map is distinct from old.spot_map then changed := array_append(changed, 'map pin'::text); end if;

  if k is null and cardinality(changed) > 0 then k := 'edited'; end if;
  if k is null and new.change_note is not null then k := 'note'; end if;

  if k is not null then
    insert into public.stay_changes (
      record_id, kind, old_arrival_at, old_days, old_checkout_at, new_arrival_at, new_days, new_checkout_at,
      old_location, new_location, details, payment, amount, note, changed_by_email)
    values (
      new.id, k, old.arrival_at, old.days, old.checkout_at, new.arrival_at, new.days, new.checkout_at,
      old.location, new.location,
      case when cardinality(changed) > 0 then 'Changed ' || array_to_string(changed, ', ') end,
      new.change_payment, new.change_amount, nullif(trim(new.change_note), ''), public.current_staff_email());
  end if;

  -- clear the one-time fields so they are never reused
  new.change_note := null;
  new.change_payment := null;
  new.change_amount := null;
  return new;
end;
$$;

-- Runs after parking_records_before_save (triggers run in name order),
-- so check-out time is already worked out.
drop trigger if exists parking_records_log_update on public.parking_records;
create trigger parking_records_log_update
  before update on public.parking_records
  for each row execute function public.parking_records_log_changes();

drop trigger if exists parking_records_log_insert on public.parking_records;
create trigger parking_records_log_insert
  after insert on public.parking_records
  for each row execute function public.parking_records_log_changes();

-- Staff can read the log, add to it, and mark an unpaid change as paid.
-- Nobody can delete log rows (they go only when the whole record is deleted).
alter table public.stay_changes enable row level security;
drop policy if exists "staff can read log"   on public.stay_changes;
drop policy if exists "staff can add log"    on public.stay_changes;
drop policy if exists "staff can mark paid"  on public.stay_changes;
create policy "staff can read log"  on public.stay_changes for select to authenticated using (true);
create policy "staff can add log"   on public.stay_changes for insert to authenticated with check (true);
create policy "staff can mark paid" on public.stay_changes for update to authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stay_changes'
  ) then
    alter publication supabase_realtime add table public.stay_changes;
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- 8. Lots, vehicle type and guest self check-in (same as update-6-lots-and-guest-form.sql)

-- 1. New columns ----------------------------------------------------------
-- lot1 = fenced lot, 402/406 E Melvin St (Cars & SUVs, counts toward the limit)
-- lot2 = 401 E Melvin St (Trucks only)
-- lot3 = any vehicle
-- hotel = behind the hotel
alter table public.parking_records add column if not exists lot text check (lot in ('lot1', 'lot2', 'lot3', 'hotel'));
alter table public.parking_records add column if not exists vehicle_type text check (vehicle_type in ('car', 'suv', 'truck'));

-- guests who check themselves in are marked as such
alter table public.parking_records drop constraint if exists parking_records_source_check;
alter table public.parking_records add constraint parking_records_source_check
  check (source in ('walk_in', 'online', 'guest_form'));

-- 2. Keep lot and inside/outside in step, then the old checks still work ----
create or replace function public.parking_records_before_save()
returns trigger
language plpgsql
as $$
declare
  inside_now int;
  newly_inside boolean;
begin
  -- Lot decides inside/outside: only Lot 1 (the fenced lot) is "inside" and counts toward the limit.
  if new.lot is not null then
    new.location := case when new.lot = 'lot1' then 'inside' else 'outside' end;
  elsif new.location = 'inside' then
    new.lot := 'lot1';
  end if;

  new.license_plate := upper(regexp_replace(trim(new.license_plate), '\s+', ' ', 'g'));
  new.plate_state   := nullif(upper(trim(coalesce(new.plate_state, ''))), '');
  new.checkout_at   := new.arrival_at + make_interval(hours => new.days * 24);
  new.updated_at    := now();
  new.updated_by    := coalesce(auth.uid(), new.updated_by);

  if new.status = 'checked_out' and new.checked_out_at is null then
    new.checked_out_at := now();
  elsif new.status <> 'checked_out' then
    new.checked_out_at := null;
  end if;

  -- Only check the limit when this save makes the car take an inside spot
  -- it did not already have (so editing a parked car's name never fails).
  if new.status = 'parked' and new.location = 'inside' and new.checkout_at > now() then
    if tg_op = 'INSERT' then
      newly_inside := true;
    else
      newly_inside := not (old.status = 'parked' and old.location = 'inside' and old.checkout_at > now());
    end if;

    if newly_inside then
      -- one save at a time, so two desks cannot both take the last spot
      perform pg_advisory_xact_lock(67067);
      select count(*) into inside_now
        from public.parking_records
       where status = 'parked'
         and location = 'inside'
         and checkout_at > now()
         and id <> new.id;
      if inside_now >= public.lot_capacity() then
        raise exception 'LOT_FULL: all % inside spots are taken', public.lot_capacity()
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 3. Stay history also records lot and vehicle type changes -------------------
create or replace function public.parking_records_log_changes()
returns trigger
language plpgsql
as $$
declare
  k text;
  changed text[] := '{}';
  dates_changed boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.stay_changes (record_id, kind, new_arrival_at, new_days, new_checkout_at, new_location, changed_by_email)
    values (new.id, case when new.status = 'reserved' then 'reserved' else 'created' end,
            new.arrival_at, new.days, new.checkout_at, coalesce(new.lot, new.location), public.current_staff_email());
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
      old_location, new_location, details, payment, amount, note, changed_by_email)
    values (
      new.id, k, old.arrival_at, old.days, old.checkout_at, new.arrival_at, new.days, new.checkout_at,
      coalesce(old.lot, old.location), coalesce(new.lot, new.location),
      case when cardinality(changed) > 0 then 'Changed ' || array_to_string(changed, ', ') end,
      new.change_payment, new.change_amount, nullif(trim(new.change_note), ''), public.current_staff_email());
  end if;

  -- clear the one-time fields so they are never reused
  new.change_note := null;
  new.change_payment := null;
  new.change_amount := null;
  return new;
end;
$$;

-- 4. Move existing data to the new lot names (without filling the history) --
alter table public.parking_records disable trigger parking_records_log_update;
update public.parking_records set spot_map = 'lot1' where spot_map = 'fenced';
update public.parking_records set spot_map = 'lot2' where spot_map = 'lot401';
update public.parking_records set lot = 'lot1' where lot is null and location = 'inside';
update public.parking_records set lot = spot_map where lot is null and location = 'outside' and spot_map in ('lot2', 'lot3', 'hotel');
alter table public.parking_records enable trigger parking_records_log_update;

-- 5. Settings: the secret code inside the check-in QR code -------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "staff can read settings"   on public.app_settings;
drop policy if exists "staff can change settings" on public.app_settings;
create policy "staff can read settings"   on public.app_settings for select to authenticated using (true);
create policy "staff can change settings" on public.app_settings for update to authenticated using (true) with check (true);
insert into public.app_settings (key, value)
values ('checkin_token', substr(md5(random()::text || clock_timestamp()::text), 1, 16))
on conflict (key) do nothing;

-- 6. What the public check-in page may ask: is the code valid, and is Lot 1 full?
create or replace function public.guest_lot_info(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
  used int;
begin
  select exists (select 1 from app_settings where key = 'checkin_token' and value = p_token) into ok;
  if not ok then
    return json_build_object('ok', false);
  end if;
  select count(*) into used from parking_records
   where status = 'parked' and location = 'inside' and checkout_at > now();
  return json_build_object('ok', true, 'capacity', lot_capacity(), 'lot1_available', greatest(0, lot_capacity() - used));
end;
$$;

-- 7. The only thing the public check-in page can do: check a guest in -------
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
  p_website text default null  -- hidden spam trap; real people leave it empty
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Phoenix')::date;
  n_days int;
  chosen text;
  used int;
  rec_id uuid;
  res_id uuid;
  recent int;
begin
  if not exists (select 1 from app_settings where key = 'checkin_token' and value = p_token) then
    raise exception 'INVALID_LINK: This check-in link is no longer valid. Please ask the front desk.';
  end if;
  if coalesce(p_website, '') <> '' then
    raise exception 'INVALID: Could not submit.';
  end if;

  select count(*) into recent from parking_records
   where source = 'guest_form' and created_at > now() - interval '1 minute';
  if recent >= 10 then
    raise exception 'BUSY: Too many check-ins right now. Please wait a minute and try again.';
  end if;

  p_name  := trim(coalesce(p_name, ''));
  p_plate := trim(coalesce(p_plate, ''));
  p_make  := trim(coalesce(p_make, ''));
  p_model := trim(coalesce(p_model, ''));
  if length(p_name) < 2 or length(p_name) > 80 then raise exception 'CHECK: Please enter your full name.'; end if;
  if length(p_plate) < 2 or length(p_plate) > 12 then raise exception 'CHECK: Please enter your license plate.'; end if;
  if p_vehicle_type not in ('car', 'suv', 'truck') then raise exception 'CHECK: Please choose Car, SUV or Truck.'; end if;
  if p_make = '' or p_model = '' or length(p_make) > 40 or length(p_model) > 40 then
    raise exception 'CHECK: Please enter the make and model.';
  end if;
  n_days := p_checkout_date - today;
  if p_checkout_date is null or n_days < 1 or n_days > 60 then
    raise exception 'CHECK: Please pick a check-out date after today (up to 60 days).';
  end if;

  -- where to park: trucks in Lot 2; cars and SUVs in Lot 1, or Lot 3 if Lot 1 is full
  if p_vehicle_type = 'truck' then
    chosen := 'lot2';
  else
    select count(*) into used from parking_records
     where status = 'parked' and location = 'inside' and checkout_at > now();
    chosen := case when used < lot_capacity() then 'lot1' else 'lot3' end;
  end if;

  -- the Stay history shows who did it
  perform set_config('request.jwt.claims', json_build_object('email', 'Guest self check-in')::text, true);

  -- if they booked online and the confirmation # matches a waiting reservation, check that in
  if nullif(trim(coalesce(p_confirmation, '')), '') is not null then
    select id into res_id from parking_records
     where status = 'reserved' and lower(trim(confirmation_number)) = lower(trim(p_confirmation))
     order by arrival_at limit 1;
  end if;

  <<save>>
  loop
    begin
      if res_id is not null then
        update parking_records set
          status = 'parked', arrival_at = now(), days = n_days, lot = chosen,
          vehicle_type = p_vehicle_type, license_plate = p_plate, plate_state = nullif(trim(coalesce(p_state, '')), ''),
          make = p_make, model = p_model, color = nullif(trim(coalesce(p_color, '')), ''),
          phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone)
        where id = res_id
        returning id into rec_id;
      else
        insert into parking_records (
          guest_name, phone, source, vehicle_type, license_plate, plate_state, make, model, color,
          confirmation_number, lot, status, arrival_at, days, created_by, updated_by)
        values (
          p_name, nullif(trim(coalesce(p_phone, '')), ''), 'guest_form', p_vehicle_type, p_plate,
          nullif(trim(coalesce(p_state, '')), ''), p_make, p_model, nullif(trim(coalesce(p_color, '')), ''),
          nullif(trim(coalesce(p_confirmation, '')), ''), chosen, 'parked', now(), n_days, null, null)
        returning id into rec_id;
      end if;
      exit save;
    exception when others then
      -- Lot 1 filled up at this very moment: send them to Lot 3 instead
      if sqlerrm like 'LOT_FULL%' and chosen = 'lot1' then
        chosen := 'lot3';
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
    'matched_reservation', res_id is not null);
end;
$$;

revoke all on function public.guest_lot_info(text) from public;
revoke all on function public.guest_check_in(text, text, text, text, text, text, text, text, text, text, date, text) from public;
grant execute on function public.guest_lot_info(text) to anon, authenticated;
grant execute on function public.guest_check_in(text, text, text, text, text, text, text, text, text, text, date, text) to anon, authenticated;

notify pgrst, 'reload schema';
