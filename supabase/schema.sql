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
  if new.spot_x is distinct from old.spot_x or new.spot_y is distinct from old.spot_y then changed := array_append(changed, 'map pin'::text); end if;

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
