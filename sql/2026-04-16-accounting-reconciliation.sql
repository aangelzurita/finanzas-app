-- Reconciliacion manual de balances
-- Uso recomendado:
-- 1) correr los SELECT de diagnostico
-- 2) revisar diferencias
-- 3) si hay datos mal cargados, corregir la transaccion primero
-- 4) solo despues recalcular / normalizar saldos

-- =========================================
-- 1. Diagnostico de cuentas
-- =========================================
select
  a.id,
  a.name,
  a.account_type,
  a.initial_balance,
  a.current_balance as persisted_current_balance,
  a.initial_balance
    + coalesce(sum(
        case
          when t.destination_account_id = a.id
               and t.status = 'completed'
               and t.transaction_type in ('income', 'transfer')
            then t.amount
          else 0
        end
      ), 0)
    - coalesce(sum(
        case
          when t.source_account_id = a.id
               and t.status = 'completed'
               and t.transaction_type in ('expense', 'transfer', 'credit_card_payment', 'debt_payment')
            then t.amount
          else 0
        end
      ), 0) as derived_current_balance
from public.accounts a
left join public.transactions t
  on t.source_account_id = a.id
  or t.destination_account_id = a.id
group by a.id, a.name, a.account_type, a.initial_balance, a.current_balance
order by a.name;

-- =========================================
-- 2. Diagnostico de tarjetas
-- Ajustar esta consulta si la funcion SQL real del proyecto
-- maneja mas casos que compras y pagos.
-- =========================================
select
  c.id,
  c.name,
  c.current_balance as persisted_current_balance,
  coalesce(sum(
    case
      when t.related_credit_card_id = c.id
           and t.status = 'completed'
           and t.transaction_type = 'credit_card_purchase'
        then t.amount
      when t.related_credit_card_id = c.id
           and t.status = 'completed'
           and t.transaction_type = 'credit_card_payment'
        then -t.amount
      else 0
    end
  ), 0) as derived_current_balance
from public.credit_cards c
left join public.transactions t
  on t.related_credit_card_id = c.id
group by c.id, c.name, c.current_balance
order by c.name;

-- =========================================
-- 3. Diagnostico de deudas
-- Ajustar esta consulta si la funcion SQL real del proyecto
-- considera cargos adicionales o intereses capitalizados.
-- =========================================
select
  d.id,
  d.name,
  d.initial_balance,
  d.current_balance as persisted_current_balance,
  d.initial_balance
    - coalesce(sum(
        case
          when t.related_debt_id = d.id
               and t.status = 'completed'
               and t.transaction_type = 'debt_payment'
            then t.amount
          else 0
        end
      ), 0) as derived_current_balance
from public.debts d
left join public.transactions t
  on t.related_debt_id = d.id
group by d.id, d.name, d.initial_balance, d.current_balance
order by d.name;

-- =========================================
-- 4. Pagos de TDC con metadatos de asignacion
-- Sirve para revisar si minimum / no-interest fueron capturados.
-- =========================================
select
  id,
  transaction_date,
  description,
  amount,
  source_account_id,
  related_credit_card_id,
  applied_to_minimum_payment,
  applied_to_no_interest_payment
from public.transactions
where transaction_type = 'credit_card_payment'
order by transaction_date desc;

-- =========================================
-- 5. Posibles pagos duplicados de TDC
-- Heuristica simple para pruebas o capturas repetidas.
-- =========================================
select
  source_account_id,
  related_credit_card_id,
  amount,
  transaction_date::date as tx_day,
  count(*) as duplicates
from public.transactions
where transaction_type = 'credit_card_payment'
group by source_account_id, related_credit_card_id, amount, transaction_date::date
having count(*) > 1
order by tx_day desc, amount desc;

-- =========================================
-- 6. Normalizacion manual de cuentas
-- Reemplazar UUIDs reales antes de ejecutar.
-- =========================================
-- update public.accounts
-- set
--   initial_balance = 15000,
--   current_balance = 15000
-- where id = 'ACCOUNT_UUID';

-- =========================================
-- 7. Normalizacion manual de tarjeta
-- Util cuando hubo pruebas SQL y minimum/no-interest quedaron fuera de sync.
-- =========================================
-- update public.credit_cards
-- set
--   minimum_payment = 0,
--   no_interest_payment = current_balance
-- where id = 'CARD_UUID';
