import type { SupabaseClient } from '@supabase/supabase-js'

export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'credit_card_purchase'
  | 'credit_card_payment'
  | 'debt_payment'

export type TransactionLedgerEntry = {
  id?: string
  transaction_type: TransactionType
  amount: number
  source_account_id: string | null
  destination_account_id: string | null
  related_credit_card_id: string | null
  related_debt_id: string | null
  applied_to_minimum_payment?: number | null
  applied_to_no_interest_payment?: number | null
}

function assertAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('El movimiento debe tener un monto mayor a cero.')
  }
}

type CardSnapshot = {
  current_balance: number | null
  minimum_payment: number | null
  no_interest_payment: number | null
}

async function readCard(
  supabase: SupabaseClient,
  cardId: string | null
) {
  if (!cardId) {
    throw new Error('No se encontró la tarjeta para registrar el pago.')
  }

  const { data, error } = await supabase
    .from('credit_cards')
    .select('current_balance, minimum_payment, no_interest_payment')
    .eq('id', cardId)
    .single<CardSnapshot>()

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo cargar la tarjeta.')
  }

  return {
    current_balance: Number(data.current_balance || 0),
    minimum_payment: Number(data.minimum_payment || 0),
    no_interest_payment: Number(data.no_interest_payment || 0),
  }
}

export async function allocateCreditCardPayment(
  supabase: SupabaseClient,
  cardId: string | null,
  amount: number,
  baseline?: CardSnapshot
) {
  assertAmount(amount)

  const card = baseline ?? await readCard(supabase, cardId)

if (card.current_balance == null) {
  throw new Error('La tarjeta no tiene saldo actual definido.')
}

if (amount > card.current_balance) {
  throw new Error('El pago no puede ser mayor al saldo usado de la tarjeta.')
}

return {
  applied_to_minimum_payment: Math.min(amount, Math.max(0, card.minimum_payment ?? 0)),
  applied_to_no_interest_payment: Math.min(amount, Math.max(0, card.no_interest_payment ?? 0)),
}
}

async function buildCardBaselineAfterReversal(
  supabase: SupabaseClient,
  previousTx: TransactionLedgerEntry,
  nextCardId: string | null
) {
  if (!nextCardId) return undefined

  const card = await readCard(supabase, nextCardId)

  if (
    previousTx.transaction_type !== 'credit_card_payment' ||
    previousTx.related_credit_card_id !== nextCardId
  ) {
    return card
  }

  return {
    current_balance: card.current_balance + previousTx.amount,
    minimum_payment: card.minimum_payment + Number(previousTx.applied_to_minimum_payment || 0),
    no_interest_payment: card.no_interest_payment + Number(previousTx.applied_to_no_interest_payment || 0),
  }
}

export async function prepareTransactionForPersistence(
  supabase: SupabaseClient,
  tx: TransactionLedgerEntry,
  previousTx?: TransactionLedgerEntry
) {
  if (tx.transaction_type !== 'credit_card_payment') {
    return {
      ...tx,
      applied_to_minimum_payment: 0,
      applied_to_no_interest_payment: 0,
    }
  }

  const baseline = previousTx
    ? await buildCardBaselineAfterReversal(supabase, previousTx, tx.related_credit_card_id)
    : undefined

  const allocation = await allocateCreditCardPayment(
    supabase,
    tx.related_credit_card_id,
    tx.amount,
    baseline
  )

  return {
    ...tx,
    ...allocation,
  }
}

async function updateCreditCardPaymentMetadata(
  supabase: SupabaseClient,
  cardId: string | null,
  deltaMinimum: number,
  deltaNoInterest: number
) {
  if (!cardId || (deltaMinimum === 0 && deltaNoInterest === 0)) return

  const card = await readCard(supabase, cardId)
  const nextMinimum = card.minimum_payment + deltaMinimum
  const nextNoInterest = card.no_interest_payment + deltaNoInterest

  if (nextMinimum < 0 || nextNoInterest < 0) {
    throw new Error('El pago no puede ser mayor a los montos pendientes de la tarjeta.')
  }

  const { error } = await supabase
    .from('credit_cards')
    .update({
      minimum_payment: nextMinimum,
      no_interest_payment: nextNoInterest,
    })
    .eq('id', cardId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function applyTransactionMetadata(
  supabase: SupabaseClient,
  tx: TransactionLedgerEntry
) {
  if (tx.transaction_type !== 'credit_card_payment') return

  await updateCreditCardPaymentMetadata(
    supabase,
    tx.related_credit_card_id,
    -Number(tx.applied_to_minimum_payment || 0),
    -Number(tx.applied_to_no_interest_payment || 0)
  )
}

export async function reverseTransactionMetadata(
  supabase: SupabaseClient,
  tx: TransactionLedgerEntry
) {
  if (tx.transaction_type !== 'credit_card_payment') return

  await updateCreditCardPaymentMetadata(
    supabase,
    tx.related_credit_card_id,
    Number(tx.applied_to_minimum_payment || 0),
    Number(tx.applied_to_no_interest_payment || 0)
  )
}
