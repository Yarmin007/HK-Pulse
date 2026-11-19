-- Pantry Supply: villa attendants (or the PA on duty) tick what their pantry needs, the houseman /
-- store / supervisor packs it and hands it to a runner. Run once in Supabase → SQL Editor.

-- 1. The preset list attendants tick from (mostly Master Catalog items, plus custom ones)
create table if not exists hsk_pantry_items (
  id uuid primary key default gen_random_uuid(),
  article_number text,                 -- Master Catalog item, or null for a custom item
  name text not null,
  unit text,
  image_url text,
  category text not null default 'General',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. One list per pantry per supply date ('Scheduled' = its supply day, 'Extra' = urgent on another day)
create table if not exists hsk_pantry_requests (
  id uuid primary key default gen_random_uuid(),
  pantry text not null,                -- 'Jetty A Pantry', 'Jetty B Pantry', 'Jetty C Pantry', 'Beach Pantry'
  supply_date date not null,
  kind text not null default 'Scheduled',
  status text not null default 'Open', -- Open → Packed → With runner → Delivered
  notes text,
  packed_by text,
  packed_at timestamptz,
  runner_id uuid,
  runner_name text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pantry, supply_date, kind)
);

-- 3. What was asked for (no quantities) and by whom
create table if not exists hsk_pantry_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references hsk_pantry_requests(id) on delete cascade,
  item_id uuid references hsk_pantry_items(id) on delete set null,
  name text not null,
  is_custom boolean not null default false,  -- typed in ("something else")
  requested_by_id text,
  requested_by_name text,
  status text not null default 'Needed',     -- Needed | Packed | Not available
  created_at timestamptz not null default now()
);
create index if not exists hsk_pantry_request_lines_request on hsk_pantry_request_lines(request_id);
create index if not exists hsk_pantry_requests_date on hsk_pantry_requests(supply_date);

-- Same open access as the other hsk_ tables (the app uses the anon key)
alter table hsk_pantry_items enable row level security;
alter table hsk_pantry_requests enable row level security;
alter table hsk_pantry_request_lines enable row level security;
drop policy if exists "pantry items all" on hsk_pantry_items;
drop policy if exists "pantry requests all" on hsk_pantry_requests;
drop policy if exists "pantry lines all" on hsk_pantry_request_lines;
create policy "pantry items all" on hsk_pantry_items for all using (true) with check (true);
create policy "pantry requests all" on hsk_pantry_requests for all using (true) with check (true);
create policy "pantry lines all" on hsk_pantry_request_lines for all using (true) with check (true);

-- Live updates on the board
do $$ begin
  alter publication supabase_realtime add table hsk_pantry_requests;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table hsk_pantry_request_lines;
exception when duplicate_object then null; end $$;
