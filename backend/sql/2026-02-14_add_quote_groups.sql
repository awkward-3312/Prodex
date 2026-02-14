create table if not exists public.quote_groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  created_by uuid,
  status text default 'draft',
  price_final numeric default 0,
  isv_amount numeric default 0,
  total numeric default 0,
  approved_by uuid,
  approved_at timestamptz,
  approved_reason text
);

create table if not exists public.quote_group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.quote_groups(id) on delete cascade,
  product_id uuid references public.products(id),
  template_id uuid,
  position int,
  inputs jsonb,
  apply_isv boolean default false,
  isv_rate numeric default 0.15,
  suggested_price numeric,
  price_final numeric,
  isv_amount numeric,
  total numeric,
  discount_pct numeric,
  discount_type text,
  discount_reason text,
  discount_season text,
  created_at timestamptz default now()
);

create table if not exists public.quote_group_lines (
  id uuid primary key default gen_random_uuid(),
  group_item_id uuid references public.quote_group_items(id) on delete cascade,
  supply_id uuid,
  supply_name text,
  unit_base text,
  qty numeric,
  cost_per_unit numeric,
  line_cost numeric,
  qty_formula text
);

create index if not exists quote_group_items_group_id_idx
  on public.quote_group_items(group_id);

create index if not exists quote_group_lines_item_id_idx
  on public.quote_group_lines(group_item_id);
