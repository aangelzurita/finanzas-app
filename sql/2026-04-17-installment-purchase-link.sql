alter table public.credit_card_installments
add column if not exists purchase_transaction_id uuid null references public.transactions(id) on delete set null;

create index if not exists idx_credit_card_installments_purchase_transaction
on public.credit_card_installments(purchase_transaction_id);
