import type { SupabaseClient } from '@supabase/supabase-js'

export type CreditCardInstallmentStatus = 'active' | 'completed' | 'canceled'

export type CreditCardInstallment = {
  id: string
  user_id: string
  credit_card_id: string
  purchase_transaction_id?: string | null
  category_id: string | null
  description: string
  total_amount: number
  monthly_amount: number
  total_months: number
  current_installment_number: number
  remaining_installments: number
  charge_day: number
  start_date: string
  last_processed_installment_number?: number | null
  last_charge_date?: string | null
  notes: string | null
  status: CreditCardInstallmentStatus
  created_at?: string
  updated_at?: string
}

export type InstallmentPlanDraft = {
  userId: string
  creditCardId: string
  purchaseTransactionId?: string | null
  categoryId: string
  description: string
  totalAmount: number
  monthlyAmount: number
  totalMonths: number
  currentInstallmentNumber: number
  chargeDay: number
  startDate?: string
  notes?: string | null
}

function safeDayForMonth(year: number, month: number, day: number) {
  return Math.min(day, new Date(year, month + 1, 0).getDate())
}

function buildDate(year: number, month: number, day: number) {
  return new Date(year, month, safeDayForMonth(year, month, day))
}

function formatISODate(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString()
    .slice(0, 10)
}

function formatISOTimestamp(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0))
    .toISOString()
}

function monthDiff(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

function getLastProcessedInstallmentNumber(
  plan: Pick<CreditCardInstallment, 'current_installment_number' | 'last_processed_installment_number'>
) {
  const fallback = Math.max(0, Number(plan.current_installment_number || 1) - 1)
  return Math.max(0, Number(plan.last_processed_installment_number ?? fallback))
}

export function getInstallmentDueNumber(
  plan: Pick<CreditCardInstallment, 'total_months' | 'charge_day' | 'start_date'>,
  referenceDate = new Date()
) {
  const startDate = new Date(`${plan.start_date}T12:00:00`)
  const elapsedMonths = Math.max(0, monthDiff(startDate, referenceDate))
  return Math.min(plan.total_months, elapsedMonths + 1)
}

export function getInstallmentChargeDate(
  plan: Pick<CreditCardInstallment, 'start_date' | 'charge_day'>,
  installmentNumber: number
) {
  const startDate = new Date(`${plan.start_date}T12:00:00`)
  return buildDate(
    startDate.getFullYear(),
    startDate.getMonth() + (installmentNumber - 1),
    plan.charge_day
  )
}

export function getPendingInstallmentCount(
  plan: Pick<
    CreditCardInstallment,
    'status' | 'total_months' | 'current_installment_number' | 'last_processed_installment_number' | 'charge_day' | 'start_date'
  >,
  referenceDate = new Date()
) {
  if (plan.status !== 'active') return 0

  const dueNumber = getInstallmentDueNumber(plan, referenceDate)
  const lastProcessed = getLastProcessedInstallmentNumber(plan)

  return Math.max(0, dueNumber - lastProcessed)
}

export function getPendingInstallmentAmount(
  plan: Pick<
    CreditCardInstallment,
    'status' | 'total_months' | 'current_installment_number' | 'last_processed_installment_number' | 'charge_day' | 'start_date' | 'monthly_amount'
  >,
  referenceDate = new Date()
) {
  return getPendingInstallmentCount(plan, referenceDate) * Number(plan.monthly_amount || 0)
}

export function calculateMonthlyInstallment(totalAmount: number, totalMonths: number) {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isInteger(totalMonths) || totalMonths <= 0) {
    return 0
  }

  return Number((totalAmount / totalMonths).toFixed(2))
}

export function calculateTotalAmount(monthlyAmount: number, totalMonths: number) {
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0 || !Number.isInteger(totalMonths) || totalMonths <= 0) {
    return 0
  }

  return Number((monthlyAmount * totalMonths).toFixed(2))
}

export function calculateRemainingInstallments(totalMonths: number, currentInstallmentNumber: number) {
  return Math.max(0, totalMonths - (currentInstallmentNumber - 1))
}

export function getOutstandingInstallmentCount(
  plan: Pick<CreditCardInstallment, 'total_months' | 'current_installment_number' | 'last_processed_installment_number'>
) {
  const totalMonths = Number(plan.total_months || 0)
  const lastProcessed = getLastProcessedInstallmentNumber(plan)
  return Math.max(0, totalMonths - lastProcessed)
}

