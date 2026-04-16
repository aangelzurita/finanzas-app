alter table public.credit_card_installments
add column if not exists last_processed_installment_number integer not null default 0 check (last_processed_installment_number >= 0),
add column if not exists last_charge_date date null,
add column if not exists category_id uuid null references public.categories(id) on delete set null;

update public.credit_card_installments
set
  last_processed_installment_number = greatest(0, current_installment_number - 1),
  remaining_installments = greatest(0, total_months - greatest(0, current_installment_number - 1))
where last_processed_installment_number = 0;

alter table public.transactions
add column if not exists related_installment_id uuid null references public.credit_card_installments(id) on delete set null,
add column if not exists installment_sequence integer null check (installment_sequence is null or installment_sequence > 0);

create index if not exists idx_transactions_related_installment
on public.transactions(related_installment_id);

create unique index if not exists idx_transactions_installment_sequence_unique
on public.transactions(related_installment_id, installment_sequence)
where related_installment_id is not null and installment_sequence is not null;
