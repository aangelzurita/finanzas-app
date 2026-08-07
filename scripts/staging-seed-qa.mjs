import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const envPath = path.join(process.cwd(), '.env.staging.local')
const pgBinDir = '/opt/homebrew/opt/postgresql@17/bin'
const qaEmail = process.env.FINANZAS_QA_EMAIL || process.env.FINANZAS_E2E_EMAIL

function readStagingDatabaseUrl() {
  if (!existsSync(envPath)) {
    throw new Error('No existe .env.staging.local. Crea el archivo y agrega STAGING_DB_URL.')
  }

  const content = readFileSync(envPath, 'utf8')
  const match = content.match(/^STAGING_DB_URL=(.*)$/m)
  const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '')

  if (!value) {
    throw new Error('Falta STAGING_DB_URL en .env.staging.local.')
  }

  return value
}

function commandPath(command) {
  const candidate = path.join(pgBinDir, command)
  return existsSync(candidate) ? candidate : command
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function runSeed(databaseUrl, sql) {
  const result = spawnSync(commandPath('psql'), [databaseUrl, '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: process.env,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (!qaEmail) {
  console.error('Define FINANZAS_QA_EMAIL o FINANZAS_E2E_EMAIL con el usuario de staging.')
  process.exit(1)
}

const seedSql = `
do $$
declare
  v_user uuid;
  v_cash_account uuid;
  v_external_account uuid;
  v_card_account uuid;
  v_expense_category uuid;
  v_income_category uuid;
  v_card uuid;
begin
  select id into v_user
  from auth.users
  where lower(email) = lower(${sqlLiteral(qaEmail)})
  limit 1;

  if v_user is null then
    raise exception 'No existe usuario QA con email %', ${sqlLiteral(qaEmail)};
  end if;

  update public.credit_card_installments
  set purchase_transaction_id = null
  where user_id = v_user
    and description like 'QA - %';

  delete from public.credit_card_statement_items
  where statement_id in (
    select s.id
    from public.credit_card_statements s
    join public.credit_cards c on c.id = s.credit_card_id
    where c.user_id = v_user
      and c.name like 'QA - %'
  );

  delete from public.credit_card_statements
  where credit_card_id in (
    select id from public.credit_cards where user_id = v_user and name like 'QA - %'
  );

  delete from public.transactions
  where user_id = v_user
    and (
      coalesce(description, '') like 'QA - %'
      or related_credit_card_id in (select id from public.credit_cards where user_id = v_user and name like 'QA - %')
      or related_debt_id in (select id from public.debts where user_id = v_user and name like 'QA - %')
      or related_recurring_charge_id in (select id from public.recurring_charges where user_id = v_user and name like 'QA - %')
    );

  delete from public.credit_card_installments
  where user_id = v_user
    and description like 'QA - %';

  delete from public.recurring_charges
  where user_id = v_user
    and name like 'QA - %';

  delete from public.reminders
  where user_id = v_user
    and title like 'QA - %';

  delete from public.income_schedules
  where user_id = v_user
    and name like 'QA - %';

  delete from public.debts
  where user_id = v_user
    and name like 'QA - %';

  delete from public.credit_cards
  where user_id = v_user
    and name like 'QA - %';

  delete from public.budgets
  where user_id = v_user
    and category_id in (
      select id from public.categories where user_id = v_user and name like 'QA - %'
    );

  delete from public.accounts
  where user_id = v_user
    and name like 'QA - %';

  delete from public.categories
  where user_id = v_user
    and name like 'QA - %';

  insert into public.accounts (
    user_id, name, account_type, institution, initial_balance, current_balance,
    currency_code, is_active, is_external, include_in_balance, notes
  )
  values (
    v_user, 'QA - Cuenta Nomina', 'debit', 'Banco QA', 20000.00, 20000.00,
    'MXN', true, false, true, 'Fixture QA operativo'
  )
  returning id into v_cash_account;

  insert into public.accounts (
    user_id, name, account_type, institution, initial_balance, current_balance,
    currency_code, is_active, is_external, include_in_balance, notes
  )
  values (
    v_user, 'QA - Cuenta Externa', 'debit', 'Externo QA', 9999.00, 9999.00,
    'MXN', true, true, false, 'Fixture QA: no afecta balance personal'
  )
  returning id into v_external_account;

  insert into public.accounts (
    user_id, name, account_type, institution, initial_balance, current_balance,
    currency_code, credit_limit, is_active, is_external, include_in_balance, notes
  )
  values (
    v_user, 'QA - TDC Control', 'credit_card', 'Banco QA', 1000.00, 1000.00,
    'MXN', 20000.00, true, false, true, 'Cuenta espejo QA para tarjeta'
  )
  returning id into v_card_account;

  insert into public.categories (user_id, name, category_type, color, icon, is_active)
  values (v_user, 'QA - Cafe', 'expense', '#f59e0b', 'coffee', true)
  returning id into v_expense_category;

  insert into public.categories (user_id, name, category_type, color, icon, is_active)
  values (v_user, 'QA - Nomina', 'income', '#10b981', 'wallet', true)
  returning id into v_income_category;

  insert into public.credit_cards (
    user_id, account_id, name, bank, statement_cutoff_day, payment_due_day,
    annual_interest_rate, minimum_payment, no_interest_payment, credit_limit,
    current_balance, is_active, notes
  )
  values (
    v_user, v_card_account, 'QA - TDC Control', 'Banco QA', 15, 5,
    45.00, 100.00, 1000.00, 20000.00, 1000.00, true,
    'Fixture QA para compras, pagos, MSI y corte'
  )
  returning id into v_card;

  insert into public.credit_card_installments (
    user_id, credit_card_id, description, total_amount, monthly_amount,
    total_months, current_installment_number, remaining_installments,
    charge_day, start_date, notes, status, last_processed_installment_number,
    category_id
  )
  values (
    v_user, v_card, 'QA - MSI Vencido', 1200.00, 200.00,
    6, 1, 6, 1, '2026-07-01', 'Fixture QA MSI vencido', 'active', 0,
    v_expense_category
  );

  insert into public.debts (
    user_id, name, creditor, original_amount, current_balance,
    annual_interest_rate, payment_amount, payment_frequency, start_date,
    due_date, status, notes, institution, total_amount, initial_balance,
    monthly_payment, interest_rate, next_payment_date, payment_account_id
  )
  values (
    v_user, 'QA - Deuda Activa', 'Acreedor QA', 5000.00, 5000.00,
    18.00, 500.00, 'monthly', '2026-08-01',
    '2027-08-01', 'active', 'Fixture QA deuda activa', 'Acreedor QA',
    5000.00, 5000.00, 500.00, 18.00, '2026-08-20', v_cash_account
  );

  insert into public.debts (
    user_id, name, creditor, original_amount, current_balance,
    annual_interest_rate, payment_amount, payment_frequency, start_date,
    due_date, status, notes, institution, total_amount, initial_balance,
    monthly_payment, interest_rate, next_payment_date, payment_account_id
  )
  values (
    v_user, 'QA - Deuda Cancelada', 'Acreedor QA', 3000.00, 3000.00,
    18.00, 300.00, 'monthly', '2026-08-01',
    '2027-08-01', 'canceled', 'Fixture QA: no debe aparecer para amortizar', 'Acreedor QA',
    3000.00, 3000.00, 300.00, 18.00, '2026-08-20', v_cash_account
  );

  insert into public.recurring_charges (
    user_id, name, description, amount, frequency, charge_day,
    category_id, payment_method_type, account_id, credit_card_id,
    next_charge_date, is_active, create_reminder, affects_cash
  )
  values (
    v_user, 'QA - Recurrente Manual', 'Pago manual QA', 123.45, 'monthly', 1,
    v_expense_category, 'manual_choice', null, null,
    '2026-08-01', true, false, true
  );

  insert into public.recurring_charges (
    user_id, name, description, amount, frequency, charge_day,
    category_id, payment_method_type, account_id, credit_card_id,
    next_charge_date, is_active, create_reminder, affects_cash
  )
  values (
    v_user, 'QA - Recurrente Informativo', 'Solo recordatorio QA', 99.00, 'monthly', 10,
    v_expense_category, 'manual_choice', null, null,
    '2026-08-10', true, false, false
  );

  insert into public.reminders (
    user_id, title, reminder_type, due_date, amount, frequency, status,
    notify_email, notify_push, notes
  )
  values
    (
      v_user, 'QA - Alerta Financiera Recurrente', 'custom',
      '2026-08-06 09:00:00+00', 250.00, 'monthly', 'pending',
      false, false, 'Fixture QA: al atenderse debe avanzar fecha'
    ),
    (
      v_user, 'QA - Recordatorio No Financiero', 'custom',
      '2026-08-07 09:00:00+00', null, null, 'pending',
      false, false, 'Fixture QA: no afecta caja'
    );

  insert into public.income_schedules (
    user_id, name, amount, frequency, expected_day, second_expected_day,
    next_income_date, account_id, category_id, variability, confidence,
    starts_at, ends_at, is_active, notes
  )
  values (
    v_user, 'QA - Quincena', 7500.00, 'biweekly', 14, 28,
    '2026-08-14', v_cash_account, v_income_category, 'fixed', 'confirmed',
    '2026-08-01', null, true, 'Fixture QA ingreso programado'
  );

  insert into public.budgets (
    user_id, category_id, period_month, period_year, budget_amount, alert_threshold
  )
  values (v_user, v_expense_category, 8, 2026, 500.00, 80.00);
end $$;

select 'Fixtures QA creados correctamente.' as result;
`

try {
  runSeed(readStagingDatabaseUrl(), seedSql)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
