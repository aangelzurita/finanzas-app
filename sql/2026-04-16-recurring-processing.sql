alter table public.recurring_charges
add column if not exists last_processed_charge_date date null;

alter table public.transactions
add column if not exists related_recurring_charge_id uuid null references public.recurring_charges(id) on delete set null,
add column if not exists recurring_charge_run_date date null;

create index if not exists idx_transactions_related_recurring_charge
on public.transactions(related_recurring_charge_id);

create unique index if not exists idx_transactions_recurring_charge_run_unique
on public.transactions(related_recurring_charge_id, recurring_charge_run_date)
where related_recurring_charge_id is not null and recurring_charge_run_date is not null;
