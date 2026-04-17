-- Control de impacto en balances para movimientos historicos
-- Objetivos:
-- 1) permitir registrar movimientos que ya venian reflejados en el saldo actual
-- 2) evitar que compras/pagos historicos vuelvan a mover cuentas, tarjetas o deudas
-- 3) hacer que las TDC respeten un saldo inicial base al recalcular

alter table public.transactions
add column if not exists affects_balance boolean not null default true;

update public.transactions
set affects_balance = true
where affects_balance is null;

-- Backfill conservador:
-- si la cuenta espejo de la TDC tiene initial_balance = 0, inferimos un baseline
-- a partir del saldo usado actual menos el efecto neto de transacciones ya registradas.
with card_baselines as (
  select
    c.account_id,
    greatest(
      coalesce(c.current_balance, 0) - coalesce(sum(
        case
          when t.transaction_type = 'credit_card_purchase'
               and t.status = 'completed'
               and coalesce(t.affects_balance, true)
            then t.amount
          when t.transaction_type = 'credit_card_payment'
               and t.status = 'completed'
               and coalesce(t.affects_balance, true)
            then -t.amount
          else 0
        end
      ), 0),
      0
    ) as derived_initial_balance
  from public.credit_cards c
  left join public.transactions t
    on t.related_credit_card_id = c.id
  group by c.account_id, c.current_balance
)
update public.accounts a
set initial_balance = cb.derived_initial_balance
from card_baselines cb
where a.id = cb.account_id
  and a.account_type = 'credit_card'
  and coalesce(a.initial_balance, 0) = 0;

create or replace function public.recalculate_account_balance(p_account_id uuid)
returns void
language plpgsql
as $function$
declare
    v_initial_balance numeric(14,2);
    v_new_balance numeric(14,2);
begin
    select initial_balance
    into v_initial_balance
    from public.accounts
    where id = p_account_id;

    if not found then
        raise exception 'Account not found: %', p_account_id;
    end if;

    select
      v_initial_balance
      + coalesce(sum(
          case
            when destination_account_id = p_account_id
                 and status = 'completed'
                 and coalesce(affects_balance, true)
                 and transaction_type in ('income', 'transfer')
              then amount
            else 0
          end
        ), 0)
      - coalesce(sum(
          case
            when source_account_id = p_account_id
                 and status = 'completed'
                 and coalesce(affects_balance, true)
                 and transaction_type in ('expense', 'transfer', 'credit_card_payment', 'debt_payment')
              then amount
            else 0
          end
        ), 0)
    into v_new_balance
    from public.transactions
    where source_account_id = p_account_id
       or destination_account_id = p_account_id;

    update public.accounts
    set current_balance = coalesce(v_new_balance, v_initial_balance)
    where id = p_account_id;
end;
$function$;

create or replace function public.recalculate_credit_card_balance(p_credit_card_id uuid)
returns void
language plpgsql
as $function$
declare
    v_new_balance numeric(14,2);
    v_initial_balance numeric(14,2);
    v_account_id uuid;
begin
    select c.account_id, a.initial_balance
    into v_account_id, v_initial_balance
    from public.credit_cards c
    join public.accounts a on a.id = c.account_id
    where c.id = p_credit_card_id;

    if not found then
        raise exception 'Credit card not found: %', p_credit_card_id;
    end if;

    select
      greatest(
        coalesce(v_initial_balance, 0) + coalesce(sum(
          case
            when transaction_type = 'credit_card_purchase'
                 and related_credit_card_id = p_credit_card_id
                 and status = 'completed'
                 and coalesce(affects_balance, true)
              then amount
            when transaction_type = 'credit_card_payment'
                 and related_credit_card_id = p_credit_card_id
                 and status = 'completed'
                 and coalesce(affects_balance, true)
              then -amount
            else 0
          end
        ), 0),
        0
      )
    into v_new_balance
    from public.transactions
    where related_credit_card_id = p_credit_card_id;

    update public.credit_cards
    set current_balance = greatest(coalesce(v_new_balance, 0), 0)
    where id = p_credit_card_id;

    update public.accounts
    set current_balance = greatest(coalesce(v_new_balance, 0), 0)
    where id = v_account_id;
end;
$function$;

create or replace function public.recalculate_debt_balance(p_debt_id uuid)
returns void
language plpgsql
as $function$
declare
    v_initial_balance numeric(14,2);
    v_new_balance numeric(14,2);
    v_current_status text;
begin
    select initial_balance, status
    into v_initial_balance, v_current_status
    from public.debts
    where id = p_debt_id;

    if not found then
        raise exception 'Debt not found: %', p_debt_id;
    end if;

    select
      greatest(
        coalesce(v_initial_balance, 0) - coalesce(sum(
          case
            when transaction_type = 'debt_payment'
                 and related_debt_id = p_debt_id
                 and status = 'completed'
                 and coalesce(affects_balance, true)
              then amount
            else 0
          end
        ), 0),
        0
      )
    into v_new_balance
    from public.transactions
    where related_debt_id = p_debt_id;

    update public.debts
    set
      current_balance = coalesce(v_new_balance, coalesce(v_initial_balance, 0)),
      status = case
        when v_current_status = 'canceled' then 'canceled'
        when coalesce(v_new_balance, coalesce(v_initial_balance, 0)) = 0 then 'paid'
        else 'active'
      end
    where id = p_debt_id;
end;
$function$;

do $$
declare
  v_card_id uuid;
  v_account_id uuid;
  v_debt_id uuid;
begin
  for v_card_id in select id from public.credit_cards loop
    perform public.recalculate_credit_card_balance(v_card_id);
  end loop;

  for v_account_id in select id from public.accounts where account_type <> 'credit_card' loop
    perform public.recalculate_account_balance(v_account_id);
  end loop;

  for v_debt_id in select id from public.debts loop
    perform public.recalculate_debt_balance(v_debt_id);
  end loop;
end $$;
