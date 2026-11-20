-- Villa attendant daily tasks (My Tasks): the "done" ticks for milk, ice and guest preferences.
-- (Requests from the Requests page are ticked on the request itself, as "delivered".)
-- Run once in Supabase → SQL Editor.
create table if not exists hsk_va_task_done (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  villa_number text not null,
  task_key text not null,          -- 'milk', 'ice', 'pref:<id>'
  label text,                      -- what it was, as shown to the VA
  host_id text,
  host_name text,
  done_at timestamptz not null default now(),
  unique (report_date, villa_number, task_key)
);
create index if not exists hsk_va_task_done_date on hsk_va_task_done(report_date);

alter table hsk_va_task_done enable row level security;
drop policy if exists "va task done all" on hsk_va_task_done;
create policy "va task done all" on hsk_va_task_done for all using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table hsk_va_task_done;
exception when duplicate_object then null; end $$;
