alter table public.debts
add column if not exists next_payment_date date null;

alter table public.debts
add column if not exists payment_frequency text not null default 'monthly'
check (payment_frequency in ('one_time','weekly','biweekly','monthly','quarterly','yearly'));

alter table public.debts
add column if not exists payment_account_id uuid null references public.accounts(id) on delete set null;

create index if not exists idx_debts_next_payment_date
on public.debts(next_payment_date);

create index if not exists idx_debts_payment_account
on public.debts(payment_account_id);
