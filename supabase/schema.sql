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

create index if not exists parking_records_status_idx   on public.parking_records (status, checkout_at);
create index if not exists parking_records_arrival_idx  on public.parking_records (arrival_at);
create index if not exists parking_records_plate_idx    on public.parking_records (license_plate);

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
