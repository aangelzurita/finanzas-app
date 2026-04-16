create table if not exists public.credit_card_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards(id) on delete cascade,
  category_id uuid null references public.categories(id) on delete set null,
  description text not null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  monthly_amount numeric(14,2) not null check (monthly_amount > 0),
  total_months integer not null check (total_months > 0),
  current_installment_number integer not null check (current_installment_number > 0),
  remaining_installments integer not null check (remaining_installments >= 0),
  charge_day integer not null check (charge_day between 1 and 31),
  start_date date not null,
  notes text null,
  status text not null default 'active' check (status in ('active', 'completed', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_credit_card_installments_user on public.credit_card_installments(user_id);
create index if not exists idx_credit_card_installments_card on public.credit_card_installments(credit_card_id);
create index if not exists idx_credit_card_installments_status on public.credit_card_installments(status);

drop trigger if exists trg_credit_card_installments_updated_at on public.credit_card_installments;
create trigger trg_credit_card_installments_updated_at
before update on public.credit_card_installments
for each row
execute function public.set_updated_at();
