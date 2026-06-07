import type { CreditCardInstallment } from '@/lib/credit-card-installments'

export type CardReconciliationTransaction = {
  id: string
  transaction_type: string
  amount: number
  status?: string | null
  affects_balance?: boolean | null
  related_installment_id?: string | null
}

export type CardReconciliationInput = {
  currentBalance: number
  initialBalance?: number
  transactions: CardReconciliationTransaction[]
  installments?: Pick<CreditCardInstallment, 'purchase_transaction_id'>[]
  tolerance?: number
}

export type CardReconciliationStatus = 'OK' | 'REVISAR'

export type CardReconciliationResult = {
  registeredBalance: number
  initialBalance: number
  normalPurchases: number
  msiPurchases: number
  payments: number
  refunds: number
  movementNet: number
  expectedBalance: number
  difference: number
  absoluteDifference: number
  status: CardReconciliationStatus
  excludedTransactions: number
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function affectsCardBalance(tx: CardReconciliationTransaction) {
  return (tx.status || 'completed') === 'completed' && tx.affects_balance !== false
}

export function reconcileCreditCard({
  currentBalance,
  initialBalance = 0,
  transactions,
  installments = [],
  tolerance = 0.01,
}: CardReconciliationInput): CardReconciliationResult {
  const msiPurchaseIds = new Set(
    installments
      .map((plan) => plan.purchase_transaction_id)
      .filter(Boolean) as string[]
  )

  let normalPurchases = 0
  let msiPurchases = 0
  let payments = 0
  let refunds = 0
  let excludedTransactions = 0

  transactions.forEach((tx) => {
    if (!affectsCardBalance(tx)) {
      excludedTransactions += 1
      return
    }

    const amount = Number(tx.amount || 0)

    if (tx.transaction_type === 'credit_card_purchase') {
      if (msiPurchaseIds.has(tx.id) || tx.related_installment_id) {
        msiPurchases += amount
      } else {
        normalPurchases += amount
      }
      return
    }

    if (tx.transaction_type === 'credit_card_payment') {
      payments += amount
      return
    }

    if (tx.transaction_type === 'credit_card_refund') {
      refunds += amount
    }
  })

  const baseline = roundMoney(Number(initialBalance || 0))
  const movementNet = roundMoney(normalPurchases + msiPurchases - payments - refunds)
  const expectedBalance = roundMoney(baseline + movementNet)
  const registeredBalance = roundMoney(Number(currentBalance || 0))
  const difference = roundMoney(registeredBalance - expectedBalance)
  const absoluteDifference = Math.abs(difference)

  return {
    registeredBalance,
    initialBalance: baseline,
    normalPurchases: roundMoney(normalPurchases),
    msiPurchases: roundMoney(msiPurchases),
    payments: roundMoney(payments),
    refunds: roundMoney(refunds),
    movementNet,
    expectedBalance,
    difference,
    absoluteDifference,
    status: absoluteDifference <= tolerance ? 'OK' : 'REVISAR',
    excludedTransactions,
  }
}
