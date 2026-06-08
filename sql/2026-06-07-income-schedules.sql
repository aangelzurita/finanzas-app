create table if not exists public.income_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(14,2) not null check (amount > 0),
  frequency text not null check (frequency in ('one_time', 'weekly', 'biweekly', 'monthly', 'custom_days')),
  expected_day integer null check (expected_day between 1 and 31),
  second_expected_day integer null check (second_expected_day between 1 and 31),
  next_income_date date not null,
  account_id uuid null references public.accounts(id) on delete set null,
  category_id uuid null references public.categories(id) on delete set null,
  variability text not null default 'fixed' check (variability in ('fixed', 'variable', 'bonus')),
  confidence text not null default 'expected' check (confidence in ('confirmed', 'expected', 'tentative')),
  starts_at date null,
  ends_at date null,
  is_active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_income_schedules_user on public.income_schedules(user_id);
create index if not exists idx_income_schedules_next_date on public.income_schedules(next_income_date);
create index if not exists idx_income_schedules_active on public.income_schedules(is_active);
create index if not exists idx_income_schedules_account on public.income_schedules(account_id);

alter table public.income_schedules enable row level security;

drop policy if exists "income_schedules_select_own" on public.income_schedules;
create policy "income_schedules_select_own"
on public.income_schedules
for select
using (auth.uid() = user_id);

drop policy if exists "income_schedules_insert_own" on public.income_schedules;
create policy "income_schedules_insert_own"
on public.income_schedules
for insert
with check (auth.uid() = user_id);

drop policy if exists "income_schedules_update_own" on public.income_schedules;
create policy "income_schedules_update_own"
on public.income_schedules
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "income_schedules_delete_own" on public.income_schedules;
create policy "income_schedules_delete_own"
on public.income_schedules
for delete
using (auth.uid() = user_id);

drop trigger if exists trg_income_schedules_updated_at on public.income_schedules;
create trigger trg_income_schedules_updated_at
before update on public.income_schedules
for each row
execute function public.set_updated_at();
