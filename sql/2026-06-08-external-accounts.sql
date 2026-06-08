alter table public.accounts
add column if not exists is_external boolean not null default false;

alter table public.accounts
add column if not exists include_in_balance boolean not null default true;

create index if not exists idx_accounts_external
on public.accounts(is_external);

create index if not exists idx_accounts_include_in_balance
on public.accounts(include_in_balance);
