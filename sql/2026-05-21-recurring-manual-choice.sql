alter table public.recurring_charges
drop constraint if exists recurring_charges_payment_method_type_check;

alter table public.recurring_charges
drop constraint if exists recurring_charges_payment_method_check;

alter table public.recurring_charges
add constraint recurring_charges_payment_method_type_check
check (payment_method_type in ('account', 'credit_card', 'manual_choice'));

alter table public.recurring_charges
add constraint recurring_charges_payment_method_check
check (
  (
    payment_method_type = 'account'
    and account_id is not null
    and credit_card_id is null
  )
  or (
    payment_method_type = 'credit_card'
    and credit_card_id is not null
    and account_id is null
  )
  or (
    payment_method_type = 'manual_choice'
    and account_id is null
    and credit_card_id is null
  )
);
