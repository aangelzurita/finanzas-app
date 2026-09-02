create table if not exists public.shared_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_self boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shared_participants_user on public.shared_participants(user_id);

alter table public.shared_participants enable row level security;

drop policy if exists "shared_participants_select_own" on public.shared_participants;
create policy "shared_participants_select_own" on public.shared_participants
for select using (auth.uid() = user_id);

drop policy if exists "shared_participants_insert_own" on public.shared_participants;
create policy "shared_participants_insert_own" on public.shared_participants
for insert with check (auth.uid() = user_id);

drop policy if exists "shared_participants_update_own" on public.shared_participants;
create policy "shared_participants_update_own" on public.shared_participants
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "shared_participants_delete_own" on public.shared_participants;
create policy "shared_participants_delete_own" on public.shared_participants
for delete using (auth.uid() = user_id);

drop trigger if exists trg_shared_participants_updated_at on public.shared_participants;
create trigger trg_shared_participants_updated_at
before update on public.shared_participants
for each row execute function public.set_updated_at();

create table if not exists public.shared_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  currency text not null default 'MXN',
  default_cutoff_day integer null check (default_cutoff_day between 1 and 31),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shared_groups_user on public.shared_groups(user_id);
create index if not exists idx_shared_groups_status on public.shared_groups(status);

alter table public.shared_groups enable row level security;

drop policy if exists "shared_groups_select_own" on public.shared_groups;
create policy "shared_groups_select_own" on public.shared_groups
for select using (auth.uid() = user_id);

drop policy if exists "shared_groups_insert_own" on public.shared_groups;
create policy "shared_groups_insert_own" on public.shared_groups
for insert with check (auth.uid() = user_id);

drop policy if exists "shared_groups_update_own" on public.shared_groups;
create policy "shared_groups_update_own" on public.shared_groups
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "shared_groups_delete_own" on public.shared_groups;
create policy "shared_groups_delete_own" on public.shared_groups
for delete using (auth.uid() = user_id);

drop trigger if exists trg_shared_groups_updated_at on public.shared_groups;
create trigger trg_shared_groups_updated_at
before update on public.shared_groups
for each row execute function public.set_updated_at();

create table if not exists public.shared_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.shared_groups(id) on delete cascade,
  participant_id uuid not null references public.shared_participants(id) on delete cascade,
  default_percentage numeric(7,4) not null default 50 check (default_percentage >= 0 and default_percentage <= 100),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique (group_id, participant_id)
);

create index if not exists idx_shared_group_members_group on public.shared_group_members(group_id);
create index if not exists idx_shared_group_members_participant on public.shared_group_members(participant_id);

alter table public.shared_group_members enable row level security;

drop policy if exists "shared_group_members_select_own" on public.shared_group_members;
create policy "shared_group_members_select_own" on public.shared_group_members
for select using (
  exists (
    select 1 from public.shared_groups g
    where g.id = group_id and g.user_id = auth.uid()
  )
);

drop policy if exists "shared_group_members_insert_own" on public.shared_group_members;
create policy "shared_group_members_insert_own" on public.shared_group_members
for insert with check (
  exists (
    select 1 from public.shared_groups g
    where g.id = group_id and g.user_id = auth.uid()
  )
);

drop policy if exists "shared_group_members_update_own" on public.shared_group_members;
create policy "shared_group_members_update_own" on public.shared_group_members
for update using (
  exists (
    select 1 from public.shared_groups g
    where g.id = group_id and g.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.shared_groups g
    where g.id = group_id and g.user_id = auth.uid()
  )
);

drop policy if exists "shared_group_members_delete_own" on public.shared_group_members;
create policy "shared_group_members_delete_own" on public.shared_group_members
for delete using (
  exists (
    select 1 from public.shared_groups g
    where g.id = group_id and g.user_id = auth.uid()
  )
);

