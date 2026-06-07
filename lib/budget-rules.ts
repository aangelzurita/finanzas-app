export type BudgetRuleTransaction = {
  id: string
  transaction_type: string
  affects_budget?: boolean | null
  status?: string | null
}

export function isCompletedTransaction(tx: Pick<BudgetRuleTransaction, 'status'>) {
  return (tx.status || 'completed') === 'completed'
}

export function isBudgetAffectingTransaction(
  tx: BudgetRuleTransaction,
  msiPurchaseIds: Set<string> = new Set()
) {
  if (!isCompletedTransaction(tx) || !tx.affects_budget) return false
  if (tx.transaction_type === 'expense') return true
  if (tx.transaction_type === 'credit_card_purchase') return !msiPurchaseIds.has(tx.id)

  return false
}
