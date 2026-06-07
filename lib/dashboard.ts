import { formatMoney } from '@/lib/utils'
import { isBudgetAffectingTransaction, isCompletedTransaction } from '@/lib/budget-rules'
import {
  getInstallmentChargeDate,
  getInstallmentDisplayState,
  type CreditCardInstallment,
} from '@/lib/credit-card-installments'
import type { RecurringCharge } from '@/lib/recurring-charges'

export type Account = {
  id: string
  name: string
  account_type: string
  current_balance: number
}

export type Transaction = {
  id: string
  transaction_type: string
  amount: number
  description: string | null
  transaction_date: string
  category_id: string | null
  source_account_id?: string | null
  destination_account_id?: string | null
  related_credit_card_id?: string | null
  related_installment_id?: string | null
  affects_budget?: boolean
  status?: string
}

export type Reminder = {
  id: string
  title: string
  due_date: string
  amount: number | null
  status: string
}

export type Category = {
  id: string
  name: string
  category_type: string
}

export type Budget = {
  id: string
  category_id: string
  period_month: number
  period_year: number
  budget_amount: number
}

export type CreditCard = {
  id: string
  name: string
  current_balance: number
  payment_due_day: number
  statement_cutoff_day: number
  minimum_payment: number
  no_interest_payment: number
}

export type Debt = {
  id: string
  current_balance: number
}

export type BudgetProgress = {
  id: string
  categoryName: string
  budgetAmount: number
  spent: number
  remaining: number
  progress: number
}

export type CommitmentItem = {
  id: string
  title: string
  dueDate: string
  amount: number
  tone: 'slate' | 'sky' | 'violet' | 'rose' | 'amber'
  meta: string
}

export type UpcomingCardPayment = CreditCard & {
  dueDate: string
  cutoffDate: string
}

export function nextDateForDay(day: number) {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), day, 9, 0, 0, 0)

  if (target <= now) {
    target.setMonth(target.getMonth() + 1)
  }

  return target.toISOString()
}

export function daysUntilDate(value: string) {
  const today = new Date()
  const target = new Date(value)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const diff = end.getTime() - start.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function buildBudgetRows(
  budgets: Budget[],
  monthTransactions: Transaction[],
  categoryMap: Map<string, string>,
  installmentBudgetAmounts: Map<string, number> = new Map(),
  msiPurchaseIds: Set<string> = new Set()
) {
  return budgets
    .map((budget) => {
      const spent = monthTransactions
        .filter((tx) =>
          tx.category_id === budget.category_id &&
          isBudgetAffectingTransaction(tx, msiPurchaseIds)
        )
        .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)
        + Number(installmentBudgetAmounts.get(budget.category_id) || 0)

      const budgetAmount = Number(budget.budget_amount || 0)
      const remaining = budgetAmount - spent
      const progress = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0

      return {
        id: budget.id,
        categoryName: categoryMap.get(budget.category_id) || 'Categoría',
        budgetAmount,
        spent,
        remaining,
        progress,
      }
    })
    .sort((a, b) => b.progress - a.progress)
}

export function buildDashboardMetrics(
  accounts: Account[],
  monthTransactions: Transaction[],
  recurring: RecurringCharge[],
  debts: Debt[],
  installments: CreditCardInstallment[],
  budgetRows: BudgetProgress[],
  getPendingRecurringAmount: (charge: RecurringCharge) => number,
  getPendingInstallmentAmount: (plan: CreditCardInstallment) => number,
  msiPurchaseIds: Set<string> = new Set()
) {
  const disponible = accounts
    .filter((account) => ['cash', 'debit'].includes(account.account_type))
    .reduce((acc, account) => acc + Number(account.current_balance || 0), 0)

  const deuda = accounts
    .filter((account) => account.account_type === 'credit_card')
    .reduce((acc, account) => acc + Number(account.current_balance || 0), 0) +
    debts.reduce((acc, debt) => acc + Number(debt.current_balance || 0), 0)

  const totalIncome = monthTransactions
    .filter((tx) => isCompletedTransaction(tx) && tx.transaction_type === 'income')
    .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)

  const generatedExpense = monthTransactions
    .filter((tx) =>
      isCompletedTransaction(tx) &&
      ['expense', 'credit_card_purchase'].includes(tx.transaction_type) &&
      !msiPurchaseIds.has(tx.id)
    )
    .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)

  const cardPayments = monthTransactions
    .filter((tx) => isCompletedTransaction(tx) && tx.transaction_type === 'credit_card_payment')
    .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)

  const debtPayments = monthTransactions
    .filter((tx) => isCompletedTransaction(tx) && tx.transaction_type === 'debt_payment')
    .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)

  const cashOutflow = monthTransactions
    .filter((tx) => isCompletedTransaction(tx) && ['expense', 'credit_card_payment', 'debt_payment'].includes(tx.transaction_type))
    .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)

  const fixedExpense = recurring.reduce((acc, charge) => acc + getPendingRecurringAmount(charge), 0)
  const monthInstallments = installments.reduce((acc, plan) => acc + getPendingInstallmentAmount(plan), 0)
  const totalBudget = budgetRows.reduce((acc, row) => acc + row.budgetAmount, 0)
  const totalBudgetSpent = budgetRows.reduce((acc, row) => acc + row.spent, 0)
  const totalBudgetRemaining = totalBudget - totalBudgetSpent
  const overBudgetCount = budgetRows.filter((row) => row.remaining < 0).length

  return {
    disponible,
    deuda,
    totalIncome,
    generatedExpense,
    cashOutflow,
    cardPayments,
    debtPayments,
    fixedExpense,
    monthInstallments,
    totalBudget,
    totalBudgetSpent,
    totalBudgetRemaining,
    overBudgetCount,
  }
}

