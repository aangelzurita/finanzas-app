import {
  getInstallmentChargeDate,
  type CreditCardInstallment,
} from '@/lib/credit-card-installments'

export type StatementTransaction = {
  id: string
  transaction_type: string
  amount: number
  description?: string | null
  transaction_date: string
  status?: string | null
  affects_balance?: boolean | null
  affects_statement?: boolean | null
  related_installment_id?: string | null
}

export type CreditCardStatementItemRole =
  | 'normal_purchase'
  | 'msi_total_excluded'
  | 'msi_charge'
  | 'refund'
  | 'payment'
  | 'other'

export type CreditCardStatementPreviewItem = {
  transactionId: string
  transactionType: string
  transactionDate: string
  description: string | null
  amount: number
  affectsBalance: boolean
  affectsStatement: boolean
  itemRole: CreditCardStatementItemRole
}

export type StatementCard = {
  current_balance: number
  statement_cutoff_day: number
  payment_due_day: number
  minimum_payment?: number | null
  no_interest_payment?: number | null
}

export type CreditCardStatementPreview = {
  cutoffDate: string
  previousCutoffDate: string
  periodStartDate: string
  periodEndDate: string
  paymentDueDate: string
  normalPurchases: number
  msiPurchaseTotalsExcluded: number
  msiCharges: number
  refunds: number
  payments: number
  estimatedNoInterestPayment: number
  suggestedMinimumPayment: number
  transactionCount: number
  balanceAffectingTransactionCount: number
  informationalTransactionCount: number
  ignoredTransactionCount: number
  statementItems: CreditCardStatementPreviewItem[]
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function parseDateOnly(value: string | Date) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  return new Date(`${value.slice(0, 10)}T12:00:00`)
}

