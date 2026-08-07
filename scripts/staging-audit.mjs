import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const envPath = path.join(process.cwd(), '.env.staging.local')
const pgBinDir = '/opt/homebrew/opt/postgresql@17/bin'

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

function runSql(databaseUrl, title, sql) {
  console.log(`\n## ${title}`)
  const result = spawnSync(
    commandPath('psql'),
    [
      databaseUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-P',
      'pager=off',
      '-c',
      sql,
    ],
    {
      stdio: 'inherit',
      env: process.env,
    }
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const checks = [
  {
    title: 'Resumen de tablas criticas',
    sql: `
      select 'accounts' as table_name, count(*) from public.accounts
      union all select 'transactions', count(*) from public.transactions
      union all select 'credit_cards', count(*) from public.credit_cards
      union all select 'credit_card_installments', count(*) from public.credit_card_installments
      union all select 'credit_card_statements', count(*) from public.credit_card_statements
      union all select 'debts', count(*) from public.debts
      union all select 'income_schedules', count(*) from public.income_schedules
      union all select 'reminders', count(*) from public.reminders
      order by table_name;
    `,
  },
  {
    title: 'Tarjetas cuyo saldo no coincide con cuenta espejo',
    sql: `
      select
        cc.name,
        cc.current_balance as card_balance,
        a.current_balance as mirror_account_balance,
        round((cc.current_balance - a.current_balance)::numeric, 2) as difference
      from public.credit_cards cc
      join public.accounts a on a.id = cc.account_id
      where abs(coalesce(cc.current_balance, 0) - coalesce(a.current_balance, 0)) > 0.01
      order by abs(coalesce(cc.current_balance, 0) - coalesce(a.current_balance, 0)) desc;
    `,
  },
  {
    title: 'Cuentas externas que todavia afectan balance personal',
    sql: `
      select id, name, account_type, current_balance, is_external, include_in_balance
      from public.accounts
      where is_external = true and include_in_balance = true
      order by name;
    `,
  },
  {
    title: 'Cuentas no TDC con saldo guardado distinto al saldo calculado',
    sql: `
      with calculated as (
        select
          a.id,
          a.name,
          a.account_type,
          a.initial_balance,
          a.current_balance as saved_balance,
          coalesce(a.initial_balance, 0)
            + coalesce(sum(
              case
                when t.destination_account_id = a.id
                  and t.status = 'completed'
                  and coalesce(t.affects_balance, true)
                  and t.transaction_type in ('income', 'transfer')
                then t.amount
                else 0
              end
            ), 0)
            - coalesce(sum(
              case
                when t.source_account_id = a.id
                  and t.status = 'completed'
                  and coalesce(t.affects_balance, true)
                  and t.transaction_type in ('expense', 'transfer', 'credit_card_payment', 'debt_payment')
                then t.amount
                else 0
              end
            ), 0) as calculated_balance
        from public.accounts a
        left join public.transactions t
          on t.source_account_id = a.id
          or t.destination_account_id = a.id
        where a.account_type <> 'credit_card'
        group by a.id, a.name, a.account_type, a.initial_balance, a.current_balance
      )
      select
        id,
        name,
        account_type,
        saved_balance,
        calculated_balance,
        round((saved_balance - calculated_balance)::numeric, 2) as difference
      from calculated
      where abs(coalesce(saved_balance, 0) - coalesce(calculated_balance, 0)) > 0.01
      order by abs(coalesce(saved_balance, 0) - coalesce(calculated_balance, 0)) desc;
    `,
  },
  {
    title: 'Tarjetas con saldo guardado distinto al saldo calculado',
    sql: `
      with calculated as (
        select
          c.id,
          c.name,
          c.current_balance as saved_balance,
          coalesce(a.initial_balance, 0)
            + coalesce(sum(
              case
                when t.related_credit_card_id = c.id
                  and t.status = 'completed'
                  and coalesce(t.affects_balance, true)
                  and t.transaction_type = 'credit_card_purchase'
                then t.amount
                when t.related_credit_card_id = c.id
                  and t.status = 'completed'
                  and coalesce(t.affects_balance, true)
                  and t.transaction_type in ('credit_card_payment', 'credit_card_refund')
                then -t.amount
                else 0
              end
            ), 0) as calculated_balance
        from public.credit_cards c
        join public.accounts a on a.id = c.account_id
        left join public.transactions t on t.related_credit_card_id = c.id
        group by c.id, c.name, c.current_balance, a.initial_balance
      )
      select
        id,
        name,
        saved_balance,
        calculated_balance,
        round((saved_balance - calculated_balance)::numeric, 2) as difference
      from calculated
      where abs(coalesce(saved_balance, 0) - coalesce(calculated_balance, 0)) > 0.01
      order by abs(coalesce(saved_balance, 0) - coalesce(calculated_balance, 0)) desc;
    `,
  },
  {
    title: 'Deudas con saldo guardado distinto al saldo calculado',
    sql: `
      with calculated as (
        select
          d.id,
          d.name,
          d.status,
          d.current_balance as saved_balance,
          greatest(
            coalesce(d.initial_balance, d.original_amount, 0)
              - coalesce(sum(
                case
                  when t.related_debt_id = d.id
                    and t.status = 'completed'
                    and coalesce(t.affects_balance, true)
                    and t.transaction_type = 'debt_payment'
                  then t.amount
                  else 0
                end
              ), 0),
            0
          ) as calculated_balance
        from public.debts d
        left join public.transactions t on t.related_debt_id = d.id
        group by d.id, d.name, d.status, d.current_balance, d.initial_balance, d.original_amount
      )
      select
        id,
        name,
        status,
        saved_balance,
        calculated_balance,
        round((saved_balance - calculated_balance)::numeric, 2) as difference
      from calculated
      where abs(coalesce(saved_balance, 0) - coalesce(calculated_balance, 0)) > 0.01
      order by abs(coalesce(saved_balance, 0) - coalesce(calculated_balance, 0)) desc;
    `,
  },
  {
    title: 'Movimientos posiblemente duplicados',
    sql: `
      select
        transaction_type,
        coalesce(description, '') as description,
        amount,
        transaction_date,
        source_account_id,
        destination_account_id,
        related_credit_card_id,
        related_debt_id,
        count(*) as duplicates
      from public.transactions
      where status = 'completed'
      group by
        transaction_type,
        coalesce(description, ''),
        amount,
        transaction_date,
        source_account_id,
        destination_account_id,
        related_credit_card_id,
        related_debt_id
      having count(*) > 1
      order by duplicates desc, transaction_date desc
      limit 50;
    `,
  },
  {
    title: 'MSI con cargos duplicados por parcialidad',
    sql: `
      select
        related_installment_id,
        installment_sequence,
        count(*) as duplicates,
        sum(amount) as duplicated_amount
      from public.transactions
      where related_installment_id is not null
        and installment_sequence is not null
        and status = 'completed'
      group by related_installment_id, installment_sequence
      having count(*) > 1
      order by duplicates desc, related_installment_id;
    `,
  },
  {
    title: 'Cortes duplicados por tarjeta y fecha de corte',
    sql: `
      select credit_card_id, cutoff_date, count(*) as duplicates
      from public.credit_card_statements
      group by credit_card_id, cutoff_date
      having count(*) > 1
      order by duplicates desc, cutoff_date desc;
    `,
  },
  {
    title: 'Pagos de tarjeta sin tarjeta relacionada',
    sql: `
      select id, transaction_date, description, amount, source_account_id, affects_balance, status
      from public.transactions
      where transaction_type = 'credit_card_payment'
        and related_credit_card_id is null
      order by transaction_date desc
      limit 50;
    `,
  },
  {
    title: 'Pagos de deuda sin deuda relacionada',
    sql: `
      select id, transaction_date, description, amount, source_account_id, affects_balance, status
      from public.transactions
      where transaction_type = 'debt_payment'
        and related_debt_id is null
      order by transaction_date desc
      limit 50;
    `,
  },
]

try {
  const databaseUrl = readStagingDatabaseUrl()
  for (const check of checks) {
    runSql(databaseUrl, check.title, check.sql)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