export function getInstallmentDisplayState(
  plan: Pick<
    CreditCardInstallment,
    'status' | 'total_months' | 'current_installment_number' | 'last_processed_installment_number'
  >
) {
  if (plan.status === 'completed') {
    return {
      currentInstallmentNumber: Number(plan.total_months || 0),
      remainingInstallments: 0,
    }
  }

  const totalMonths = Number(plan.total_months || 0)
  const lastProcessed = getLastProcessedInstallmentNumber(plan)
  const nextInstallment = Math.min(
    totalMonths,
    Math.max(Number(plan.current_installment_number || 1), lastProcessed + (lastProcessed < totalMonths ? 1 : 0))
  )

  return {
    currentInstallmentNumber: nextInstallment,
    remainingInstallments: Math.max(0, totalMonths - nextInstallment),
  }
}

export function inferInstallmentStartDate(
  currentInstallmentNumber: number,
  chargeDay: number,
  referenceDate = new Date()
) {
  const currentChargeDate = buildDate(referenceDate.getFullYear(), referenceDate.getMonth(), chargeDay)
  currentChargeDate.setMonth(currentChargeDate.getMonth() - (currentInstallmentNumber - 1))
  return formatISODate(currentChargeDate)
}

export function validateInstallmentDraft(draft: {
  categoryId: string
  totalAmount: number
  monthlyAmount: number
  totalMonths: number
  currentInstallmentNumber: number
  chargeDay: number
}) {
  if (!draft.categoryId) return 'Selecciona una categoría para el MSI.'
  if (!Number.isFinite(draft.totalAmount) || draft.totalAmount <= 0) return 'Ingresa un monto total válido para el MSI.'
  if (!Number.isFinite(draft.monthlyAmount) || draft.monthlyAmount <= 0) return 'Ingresa una mensualidad válida para el MSI.'
  if (!Number.isInteger(draft.totalMonths) || draft.totalMonths <= 0) return 'Ingresa los meses totales del MSI.'
  if (
    !Number.isInteger(draft.currentInstallmentNumber) ||
    draft.currentInstallmentNumber < 1 ||
    draft.currentInstallmentNumber > draft.totalMonths
  ) {
    return 'La próxima mensualidad debe estar entre 1 y el total de meses.'
  }
  if (!Number.isInteger(draft.chargeDay) || draft.chargeDay < 1 || draft.chargeDay > 31) {
    return 'Ingresa un día de cargo válido entre 1 y 31.'
  }
  return null
}

export function buildInstallmentInsertPayload(draft: InstallmentPlanDraft) {
  return {
    user_id: draft.userId,
    credit_card_id: draft.creditCardId,
    purchase_transaction_id: draft.purchaseTransactionId ?? null,
    category_id: draft.categoryId,
    description: draft.description.trim(),
    total_amount: draft.totalAmount,
    monthly_amount: draft.monthlyAmount,
    total_months: draft.totalMonths,
    current_installment_number: draft.currentInstallmentNumber,
    remaining_installments: calculateRemainingInstallments(draft.totalMonths, draft.currentInstallmentNumber),
    last_processed_installment_number: Math.max(0, draft.currentInstallmentNumber - 1),
    charge_day: draft.chargeDay,
    start_date: draft.startDate || inferInstallmentStartDate(draft.currentInstallmentNumber, draft.chargeDay),
    last_charge_date: null,
    notes: draft.notes?.trim() || null,
    status: 'active' as const,
  }
}

export async function createInstallmentPlan(
  supabase: SupabaseClient,
  draft: InstallmentPlanDraft
) {
  const payload = buildInstallmentInsertPayload(draft)
  const { data, error } = await supabase
    .from('credit_card_installments')
    .insert(payload)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo guardar el MSI.')
  }

  return data as CreditCardInstallment
}

export function deriveInstallmentState(
  plan: Pick<
    CreditCardInstallment,
    'total_months' | 'current_installment_number' | 'remaining_installments' | 'charge_day' | 'start_date' | 'status' | 'last_processed_installment_number'
  >,
  referenceDate = new Date()
) {
  const lastProcessed = getLastProcessedInstallmentNumber(plan)

  if (plan.status === 'canceled') {
    return {
      current_installment_number: plan.current_installment_number,
      remaining_installments: Math.max(0, plan.total_months - lastProcessed),
      last_processed_installment_number: lastProcessed,
      status: plan.status,
    }
  }

  const dueNumber = getInstallmentDueNumber(plan, referenceDate)
  const completed = lastProcessed >= plan.total_months
  const remaining = Math.max(0, plan.total_months - lastProcessed)

  return {
    current_installment_number: completed ? plan.total_months : dueNumber,
    remaining_installments: completed ? 0 : remaining,
    last_processed_installment_number: lastProcessed,
    status: completed ? ('completed' as const) : ('active' as const),
  }
}

