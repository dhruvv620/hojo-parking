-- Update 8: security hardening.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run more than once.
-- (Needs updates 2 to 7 first.)
--
-- What it does:
--  1. Only approved staff can see or change data. Every account that exists
--     when you run this is approved automatically; accounts made later must be
--     approved in the app (account menu > Staff). On a brand-new setup the very
--     first account is approved automatically.
--  2. The Stay history can no longer be edited or faked by anyone, only added
--     to by the database itself (unpaid -> paid goes through one safe function).
--  3. The guest check-in form gets per-device and overall limits, length limits,
--     duplicate protection, and a safer reservation match.
--  4. Privileged functions get a locked search path; new secret codes use a
--     cryptographically strong random generator.

-- 1. Staff allowlist ----------------------------------------------------------
create table if not exists public.staff (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  email    text,
  added_at timestamptz not null default now(),
  added_by text
);
alter table public.staff enable row level security;

-- everyone who already has an account keeps working
insert into public.staff (user_id, email, added_by)
select id, email, 'existing account' from auth.users
on conflict (user_id) do nothing;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (select 1 from staff where user_id = auth.uid());
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated;

-- a brand-new setup: the first account ever made becomes staff
create or replace function public.staff_first_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from staff) then
    insert into staff (user_id, email, added_by) values (new.id, new.email, 'first account');
  end if;
  return new;
end;
$$;
drop trigger if exists staff_first_user on auth.users;
create trigger staff_first_user after insert on auth.users
  for each row execute function public.staff_first_user();

