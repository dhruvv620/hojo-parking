-- Update 3: Stay history log (extensions, payments, notes).
-- If you already ran schema.sql before this update, run this file once in
-- Supabase: SQL Editor > New query > paste > Run. Safe to run more than once.

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
