alter table public.supplies
  add column if not exists default_consumption numeric;

alter table public.supplies
  add column if not exists default_rounding text default 'none';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplies_default_rounding_check'
  ) then
    alter table public.supplies
      add constraint supplies_default_rounding_check
      check (default_rounding in ('none', 'ceil'));
  end if;
end $$;
