alter table quotes
  add column if not exists customer_id uuid references customers(id);

alter table quote_groups
  add column if not exists customer_id uuid references customers(id);

create index if not exists quotes_customer_id_idx on quotes (customer_id);
create index if not exists quote_groups_customer_id_idx on quote_groups (customer_id);