export function buildUpcomingCardPayments(cards: CreditCard[]) {
  return cards
    .filter((card) =>
      Number(card.current_balance || 0) > 0 &&
      (Number(card.minimum_payment || 0) > 0 || Number(card.no_interest_payment || 0) > 0)
    )
    .map((card) => ({
      ...card,
      dueDate: nextDateForDay(card.payment_due_day),
      cutoffDate: nextDateForDay(card.statement_cutoff_day),
    }))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5)
}

export function buildConsolidatedCommitments(
  reminders: Reminder[],
  monthInstallmentPlans: CreditCardInstallment[],
  dueRecurringCharges: RecurringCharge[],
  upcomingCardPayments: UpcomingCardPayment[],
  getPendingRecurringAmount: (charge: RecurringCharge) => number
) {
  const reminderItems: CommitmentItem[] = reminders.map((reminder) => ({
    id: `reminder-${reminder.id}`,
    title: reminder.title,
    dueDate: reminder.due_date,
    amount: Number(reminder.amount || 0),
    tone: 'slate',
    meta: 'Recordatorio',
  }))

  const installmentItems: CommitmentItem[] = monthInstallmentPlans.map((plan) => {
    const displayState = getInstallmentDisplayState(plan)

    return {
      id: `installment-${plan.id}`,
      title: plan.description,
      dueDate: getInstallmentChargeDate(plan, displayState.currentInstallmentNumber).toISOString(),
      amount: Number(plan.monthly_amount || 0),
      tone: 'sky',
      meta: `MSI próxima ${displayState.currentInstallmentNumber}/${plan.total_months}`,
    }
  })

  const recurringItems: CommitmentItem[] = dueRecurringCharges.map((charge) => ({
    id: `recurring-${charge.id}`,
    title: charge.name,
    dueDate: charge.next_charge_date || new Date().toISOString(),
    amount: getPendingRecurringAmount(charge),
    tone: 'violet',
    meta:
      charge.payment_method_type === 'credit_card'
        ? 'Recurrente en tarjeta'
        : charge.payment_method_type === 'account'
          ? 'Recurrente en cuenta'
          : 'Recurrente por definir',
  }))

  const cardItems: CommitmentItem[] = upcomingCardPayments.map((card) => ({
    id: `card-${card.id}`,
    title: `Pago ${card.name}`,
    dueDate: card.dueDate,
    amount: Number(card.no_interest_payment || card.minimum_payment || 0),
    tone: Number(card.no_interest_payment || 0) > 0 ? 'amber' : 'rose',
    meta: Number(card.no_interest_payment || 0) > 0
      ? `No intereses ${formatMoney(Number(card.no_interest_payment || 0))}`
      : `Pago mínimo ${formatMoney(Number(card.minimum_payment || 0))}`,
  }))

  return [...reminderItems, ...installmentItems, ...recurringItems, ...cardItems]
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 8)
}

export function buildCategoryChartData(
  monthTransactions: Transaction[],
  categories: Category[],
  installmentBudgetAmounts: Map<string, number> = new Map(),
  msiPurchaseIds: Set<string> = new Set()
) {
  const counts = new Map<string, number>()
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]))

  monthTransactions
    .filter((tx) => isBudgetAffectingTransaction(tx, msiPurchaseIds))
    .forEach((tx) => {
      const categoryName = tx.category_id ? (categoryMap.get(tx.category_id) || 'Otros') : 'Sin categoría'
      counts.set(categoryName, (counts.get(categoryName) || 0) + Number(tx.amount))
    })

  installmentBudgetAmounts.forEach((amount, categoryId) => {
    const categoryName = categoryMap.get(categoryId) || 'MSI'
    counts.set(categoryName, (counts.get(categoryName) || 0) + Number(amount || 0))
  })

  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
}
