-- Reemplaza TU_USER_ID por tu user_id real antes de correrlo.

-- 1) Gasto generado por categoría: mes actual
select
  c.name as category,
  round(sum(t.amount)::numeric, 2) as generated_expense_month
from public.transactions t
join public.categories c on c.id = t.category_id
where t.user_id = 'TU_USER_ID'
  and t.status = 'completed'
  and t.transaction_type in ('expense', 'credit_card_purchase')
  and date_trunc('month', t.transaction_date) = date_trunc('month', now())
group by c.name
order by generated_expense_month desc;

-- 2) Gasto generado por categoría: últimos 3 meses
select
  to_char(date_trunc('month', t.transaction_date), 'YYYY-MM') as period,
  c.name as category,
  round(sum(t.amount)::numeric, 2) as generated_expense
from public.transactions t
join public.categories c on c.id = t.category_id
where t.user_id = 'TU_USER_ID'
  and t.status = 'completed'
  and t.transaction_type in ('expense', 'credit_card_purchase')
  and t.transaction_date >= date_trunc('month', now()) - interval '2 months'
group by 1, 2
order by 1 desc, 3 desc;

-- 3) Recurrentes activos
select
  name,
  amount,
  frequency,
  payment_method_type,
  next_charge_date
from public.recurring_charges
where user_id = 'TU_USER_ID'
  and is_active = true
order by amount desc, name;

-- 4) MSI activos
select
  description,
  monthly_amount,
  total_months,
  current_installment_number,
  remaining_installments,
  charge_day,
  status
from public.credit_card_installments
where user_id = 'TU_USER_ID'
  and status = 'active'
order by monthly_amount desc, description;

-- 5) Pagos reales de flujo de este mes
select
  transaction_type,
  round(sum(amount)::numeric, 2) as total
from public.transactions
where user_id = 'TU_USER_ID'
  and status = 'completed'
  and transaction_type in ('expense', 'credit_card_payment', 'debt_payment')
  and date_trunc('month', transaction_date) = date_trunc('month', now())
group by transaction_type
order by total desc;

-- 6) Liquidez actual en cuentas usables
select
  name,
  account_type,
  current_balance
from public.accounts
where user_id = 'TU_USER_ID'
  and is_active = true
  and account_type in ('cash', 'debit', 'savings')
order by account_type, name;

-- 7) Deudas y tarjetas actuales
select
  'credit_card' as source,
  name,
  current_balance,
  minimum_payment,
  no_interest_payment
from public.credit_cards
where user_id = 'TU_USER_ID'
  and is_active = true

union all

select
  'debt' as source,
  name,
  current_balance,
  null::numeric as minimum_payment,
  null::numeric as no_interest_payment
from public.debts
where user_id = 'TU_USER_ID'
  and status <> 'canceled'
order by source, current_balance desc;