function formatDateOnly(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function safeDayForMonth(year: number, month: number, preferredDay: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return Math.min(Math.max(1, preferredDay), lastDay)
}

function dateForDay(year: number, month: number, day: number) {
  return new Date(year, month, safeDayForMonth(year, month, day), 12, 0, 0, 0)
}

function isInRange(value: Date, from: Date, to: Date) {
  return value >= from && value <= to
}

export function getLastClosedCutoffDate(cutoffDay: number, referenceDate: string | Date = new Date()) {
  const reference = parseDateOnly(referenceDate)
  const currentMonthCutoff = dateForDay(reference.getFullYear(), reference.getMonth(), cutoffDay)

  if (currentMonthCutoff <= reference) return currentMonthCutoff
  return dateForDay(reference.getFullYear(), reference.getMonth() - 1, cutoffDay)
}

export function getPreviousCutoffDate(cutoffDate: string | Date, cutoffDay: number) {
  const cutoff = parseDateOnly(cutoffDate)
  return dateForDay(cutoff.getFullYear(), cutoff.getMonth() - 1, cutoffDay)
}

export function getPaymentDueDateForCutoff(
  cutoffDate: string | Date,
  paymentDueDay: number
) {
  const cutoff = parseDateOnly(cutoffDate)
  const cutoffDay = cutoff.getDate()
  const monthOffset = paymentDueDay <= cutoffDay ? 1 : 0
  return dateForDay(cutoff.getFullYear(), cutoff.getMonth() + monthOffset, paymentDueDay)
}

export function calculateCreditCardStatementPreview({
  card,
  transactions,
  installments,
  referenceDate = new Date(),
  cutoffDate,
}: {
  card: StatementCard
  transactions: StatementTransaction[]
  installments: CreditCardInstallment[]
  referenceDate?: string | Date
  cutoffDate?: string | Date
}): CreditCardStatementPreview {
  const selectedCutoffDate = cutoffDate
    ? parseDateOnly(cutoffDate)
    : getLastClosedCutoffDate(card.statement_cutoff_day, referenceDate)
  const previousCutoffDate = getPreviousCutoffDate(selectedCutoffDate, card.statement_cutoff_day)
  const periodStartDate = addDays(previousCutoffDate, 1)
  const periodEndDate = selectedCutoffDate
  const paymentDueDate = getPaymentDueDateForCutoff(selectedCutoffDate, card.payment_due_day)

  const msiPurchaseIds = new Set(
    installments
      .map((plan) => plan.purchase_transaction_id)
      .filter(Boolean) as string[]
  )

  const msiMonthlyTransactionIds = new Set<string>()
  let normalPurchases = 0
  let msiPurchaseTotalsExcluded = 0
  let msiChargesFromTransactions = 0
  let refunds = 0
  let payments = 0
  let transactionCount = 0
  let balanceAffectingTransactionCount = 0
  let informationalTransactionCount = 0
  let ignoredTransactionCount = 0
  const statementItems: CreditCardStatementPreviewItem[] = []

  transactions.forEach((tx) => {
    if ((tx.status || 'completed') !== 'completed') {
      ignoredTransactionCount += 1
      return
    }

    if (tx.affects_statement === false) {
      ignoredTransactionCount += 1
      return
    }

    const txDate = parseDateOnly(tx.transaction_date)
    if (!isInRange(txDate, periodStartDate, periodEndDate)) return

    transactionCount += 1
    if (tx.affects_balance === false) {
      informationalTransactionCount += 1
    } else {
      balanceAffectingTransactionCount += 1
    }

    const amount = Number(tx.amount || 0)
    const baseItem = {
      transactionId: tx.id,
      transactionType: tx.transaction_type,
      transactionDate: tx.transaction_date,
      description: tx.description ?? null,
      amount: roundMoney(amount),
      affectsBalance: tx.affects_balance !== false,
      affectsStatement: true,
    }

    if (tx.transaction_type === 'credit_card_purchase') {
      if (msiPurchaseIds.has(tx.id)) {
        msiPurchaseTotalsExcluded += amount
        statementItems.push({ ...baseItem, itemRole: 'msi_total_excluded' })
        return
      }

      if (tx.related_installment_id) {
        msiMonthlyTransactionIds.add(tx.related_installment_id)
        msiChargesFromTransactions += amount
        statementItems.push({ ...baseItem, itemRole: 'msi_charge' })
        return
      }

      normalPurchases += amount
      statementItems.push({ ...baseItem, itemRole: 'normal_purchase' })
      return
    }

    if (tx.transaction_type === 'credit_card_refund') {
      refunds += amount
      statementItems.push({ ...baseItem, itemRole: 'refund' })
      return
    }

    if (tx.transaction_type === 'credit_card_payment') {
      payments += amount
      statementItems.push({ ...baseItem, itemRole: 'payment' })
      return
    }

    statementItems.push({ ...baseItem, itemRole: 'other' })
  })

  const scheduledMsiCharges = installments.reduce((acc, plan) => {
    if (plan.status === 'canceled') return acc
    if (msiMonthlyTransactionIds.has(plan.id)) return acc

    for (let installmentNumber = 1; installmentNumber <= Number(plan.total_months || 0); installmentNumber += 1) {
      const chargeDate = getInstallmentChargeDate(plan, installmentNumber)
      if (isInRange(chargeDate, periodStartDate, periodEndDate)) {
        return acc + Number(plan.monthly_amount || 0)
      }
    }

    return acc
  }, 0)

  const msiCharges = roundMoney(msiChargesFromTransactions + scheduledMsiCharges)
  const estimatedNoInterestPayment = Math.max(
    0,
    roundMoney(normalPurchases + msiCharges - refunds)
  )

  return {
    cutoffDate: formatDateOnly(selectedCutoffDate),
    previousCutoffDate: formatDateOnly(previousCutoffDate),
    periodStartDate: formatDateOnly(periodStartDate),
    periodEndDate: formatDateOnly(periodEndDate),
    paymentDueDate: formatDateOnly(paymentDueDate),
    normalPurchases: roundMoney(normalPurchases),
    msiPurchaseTotalsExcluded: roundMoney(msiPurchaseTotalsExcluded),
    msiCharges,
    refunds: roundMoney(refunds),
    payments: roundMoney(payments),
    estimatedNoInterestPayment,
    suggestedMinimumPayment: roundMoney(Number(card.minimum_payment || 0)),
    transactionCount,
    balanceAffectingTransactionCount,
    informationalTransactionCount,
    ignoredTransactionCount,
    statementItems,
  }
}
