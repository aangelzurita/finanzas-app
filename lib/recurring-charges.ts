import type { SupabaseClient } from '@supabase/supabase-js'

export type RecurringFrequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'

export type RecurringCharge = {
  id: string
  user_id: string
  name: string
  description: string | null
  amount: number
  frequency: RecurringFrequency
  charge_day: number | null
  category_id: string | null
  payment_method_type: 'account' | 'credit_card' | 'manual_choice'
  account_id: string | null
  credit_card_id: string | null
  next_charge_date: string | null
  last_processed_charge_date?: string | null
  affects_cash?: boolean | null
  is_active: boolean
}

function safeDayForMonth(year: number, month: number, preferredDay: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return Math.min(preferredDay, lastDay)
}

export function calculateNextChargeDate(
  frequency: RecurringFrequency,
  chargeDay?: number | null
): string {
  return calculateNextChargeDateFrom(frequency, chargeDay, new Date())
}

export function calculateNextChargeDateFrom(
  frequency: RecurringFrequency,
  chargeDay: number | null | undefined,
  referenceDate: Date
): string {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())

  if (frequency === 'weekly') {
    const next = new Date(today)
    next.setDate(next.getDate() + 7)
    return next.toISOString().slice(0, 10)
  }

  if (frequency === 'biweekly') {
    const next = new Date(today)
    next.setDate(next.getDate() + 14)
    return next.toISOString().slice(0, 10)
  }

  const preferredDay = chargeDay && chargeDay >= 1 ? chargeDay : today.getDate()

  let year = today.getFullYear()
  let month = today.getMonth()

  const currentMonthDay = safeDayForMonth(year, month, preferredDay)
  const candidate = new Date(year, month, currentMonthDay)

  if (candidate <= today) {
    if (frequency === 'monthly') month += 1
    if (frequency === 'quarterly') month += 3
    if (frequency === 'yearly') year += 1

    if (frequency !== 'yearly') {
      year += Math.floor(month / 12)
      month = month % 12
    }
  }

  const finalDay = safeDayForMonth(year, month, preferredDay)
  const next = new Date(year, month, finalDay)

  return next.toISOString().slice(0, 10)
}

function parseDateOnly(value: string) {
  return new Date(`${value}T12:00:00`)
}

function formatChargeTimestamp(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0))
    .toISOString()
}

export function isRecurringChargeDue(
  charge: Pick<RecurringCharge, 'is_active' | 'next_charge_date'>,
  referenceDate = new Date()
) {
  if (!charge.is_active || !charge.next_charge_date) return false
  const dueDate = parseDateOnly(charge.next_charge_date)
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
  return dueDate <= today
}

export function getPendingRecurringOccurrences(
  charge: Pick<RecurringCharge, 'is_active' | 'frequency' | 'charge_day' | 'next_charge_date'>,
  referenceDate = new Date()
) {
  if (!charge.is_active || !charge.next_charge_date) return []

  const occurrences: string[] = []
  let cursor = charge.next_charge_date
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())

  while (parseDateOnly(cursor) <= today) {
    occurrences.push(cursor)
    cursor = calculateNextChargeDateFrom(charge.frequency, charge.charge_day, parseDateOnly(cursor))
  }

  return occurrences
}

export function getPendingRecurringAmount(
  charge: Pick<RecurringCharge, 'amount' | 'is_active' | 'frequency' | 'charge_day' | 'next_charge_date'>,
  referenceDate = new Date()
) {
  return getPendingRecurringOccurrences(charge, referenceDate).length * Number(charge.amount || 0)
}

export function isRecurringChargeAutoPayable(
  charge: Pick<RecurringCharge, 'payment_method_type' | 'affects_cash'>
) {
  if (charge.affects_cash === false) return false
  return charge.payment_method_type === 'account' || charge.payment_method_type === 'credit_card'
}

async function loadCardAccountIds(
  supabase: SupabaseClient,
  charges: RecurringCharge[]
) {
  const cardIds = Array.from(new Set(charges.map((charge) => charge.credit_card_id).filter(Boolean)))

  if (cardIds.length === 0) {
    return new Map<string, string>()
  }

  const { data, error } = await supabase
    .from('credit_cards')
    .select('id, account_id')
    .in('id', cardIds)

  if (error) {
    throw new Error(error.message)
  }

  const result = new Map<string, string>()
  ;(data ?? []).forEach((card: { id: string; account_id: string }) => {
    result.set(card.id, card.account_id)
  })
  return result
}

async function ensureRecurringTransaction(
  supabase: SupabaseClient,
  charge: RecurringCharge,
  chargeDate: string,
  cardAccountIds: Map<string, string>
) {
  const { data: existing, error: existingError } = await supabase
    .from('transactions')
    .select('id')
    .eq('related_recurring_charge_id', charge.id)
    .eq('recurring_charge_run_date', chargeDate)
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message)
  }

  if (existing) {
    return existing
  }

  if (!charge.category_id) {
    throw new Error(`El recurrente "${charge.name}" necesita una categoría para generar movimientos reales.`)
  }

  if (charge.affects_cash === false) {
    throw new Error(`El recurrente "${charge.name}" está configurado como solo recordatorio.`)
  }

  if (!isRecurringChargeAutoPayable(charge)) {
    throw new Error(`El recurrente "${charge.name}" está configurado para decidir el pago al momento.`)
  }

  const isCardCharge = charge.payment_method_type === 'credit_card'
  const sourceAccountId = isCardCharge
    ? cardAccountIds.get(charge.credit_card_id || '')
    : charge.account_id

  if (!sourceAccountId) {
    throw new Error(`No se encontró la cuenta origen para "${charge.name}".`)
  }

  const { error } = await supabase
    .from('transactions')
    .insert({
      user_id: charge.user_id,
      transaction_type: isCardCharge ? 'credit_card_purchase' : 'expense',
      amount: Number(charge.amount || 0),
      transaction_date: formatChargeTimestamp(parseDateOnly(chargeDate)),
      description: charge.description?.trim() ? `${charge.name} - ${charge.description}` : charge.name,
      status: 'completed',
      affects_budget: true,
      source_account_id: sourceAccountId,
      destination_account_id: null,
      category_id: charge.category_id,
      related_credit_card_id: isCardCharge ? charge.credit_card_id : null,
      related_debt_id: null,
      related_recurring_charge_id: charge.id,
      recurring_charge_run_date: chargeDate,
    })

  if (error) {
    throw new Error(error.message)
  }
}