-- staff can see the list of accounts (approved and waiting)
create or replace function public.staff_list()
returns table (user_id uuid, email text, approved boolean, created_at timestamptz, last_sign_in_at timestamptz, added_by text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  return query
    select u.id, u.email::text, s.user_id is not null, u.created_at, u.last_sign_in_at, s.added_by
      from auth.users u left join staff s on s.user_id = u.id
     order by (s.user_id is null) desc, u.created_at;
end;
$$;

-- approve (p_on = true) or remove (false) an account
create or replace function public.staff_set(p_user uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me text := (select email from auth.users where id = auth.uid());
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  if p_on then
    insert into staff (user_id, email, added_by)
    select id, email, coalesce(me, 'staff') from auth.users where id = p_user
    on conflict (user_id) do nothing;
  else
    if p_user = auth.uid() then
      raise exception 'You can''t remove your own access.';
    end if;
    delete from staff where user_id = p_user;
  end if;
end;
$$;
revoke all on function public.staff_list() from public, anon;
revoke all on function public.staff_set(uuid, boolean) from public, anon;
grant execute on function public.staff_list() to authenticated;
grant execute on function public.staff_set(uuid, boolean) to authenticated;

drop policy if exists "staff can see staff" on public.staff;
create policy "staff can see staff" on public.staff for select to authenticated using (public.is_staff());

-- 2. Every table: approved staff only ----------------------------------------
drop policy if exists "staff can read"   on public.parking_records;
drop policy if exists "staff can add"    on public.parking_records;
drop policy if exists "staff can edit"   on public.parking_records;
drop policy if exists "staff can delete" on public.parking_records;
create policy "staff can read"   on public.parking_records for select to authenticated using (public.is_staff());
create policy "staff can add"    on public.parking_records for insert to authenticated with check (public.is_staff());
create policy "staff can edit"   on public.parking_records for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff can delete" on public.parking_records for delete to authenticated using (public.is_staff());

-- Stay history: read only. Rows are written by the database (trigger below).
drop policy if exists "staff can read log"  on public.stay_changes;
drop policy if exists "staff can add log"   on public.stay_changes;
drop policy if exists "staff can mark paid" on public.stay_changes;
create policy "staff can read log" on public.stay_changes for select to authenticated using (public.is_staff());

-- the history trigger writes with its own rights, so nobody needs insert rights
alter function public.parking_records_log_changes() security definer;
alter function public.parking_records_log_changes() set search_path = public, pg_temp;

-- unpaid -> paid is the only change allowed to a history row
create or replace function public.mark_change_paid(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  update stay_changes set payment = 'paid', paid_marked_at = now()
   where id = p_id and payment = 'unpaid';
end;
$$;
revoke all on function public.mark_change_paid(uuid) from public, anon;
grant execute on function public.mark_change_paid(uuid) to authenticated;

-- Settings: staff can read; the only thing changed directly is the backup URL.
drop policy if exists "staff can read settings"   on public.app_settings;
drop policy if exists "staff can change settings" on public.app_settings;
create policy "staff can read settings" on public.app_settings for select to authenticated using (public.is_staff());
create policy "staff can change settings" on public.app_settings for update to authenticated
  using (public.is_staff() and key = 'backup_url')
  with check (public.is_staff() and key = 'backup_url'
              and (value = '' or value ~ '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec\?key=[A-Za-z0-9]+$'));

-- new QR code (old one stops working); strong random code from the database
create or replace function public.rotate_checkin_token()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t text := replace(gen_random_uuid()::text, '-', '');
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  update app_settings set value = t, updated_at = now() where key = 'checkin_token';
  return t;
end;
$$;
revoke all on function public.rotate_checkin_token() from public, anon;
grant execute on function public.rotate_checkin_token() to authenticated;

-- 3. Records: who created a record and when can't be rewritten ----------------
create or replace function public.parking_records_keep_created()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  return new;
end;
$$;
drop trigger if exists parking_records_keep_created on public.parking_records;
create trigger parking_records_keep_created before update on public.parking_records
  for each row execute function public.parking_records_keep_created();

-- 4. Backup functions: approved staff only ------------------------------------
create or replace function public.backup_full()
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n_cars int;
  n_changes int;
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  if coalesce((select value from app_settings where key = 'backup_url'), '') = '' then
    raise exception 'NO_BACKUP: Connect a Google Sheet first.';
  end if;
  select count(*) into n_cars from parking_records;
  select count(*) into n_changes from stay_changes;
  perform backup_send(jsonb_build_object(
    'kind', 'full',
    'cars', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from parking_records p), '[]'::jsonb),
    'changes', coalesce((select jsonb_agg(to_jsonb(s) order by s.changed_at) from stay_changes s), '[]'::jsonb)
  ));
  update app_settings set value = now()::text, updated_at = now() where key = 'backup_last_full';
  return json_build_object('cars', n_cars, 'changes', n_changes);
end;
$$;

create or replace function public.backup_test()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    raise exception 'Staff only';
  end if;
  perform backup_send(jsonb_build_object('kind', 'test', 'at', now()));
end;
$$;

alter function public.backup_send(jsonb) set search_path = public, pg_temp;
alter function public.backup_car_trigger() set search_path = public, pg_temp;
alter function public.backup_change_trigger() set search_path = public, pg_temp;
alter function public.guest_lot_info(text) set search_path = public, pg_temp;

-- 5. Guest check-in: limits, duplicates, safer reservation match -------------
-- Every attempt (even failed ones) is counted, per device and overall.
create table if not exists public.guest_checkin_attempts (
  id bigserial primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists guest_checkin_attempts_at_idx on public.guest_checkin_attempts (at);
alter table public.guest_checkin_attempts enable row level security;  -- no policies: private

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
  p_website text default null  -- hidden spam trap; real people leave it empty
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
      'checkout_at', dup.checkout_at, 'matched_reservation', false, 'already', true);
  end if;

  -- where to park: trucks in Lot 2; cars and SUVs in Lot 1, or Lot 3 if Lot 1 is full
  if p_vehicle_type = 'truck' then
    chosen := 'lot2';
  else
    select count(*) into used from parking_records
     where status = 'parked' and location = 'inside' and checkout_at > now();
    chosen := case when used < lot_capacity() then 'lot1' else 'lot3' end;
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
          vehicle_type = p_vehicle_type, license_plate = p_plate, plate_state = nullif(p_state, ''),
          make = p_make, model = p_model, color = nullif(p_color, ''),
          phone = coalesce(nullif(p_phone, ''), phone)
        where id = res_id
        returning id into rec_id;
      else
        insert into parking_records (
          guest_name, phone, source, vehicle_type, license_plate, plate_state, make, model, color,
          confirmation_number, lot, status, arrival_at, days, created_by, updated_by)
        values (
          p_name, nullif(p_phone, ''), 'guest_form', p_vehicle_type, p_plate, nullif(p_state, ''),
          p_make, p_model, nullif(p_color, ''), nullif(p_confirmation, ''), chosen, 'parked', now(), n_days, null, null)
        returning id into rec_id;
      end if;
      exit save;
    exception when others then
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

revoke all on function public.guest_check_in(text, text, text, text, text, text, text, text, text, text, date, text) from public;
grant execute on function public.guest_check_in(text, text, text, text, text, text, text, text, text, text, date, text) to anon, authenticated;

notify pgrst, 'reload schema';
