alter table public.recurring_charges
add column if not exists affects_cash boolean not null default true;

create index if not exists idx_recurring_charges_affects_cash
on public.recurring_charges(affects_cash);
