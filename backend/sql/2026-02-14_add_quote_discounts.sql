-- Add discount and approval fields to quotes
alter table quotes
  add column if not exists discount_pct numeric(5,2),
  add column if not exists discount_type text,
  add column if not exists discount_reason text,
  add column if not exists discount_season text,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_reason text;

-- Optional constraint to keep discount in valid range
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quotes_discount_pct_check'
  ) then
    alter table quotes
      add constraint quotes_discount_pct_check
      check (discount_pct is null or (discount_pct >= 0 and discount_pct < 100));
  end if;
end $$;

-- Indexes for performance
create index if not exists quotes_created_by_created_at_idx on quotes (created_by, created_at desc);
create index if not exists quotes_status_idx on quotes (status);
create index if not exists quote_lines_quote_id_idx on quote_lines (quote_id);
