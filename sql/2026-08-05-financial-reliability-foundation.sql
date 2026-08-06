alter table public.transactions
add column if not exists affects_statement boolean not null default true;

alter table public.transactions
add column if not exists related_income_schedule_id uuid null references public.income_schedules(id) on delete set null;

create index if not exists idx_transactions_affects_statement
on public.transactions(affects_statement);

create index if not exists idx_transactions_related_income_schedule
on public.transactions(related_income_schedule_id);

create table if not exists public.credit_card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards(id) on delete cascade,
  period_start_date date not null,
  period_end_date date not null,
  cutoff_date date not null,
  payment_due_date date not null,
  bank_no_interest_payment numeric(14,2) null check (bank_no_interest_payment is null or bank_no_interest_payment >= 0),
  bank_minimum_payment numeric(14,2) null check (bank_minimum_payment is null or bank_minimum_payment >= 0),
  app_no_interest_payment numeric(14,2) not null default 0 check (app_no_interest_payment >= 0),
  app_minimum_payment numeric(14,2) not null default 0 check (app_minimum_payment >= 0),
  normal_purchases numeric(14,2) not null default 0,
  msi_charges numeric(14,2) not null default 0,
  msi_purchase_totals_excluded numeric(14,2) not null default 0,
  refunds numeric(14,2) not null default 0,
  payments numeric(14,2) not null default 0,
  transaction_count integer not null default 0,
  balance_affecting_transaction_count integer not null default 0,
  informational_transaction_count integer not null default 0,
  ignored_transaction_count integer not null default 0,
  status text not null default 'confirmed' check (status in ('draft','reviewed','confirmed','paid','canceled')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (credit_card_id, cutoff_date)
);

create index if not exists idx_credit_card_statements_user
on public.credit_card_statements(user_id);

create index if not exists idx_credit_card_statements_card_cutoff
on public.credit_card_statements(credit_card_id, cutoff_date desc);

alter table public.credit_card_statements enable row level security;

drop policy if exists "credit_card_statements_select_own" on public.credit_card_statements;
create policy "credit_card_statements_select_own"
on public.credit_card_statements
for select
using (auth.uid() = user_id);

drop policy if exists "credit_card_statements_insert_own" on public.credit_card_statements;
create policy "credit_card_statements_insert_own"
on public.credit_card_statements
for insert
with check (auth.uid() = user_id);

drop policy if exists "credit_card_statements_update_own" on public.credit_card_statements;
create policy "credit_card_statements_update_own"
on public.credit_card_statements
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "credit_card_statements_delete_own" on public.credit_card_statements;
create policy "credit_card_statements_delete_own"
on public.credit_card_statements
for delete
using (auth.uid() = user_id);

drop trigger if exists trg_credit_card_statements_updated_at on public.credit_card_statements;
create trigger trg_credit_card_statements_updated_at
before update on public.credit_card_statements
for each row
execute function public.set_updated_at();

create table if not exists public.credit_card_statement_items (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.credit_card_statements(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  transaction_type text not null,
  transaction_date timestamptz not null,
  description text null,
  amount numeric(14,2) not null,
  affects_balance boolean not null default true,
  affects_statement boolean not null default true,
  item_role text not null check (item_role in ('normal_purchase','msi_total_excluded','msi_charge','refund','payment','other')),
  created_at timestamptz not null default now(),
  unique (statement_id, transaction_id)
);

create index if not exists idx_credit_card_statement_items_statement
on public.credit_card_statement_items(statement_id);

create index if not exists idx_credit_card_statement_items_transaction
on public.credit_card_statement_items(transaction_id);

alter table public.credit_card_statement_items enable row level security;

drop policy if exists "credit_card_statement_items_select_own" on public.credit_card_statement_items;
create policy "credit_card_statement_items_select_own"
on public.credit_card_statement_items
for select
using (
  exists (
    select 1
    from public.credit_card_statements s
    where s.id = statement_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "credit_card_statement_items_insert_own" on public.credit_card_statement_items;
create policy "credit_card_statement_items_insert_own"
on public.credit_card_statement_items
for insert
with check (
  exists (
    select 1
    from public.credit_card_statements s
    where s.id = statement_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "credit_card_statement_items_delete_own" on public.credit_card_statement_items;
create policy "credit_card_statement_items_delete_own"
on public.credit_card_statement_items
for delete
using (
  exists (
    select 1
    from public.credit_card_statements s
    where s.id = statement_id
      and s.user_id = auth.uid()
  )
);

create table if not exists public.balance_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid null references public.accounts(id) on delete cascade,
  credit_card_id uuid null references public.credit_cards(id) on delete cascade,
  reconciliation_date date not null default current_date,
  system_balance numeric(14,2) not null,
  bank_balance numeric(14,2) not null,
  difference numeric(14,2) not null,
  notes text null,
  created_at timestamptz not null default now(),
  check (account_id is not null or credit_card_id is not null)
);

create index if not exists idx_balance_reconciliations_user
on public.balance_reconciliations(user_id);

create index if not exists idx_balance_reconciliations_account
on public.balance_reconciliations(account_id, reconciliation_date desc);

create index if not exists idx_balance_reconciliations_card
on public.balance_reconciliations(credit_card_id, reconciliation_date desc);

alter table public.balance_reconciliations enable row level security;

drop policy if exists "balance_reconciliations_select_own" on public.balance_reconciliations;
create policy "balance_reconciliations_select_own"
on public.balance_reconciliations
for select
using (auth.uid() = user_id);

drop policy if exists "balance_reconciliations_insert_own" on public.balance_reconciliations;
create policy "balance_reconciliations_insert_own"
on public.balance_reconciliations
for insert
with check (auth.uid() = user_id);

drop policy if exists "balance_reconciliations_delete_own" on public.balance_reconciliations;
create policy "balance_reconciliations_delete_own"
on public.balance_reconciliations
for delete
using (auth.uid() = user_id);