export async function processRecurringCharge(
  supabase: SupabaseClient,
  charge: RecurringCharge,
  cardAccountIds: Map<string, string>,
  referenceDate = new Date()
) {
  const dueDates = getPendingRecurringOccurrences(charge, referenceDate)

  if (dueDates.length === 0) {
    return charge
  }

  for (const dueDate of dueDates) {
    await ensureRecurringTransaction(supabase, charge, dueDate, cardAccountIds)
  }

  const lastProcessedChargeDate = dueDates[dueDates.length - 1]
  const nextChargeDate = calculateNextChargeDateFrom(
    charge.frequency,
    charge.charge_day,
    parseDateOnly(lastProcessedChargeDate)
  )

  const { data, error } = await supabase
    .from('recurring_charges')
    .update({
      next_charge_date: nextChargeDate,
      last_processed_charge_date: lastProcessedChargeDate,
    })
    .eq('id', charge.id)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo actualizar el recurrente procesado.')
  }

  return data as RecurringCharge
}

export async function processRecurringCharges(
  supabase: SupabaseClient,
  charges: RecurringCharge[],
  referenceDate = new Date()
) {
  const autoPayableCharges = charges.filter((charge) => isRecurringChargeAutoPayable(charge))
  const cardAccountIds = await loadCardAccountIds(supabase, autoPayableCharges)
  const processed: RecurringCharge[] = []

  for (const charge of autoPayableCharges) {
    processed.push(await processRecurringCharge(supabase, charge, cardAccountIds, referenceDate))
  }

  return processed
}

export async function settleRecurringCharge(
  supabase: SupabaseClient,
  charge: RecurringCharge,
  paymentMethodType: 'account' | 'credit_card',
  paymentSourceId: string,
  referenceDate = new Date()
) {
  if (!charge.is_active || !charge.next_charge_date) {
    throw new Error('Este recurrente no tiene un cobro pendiente por liquidar.')
  }

  if (!charge.category_id) {
    throw new Error(`El recurrente "${charge.name}" necesita una categoría para generar movimientos reales.`)
  }

  if (charge.affects_cash === false) {
    throw new Error(`El recurrente "${charge.name}" está configurado como solo recordatorio.`)
  }

  const dueDates = getPendingRecurringOccurrences(charge, referenceDate)
  if (dueDates.length === 0) {
    throw new Error('Este recurrente todavía no vence.')
  }

  const chargeDate = dueDates[0]
  const runDate = chargeDate
  const isCardCharge = paymentMethodType === 'credit_card'
  let sourceAccountId = paymentSourceId

  if (isCardCharge) {
    const { data: card, error: cardError } = await supabase
      .from('credit_cards')
      .select('id, account_id')
      .eq('id', paymentSourceId)
      .single()

    if (cardError || !card) {
      throw new Error(cardError?.message || 'No se encontró la tarjeta seleccionada.')
    }

    sourceAccountId = card.account_id
  }

  const { data: existing, error: existingError } = await supabase
    .from('transactions')
    .select('id')
    .eq('related_recurring_charge_id', charge.id)
    .eq('recurring_charge_run_date', runDate)
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message)
  }

  if (existing) {
    throw new Error('Este recurrente ya fue liquidado para la fecha actual.')
  }

  const { error: insertError } = await supabase
    .from('transactions')
    .insert({
      user_id: charge.user_id,
      transaction_type: isCardCharge ? 'credit_card_purchase' : 'expense',
      amount: Number(charge.amount || 0),
      transaction_date: formatChargeTimestamp(parseDateOnly(chargeDate)),
      description: charge.description?.trim() ? `${charge.name} - ${charge.description}` : charge.name,
      status: 'completed',
      affects_budget: true,
      source_account_id: sourceAccountId,
      destination_account_id: null,
      category_id: charge.category_id,
      related_credit_card_id: isCardCharge ? paymentSourceId : null,
      related_debt_id: null,
      related_recurring_charge_id: charge.id,
      recurring_charge_run_date: runDate,
    })

  if (insertError) {
    throw new Error(insertError.message)
  }

  const nextChargeDate = calculateNextChargeDateFrom(
    charge.frequency,
    charge.charge_day,
    parseDateOnly(chargeDate)
  )

  const { data, error } = await supabase
    .from('recurring_charges')
    .update({
      next_charge_date: nextChargeDate,
      last_processed_charge_date: chargeDate,
    })
    .eq('id', charge.id)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo actualizar el recurrente liquidado.')
  }

  return data as RecurringCharge
}
