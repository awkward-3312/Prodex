-- Customers directory for admin-only view
create extension if not exists pgcrypto;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rtn text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists customers_name_idx on customers (name);
create index if not exists customers_email_idx on customers (email);
