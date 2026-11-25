-- Update 2: confirmation numbers + faster customer look-up.
-- If you already ran schema.sql before this update, run this file once in
-- Supabase: SQL Editor > New query > paste > Run. (Running schema.sql again also works.)
alter table public.parking_records add column if not exists confirmation_number text;
create index if not exists parking_records_name_idx on public.parking_records (lower(guest_name));
create index if not exists parking_records_conf_idx on public.parking_records (confirmation_number);