export function isInstallmentDueThisMonth(
  plan: Pick<
    CreditCardInstallment,
    'status' | 'total_months' | 'current_installment_number' | 'last_processed_installment_number' | 'charge_day' | 'start_date'
  >,
  referenceDate = new Date()
) {
  return getPendingInstallmentCount(plan, referenceDate) > 0
}

export async function syncInstallmentPlan(
  supabase: SupabaseClient,
  plan: CreditCardInstallment,
  referenceDate = new Date()
) {
  const derived = deriveInstallmentState(plan, referenceDate)

  if (
    derived.current_installment_number === plan.current_installment_number &&
    derived.remaining_installments === plan.remaining_installments &&
    derived.status === plan.status
  ) {
    return plan
  }

  const { data, error } = await supabase
    .from('credit_card_installments')
    .update(derived)
    .eq('id', plan.id)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo sincronizar el MSI.')
  }

  return data as CreditCardInstallment
}

export async function syncInstallmentPlans(
  supabase: SupabaseClient,
  plans: CreditCardInstallment[],
  referenceDate = new Date()
) {
  const syncedPlans: CreditCardInstallment[] = []

  for (const plan of plans) {
    if (plan.status === 'active') {
      syncedPlans.push(await syncInstallmentPlan(supabase, plan, referenceDate))
    } else {
      syncedPlans.push(plan)
    }
  }

  return syncedPlans
}

function buildInstallmentTransactionDescription(
  plan: Pick<CreditCardInstallment, 'description' | 'total_months'>,
  installmentNumber: number
) {
  return `${plan.description} MSI ${installmentNumber}/${plan.total_months}`
}

async function ensureInstallmentTransaction(
  supabase: SupabaseClient,
  plan: CreditCardInstallment,
  cardAccountId: string,
  installmentNumber: number
) {
  if (plan.purchase_transaction_id) {
    return null
  }

  const { data: existing, error: existingError } = await supabase
    .from('transactions')
    .select('id')
    .eq('related_installment_id', plan.id)
    .eq('installment_sequence', installmentNumber)
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message)
  }

  if (existing) {
    return existing
  }

  if (!plan.category_id) {
    throw new Error('El MSI necesita una categoría para poder generar la compra mensual real.')
  }

  const chargeDate = getInstallmentChargeDate(plan, installmentNumber)
  const { error } = await supabase
    .from('transactions')
    .insert({
      user_id: plan.user_id,
      transaction_type: 'credit_card_purchase',
      amount: Number(plan.monthly_amount || 0),
      transaction_date: formatISOTimestamp(chargeDate),
      description: buildInstallmentTransactionDescription(plan, installmentNumber),
      status: 'completed',
      affects_budget: true,
      source_account_id: cardAccountId,
      destination_account_id: null,
      category_id: plan.category_id,
      related_credit_card_id: plan.credit_card_id,
      related_debt_id: null,
      related_installment_id: plan.id,
      installment_sequence: installmentNumber,
    })

  if (error) {
    throw new Error(error.message)
  }
}

export async function processInstallmentPlanCharges(
  supabase: SupabaseClient,
  plan: CreditCardInstallment,
  cardAccountId: string,
  referenceDate = new Date()
) {
  if (plan.status !== 'active') {
    return plan
  }

  if (plan.purchase_transaction_id) {
    return syncInstallmentPlan(supabase, plan, referenceDate)
  }

  const dueNumber = getInstallmentDueNumber(plan, referenceDate)
  const lastProcessed = getLastProcessedInstallmentNumber(plan)

  if (dueNumber <= lastProcessed) {
    return syncInstallmentPlan(supabase, plan, referenceDate)
  }

  for (let installmentNumber = lastProcessed + 1; installmentNumber <= dueNumber; installmentNumber += 1) {
    await ensureInstallmentTransaction(supabase, plan, cardAccountId, installmentNumber)
  }

  const lastChargeDate = formatISODate(getInstallmentChargeDate(plan, dueNumber))
  const nextStatus = dueNumber >= plan.total_months ? 'completed' : 'active'

  const { data, error } = await supabase
    .from('credit_card_installments')
    .update({
      current_installment_number: dueNumber,
      last_processed_installment_number: dueNumber,
      remaining_installments: Math.max(0, plan.total_months - dueNumber),
      last_charge_date: lastChargeDate,
      status: nextStatus,
    })
    .eq('id', plan.id)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo actualizar el MSI procesado.')
  }

  return data as CreditCardInstallment
}

export async function processInstallmentPlansForCard(
  supabase: SupabaseClient,
  plans: CreditCardInstallment[],
  cardAccountId: string,
  referenceDate = new Date()
) {
  const processed: CreditCardInstallment[] = []

  for (const plan of plans) {
    processed.push(await processInstallmentPlanCharges(supabase, plan, cardAccountId, referenceDate))
  }

  return processed
}
