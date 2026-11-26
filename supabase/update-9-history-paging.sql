-- Update 9: fast History paging and sorting.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run more than once.
-- Until this is run, the History page still works ("Left" sorts by planned check-out).

-- When the car left: the early check-out time, or the planned check-out time.
-- The database keeps it up to date by itself.
alter table public.parking_records
  add column if not exists left_at timestamptz
  generated always as (
    case
      when status = 'checked_out' then checked_out_at
      when status = 'parked' then checkout_at
    end
  ) stored;

-- Indexes so each History page loads quickly however many records there are.
create index if not exists parking_records_left_idx    on public.parking_records (left_at desc, id);
create index if not exists parking_records_arrival2_idx on public.parking_records (arrival_at desc, id);
create index if not exists parking_records_name2_idx   on public.parking_records (guest_name, id);
create index if not exists parking_records_lot_idx     on public.parking_records (lot, arrival_at desc);

notify pgrst, 'reload schema';
