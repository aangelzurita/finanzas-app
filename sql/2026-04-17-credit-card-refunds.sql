create or replace function public.validate_transaction()
returns trigger
language plpgsql
as $function$
begin
    if new.amount is null or new.amount <= 0 then
        raise exception 'Transaction amount must be greater than 0';
    end if;

    if new.transaction_type not in (
        'income',
        'expense',
        'transfer',
        'credit_card_purchase',
        'credit_card_payment',
        'credit_card_refund',
        'debt_payment'
    ) then
        raise exception 'Invalid transaction_type: %', new.transaction_type;
    end if;

    if new.transaction_type = 'income' then
        if new.destination_account_id is null then
            raise exception 'Income requires destination_account_id';
        end if;
    end if;

    if new.transaction_type = 'expense' then
        if new.source_account_id is null then
            raise exception 'Expense requires source_account_id';
        end if;
        if new.category_id is null then
            raise exception 'Expense requires category_id';
        end if;
    end if;

    if new.transaction_type = 'transfer' then
        if new.source_account_id is null or new.destination_account_id is null then
            raise exception 'Transfer requires source and destination accounts';
        end if;
        if new.source_account_id = new.destination_account_id then
            raise exception 'Transfer source and destination cannot be the same';
        end if;
    end if;

    if new.transaction_type = 'credit_card_purchase' then
        if new.related_credit_card_id is null then
            raise exception 'Credit card purchase requires related_credit_card_id';
        end if;
        if new.category_id is null then
            raise exception 'Credit card purchase requires category_id';
        end if;
    end if;

    if new.transaction_type = 'credit_card_payment' then
        if new.related_credit_card_id is null then
            raise exception 'Credit card payment requires related_credit_card_id';
        end if;
        if new.source_account_id is null then
            raise exception 'Credit card payment requires source_account_id';
        end if;
    end if;

    if new.transaction_type = 'credit_card_refund' then
        if new.related_credit_card_id is null then
            raise exception 'Credit card refund requires related_credit_card_id';
        end if;
    end if;

    if new.transaction_type = 'debt_payment' then
        if new.related_debt_id is null then
            raise exception 'Debt payment requires related_debt_id';
        end if;
        if new.source_account_id is null then
            raise exception 'Debt payment requires source_account_id';
        end if;
    end if;

    return new;
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
          when transaction_type = 'credit_card_refund'
               and related_credit_card_id = p_credit_card_id
               and status = 'completed'
               and coalesce(affects_balance, true)
            then -amount
          else 0
        end
      ), 0)
    into v_new_balance
    from public.transactions
    where related_credit_card_id = p_credit_card_id;

    update public.credit_cards
    set current_balance = coalesce(v_new_balance, 0)
    where id = p_credit_card_id;

    update public.accounts
    set current_balance = coalesce(v_new_balance, 0)
    where id = v_account_id;
end;
$function$;

do $$
declare
  v_card_id uuid;
begin
  for v_card_id in select id from public.credit_cards loop
    perform public.recalculate_credit_card_balance(v_card_id);
  end loop;
end $$;
