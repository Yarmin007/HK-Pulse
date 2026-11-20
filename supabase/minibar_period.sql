-- Minibar counts belong to an inventory PERIOD (e.g. '2026-10'), not to the day they were typed in.
-- Without this, a count done on 1 November for the October inventory landed in November.
-- Run once in Supabase → SQL Editor. Safe to run again.
alter table hsk_villa_minibar_inventory add column if not exists month_period text;

-- Existing counts: the month they were logged in (Maldives time), which is what the app used so far
update hsk_villa_minibar_inventory
   set month_period = to_char(logged_at at time zone 'Indian/Maldives', 'YYYY-MM')
 where month_period is null;

create index if not exists hsk_villa_minibar_inventory_period on hsk_villa_minibar_inventory(month_period);

-- Two test counts left by the app's simulation (dated January 2000; the app can't delete counts)
delete from hsk_villa_minibar_inventory where logged_at < '2001-01-01' and villa_number in ('11', '12');
