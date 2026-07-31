import {
  getInstallmentChargeDate,
  type CreditCardInstallment,
} from '@/lib/credit-card-installments'

export type StatementTransaction = {
  id: string
  transaction_type: string
  amount: number
  transaction_date: string
  status?: string | null
  affects_balance?: boolean | null
  related_installment_id?: string | null
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
  return value.toISOString().slice(0, 10)
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
}: {
  card: StatementCard
  transactions: StatementTransaction[]
  installments: CreditCardInstallment[]
  referenceDate?: string | Date
}): CreditCardStatementPreview {
  const cutoffDate = getLastClosedCutoffDate(card.statement_cutoff_day, referenceDate)
  const previousCutoffDate = getPreviousCutoffDate(cutoffDate, card.statement_cutoff_day)
  const periodStartDate = addDays(previousCutoffDate, 1)
  const periodEndDate = cutoffDate
  const paymentDueDate = getPaymentDueDateForCutoff(cutoffDate, card.payment_due_day)

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

  transactions.forEach((tx) => {
    if ((tx.status || 'completed') !== 'completed' || tx.affects_balance === false) return

    const txDate = parseDateOnly(tx.transaction_date)
    if (!isInRange(txDate, periodStartDate, periodEndDate)) return

    transactionCount += 1
    const amount = Number(tx.amount || 0)

    if (tx.transaction_type === 'credit_card_purchase') {
      if (msiPurchaseIds.has(tx.id)) {
        msiPurchaseTotalsExcluded += amount
        return
      }

      if (tx.related_installment_id) {
        msiMonthlyTransactionIds.add(tx.related_installment_id)
        msiChargesFromTransactions += amount
        return
      }

      normalPurchases += amount
      return
    }

    if (tx.transaction_type === 'credit_card_refund') {
      refunds += amount
      return
    }

    if (tx.transaction_type === 'credit_card_payment') {
      payments += amount
    }
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
    cutoffDate: formatDateOnly(cutoffDate),
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
  }
}