create table if not exists public.shared_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.shared_groups(id) on delete cascade,
  transaction_id uuid null references public.transactions(id) on delete set null,
  category_id uuid null references public.categories(id) on delete set null,
  paid_by_participant_id uuid not null references public.shared_participants(id) on delete restrict,
  description text not null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  expense_date date not null,
  split_method text not null default 'percentage' check (split_method in ('equal','percentage','amount')),
  status text not null default 'active' check (status in ('active','void')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shared_expenses_user on public.shared_expenses(user_id);
create index if not exists idx_shared_expenses_group_date on public.shared_expenses(group_id, expense_date desc);
create index if not exists idx_shared_expenses_transaction on public.shared_expenses(transaction_id);

alter table public.shared_expenses enable row level security;

drop policy if exists "shared_expenses_select_own" on public.shared_expenses;
create policy "shared_expenses_select_own" on public.shared_expenses
for select using (auth.uid() = user_id);

drop policy if exists "shared_expenses_insert_own" on public.shared_expenses;
create policy "shared_expenses_insert_own" on public.shared_expenses
for insert with check (auth.uid() = user_id);

drop policy if exists "shared_expenses_update_own" on public.shared_expenses;
create policy "shared_expenses_update_own" on public.shared_expenses
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "shared_expenses_delete_own" on public.shared_expenses;
create policy "shared_expenses_delete_own" on public.shared_expenses
for delete using (auth.uid() = user_id);

drop trigger if exists trg_shared_expenses_updated_at on public.shared_expenses;
create trigger trg_shared_expenses_updated_at
before update on public.shared_expenses
for each row execute function public.set_updated_at();

create table if not exists public.shared_expense_splits (
  id uuid primary key default gen_random_uuid(),
  shared_expense_id uuid not null references public.shared_expenses(id) on delete cascade,
  participant_id uuid not null references public.shared_participants(id) on delete cascade,
  percentage numeric(7,4) null check (percentage is null or (percentage >= 0 and percentage <= 100)),
  amount_owed numeric(14,2) not null check (amount_owed >= 0),
  created_at timestamptz not null default now(),
  unique (shared_expense_id, participant_id)
);

create index if not exists idx_shared_expense_splits_expense on public.shared_expense_splits(shared_expense_id);

alter table public.shared_expense_splits enable row level security;

drop policy if exists "shared_expense_splits_select_own" on public.shared_expense_splits;
create policy "shared_expense_splits_select_own" on public.shared_expense_splits
for select using (
  exists (
    select 1 from public.shared_expenses e
    where e.id = shared_expense_id and e.user_id = auth.uid()
  )
);

drop policy if exists "shared_expense_splits_insert_own" on public.shared_expense_splits;
create policy "shared_expense_splits_insert_own" on public.shared_expense_splits
for insert with check (
  exists (
    select 1 from public.shared_expenses e
    where e.id = shared_expense_id and e.user_id = auth.uid()
  )
);

drop policy if exists "shared_expense_splits_delete_own" on public.shared_expense_splits;
create policy "shared_expense_splits_delete_own" on public.shared_expense_splits
for delete using (
  exists (
    select 1 from public.shared_expenses e
    where e.id = shared_expense_id and e.user_id = auth.uid()
  )
);

create table if not exists public.shared_cutoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.shared_groups(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  opening_balance numeric(14,2) not null default 0,
  period_balance numeric(14,2) not null default 0,
  closing_balance numeric(14,2) not null default 0,
  status text not null default 'closed' check (status in ('draft','closed','carried','paid','canceled')),
  action text not null default 'carry_forward' check (action in ('carry_forward','paid','partial','forgiven')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shared_cutoffs_user on public.shared_cutoffs(user_id);
create index if not exists idx_shared_cutoffs_group on public.shared_cutoffs(group_id, end_date desc);

alter table public.shared_cutoffs enable row level security;

drop policy if exists "shared_cutoffs_select_own" on public.shared_cutoffs;
create policy "shared_cutoffs_select_own" on public.shared_cutoffs
for select using (auth.uid() = user_id);

drop policy if exists "shared_cutoffs_insert_own" on public.shared_cutoffs;
create policy "shared_cutoffs_insert_own" on public.shared_cutoffs
for insert with check (auth.uid() = user_id);

drop policy if exists "shared_cutoffs_update_own" on public.shared_cutoffs;
create policy "shared_cutoffs_update_own" on public.shared_cutoffs
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_shared_cutoffs_updated_at on public.shared_cutoffs;
create trigger trg_shared_cutoffs_updated_at
before update on public.shared_cutoffs
for each row execute function public.set_updated_at();

create table if not exists public.shared_settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.shared_groups(id) on delete cascade,
  cutoff_id uuid null references public.shared_cutoffs(id) on delete set null,
  from_participant_id uuid not null references public.shared_participants(id) on delete restrict,
  to_participant_id uuid not null references public.shared_participants(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  settlement_date date not null,
  account_id uuid null references public.accounts(id) on delete set null,
  transaction_id uuid null references public.transactions(id) on delete set null,
  affects_cash boolean not null default false,
  notes text null,
  created_at timestamptz not null default now(),
  check (from_participant_id <> to_participant_id)
);

create index if not exists idx_shared_settlements_user on public.shared_settlements(user_id);
create index if not exists idx_shared_settlements_group_date on public.shared_settlements(group_id, settlement_date desc);

alter table public.shared_settlements enable row level security;

drop policy if exists "shared_settlements_select_own" on public.shared_settlements;
create policy "shared_settlements_select_own" on public.shared_settlements
for select using (auth.uid() = user_id);

drop policy if exists "shared_settlements_insert_own" on public.shared_settlements;
create policy "shared_settlements_insert_own" on public.shared_settlements
for insert with check (auth.uid() = user_id);

drop policy if exists "shared_settlements_delete_own" on public.shared_settlements;
create policy "shared_settlements_delete_own" on public.shared_settlements
for delete using (auth.uid() = user_id);

create table if not exists public.shared_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.shared_groups(id) on delete cascade,
  cutoff_id uuid null references public.shared_cutoffs(id) on delete set null,
  participant_id uuid not null references public.shared_participants(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('forgiveness','manual')),
  amount_signed numeric(14,2) not null,
  adjustment_date date not null,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_shared_adjustments_user on public.shared_adjustments(user_id);
create index if not exists idx_shared_adjustments_group_date on public.shared_adjustments(group_id, adjustment_date desc);

alter table public.shared_adjustments enable row level security;

drop policy if exists "shared_adjustments_select_own" on public.shared_adjustments;
create policy "shared_adjustments_select_own" on public.shared_adjustments
for select using (auth.uid() = user_id);

drop policy if exists "shared_adjustments_insert_own" on public.shared_adjustments;
create policy "shared_adjustments_insert_own" on public.shared_adjustments
for insert with check (auth.uid() = user_id);

drop policy if exists "shared_adjustments_delete_own" on public.shared_adjustments;
create policy "shared_adjustments_delete_own" on public.shared_adjustments
for delete using (auth.uid() = user_id);
