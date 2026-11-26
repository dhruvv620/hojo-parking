-- Update 7: automatic backup to a Google Sheet.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run more than once.
-- (Needs update 6 first.) Then connect the sheet from the app: account menu > Backup.

-- pg_net lets the database send web requests (Supabase includes it).
create extension if not exists pg_net;

-- Where to send backups (set from the app's Backup page). Empty = backup off.
insert into public.app_settings (key, value) values ('backup_url', '') on conflict (key) do nothing;
insert into public.app_settings (key, value)
values ('backup_key', substr(md5(random()::text || clock_timestamp()::text), 1, 24))
on conflict (key) do nothing;
insert into public.app_settings (key, value) values ('backup_last_full', '') on conflict (key) do nothing;

-- Send one message to the Google Sheet. Never lets a backup problem stop a save.
create or replace function public.backup_send(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target text;
begin
  select value into target from app_settings where key = 'backup_url';
  if coalesce(target, '') = '' then
    return;
  end if;
  perform net.http_post(
    url := target,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'backup_send failed: %', sqlerrm;
end;
$$;

-- Every new, changed or deleted car goes to the "Cars" tab.
create or replace function public.backup_car_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform backup_send(jsonb_build_object(
    'kind', 'car',
    'op', tg_op,
    'record', to_jsonb(case when tg_op = 'DELETE' then old else new end)
  ));
  return null;
end;
$$;

drop trigger if exists backup_parking_records on public.parking_records;
create trigger backup_parking_records
  after insert or update or delete on public.parking_records
  for each row execute function public.backup_car_trigger();

-- Every Stay history entry goes to the "Stay history" tab.
create or replace function public.backup_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform backup_send(jsonb_build_object('kind', 'change', 'op', tg_op, 'record', to_jsonb(new)));
  return null;
end;
$$;

drop trigger if exists backup_stay_changes on public.stay_changes;
create trigger backup_stay_changes
  after insert or update on public.stay_changes
  for each row execute function public.backup_change_trigger();

-- "Send everything now": rewrites both tabs with all data (used when first
-- connecting the sheet, or any time you want a fresh full copy).
create or replace function public.backup_full()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  n_cars int;
  n_changes int;
begin
  if auth.uid() is null then
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

-- "Send test": one small message so you can see the sheet is connected.
create or replace function public.backup_test()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Staff only';
  end if;
  perform backup_send(jsonb_build_object('kind', 'test', 'at', now()));
end;
$$;

revoke all on function public.backup_send(jsonb) from public, anon, authenticated;
revoke all on function public.backup_full() from public, anon;
revoke all on function public.backup_test() from public, anon;
grant execute on function public.backup_full() to authenticated;
grant execute on function public.backup_test() to authenticated;

notify pgrst, 'reload schema';
