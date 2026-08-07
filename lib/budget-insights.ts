import { isBudgetAffectingTransaction } from '@/lib/budget-rules'
import {
  getInstallmentChargeDate,
  type CreditCardInstallment,
} from '@/lib/credit-card-installments'
import type { Budget, Category, Transaction } from '@/lib/dashboard'
import type { RecurringCharge } from '@/lib/recurring-charges'

export type BudgetPeriod = {
  label: string
  start: Date
  end: Date
  month: number
  year: number
}

export type CategoryBudgetInsight = {
  categoryId: string
  categoryName: string
  currentSpend: number
  realSpend: number
  installmentSpend: number
  futureInstallmentSpend: number
  recurringProjected: number
  average3Months: number
  average6Months: number
  previousMonthSpend: number
  suggestedBudget: number
  currentBudget: number
  trend: 'up' | 'down' | 'flat'
  status: 'over' | 'tight' | 'ok' | 'unbudgeted'
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999)
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1)
}

function isWithinPeriod(value: string | Date, period: Pick<BudgetPeriod, 'start' | 'end'>) {
  const date = value instanceof Date ? value : new Date(value)
  return date >= period.start && date <= period.end
}

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
}

function getCategoryName(categoryId: string | null | undefined, categoryMap: Map<string, string>) {
  if (!categoryId) return 'Sin categoría'
  return categoryMap.get(categoryId) || 'Otros'
}

export function buildMonthPeriod(referenceDate: Date, offset = 0): BudgetPeriod {
  const date = addMonths(referenceDate, offset)
  const start = startOfMonth(date)
  const end = endOfMonth(date)

  return {
    label: start.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }),
    start,
    end,
    month: start.getMonth() + 1,
    year: start.getFullYear(),
  }
}

export function buildRollingPeriod(referenceDate: Date, months: number): BudgetPeriod {
  const currentMonthStart = startOfMonth(referenceDate)
  const start = addMonths(currentMonthStart, -(months - 1))
  const end = endOfMonth(referenceDate)

  return {
    label: `Últimos ${months} meses`,
    start,
    end,
    month: referenceDate.getMonth() + 1,
    year: referenceDate.getFullYear(),
  }
}

export function buildCustomPeriod(startValue: string, endValue: string): BudgetPeriod | null {
  if (!startValue || !endValue) return null
  const start = new Date(`${startValue}T00:00:00`)
  const end = new Date(`${endValue}T23:59:59`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null

  return {
    label: 'Rango personalizado',
    start,
    end,
    month: start.getMonth() + 1,
    year: start.getFullYear(),
  }
}

export function sumRealBudgetSpendByCategory(
  transactions: Transaction[],
  period: Pick<BudgetPeriod, 'start' | 'end'>,
  msiPurchaseIds: Set<string>
) {
  const amounts = new Map<string, number>()

  transactions
    .filter((tx) => isWithinPeriod(tx.transaction_date, period))
    .filter((tx) => isBudgetAffectingTransaction(tx, msiPurchaseIds))
    .forEach((tx) => {
      const key = tx.category_id || 'uncategorized'
      amounts.set(key, Number(amounts.get(key) || 0) + Number(tx.amount || 0))
    })

  return amounts
}

export function sumInstallmentSpendByCategory(
  installments: CreditCardInstallment[],
  period: Pick<BudgetPeriod, 'start' | 'end'>
) {
  const amounts = new Map<string, number>()

  installments.forEach((plan) => {
    if (plan.status === 'canceled' || !plan.category_id || Number(plan.monthly_amount || 0) <= 0) return

    for (let installmentNumber = 1; installmentNumber <= Number(plan.total_months || 0); installmentNumber += 1) {
      const chargeDate = getInstallmentChargeDate(plan, installmentNumber)
      if (!isWithinPeriod(chargeDate, period)) continue

      amounts.set(plan.category_id, Number(amounts.get(plan.category_id) || 0) + Number(plan.monthly_amount || 0))
    }
  })

  return amounts
}

export function sumRecurringProjectionByCategory(
  recurring: RecurringCharge[],
  period: Pick<BudgetPeriod, 'start' | 'end'>
) {
  const amounts = new Map<string, number>()

  recurring.forEach((charge) => {
    if (!charge.is_active || !charge.category_id || Number(charge.amount || 0) <= 0) return
    if (charge.affects_cash === false) return

    const frequencyMultiplier =
      charge.frequency === 'weekly'
        ? 4
        : charge.frequency === 'biweekly'
          ? 2
          : charge.frequency === 'quarterly'
            ? 1 / 3
            : charge.frequency === 'yearly'
              ? 1 / 12
              : 1

    const periodMonths = Math.max(
      1,
      (period.end.getFullYear() - period.start.getFullYear()) * 12 + period.end.getMonth() - period.start.getMonth() + 1
    )
    const projectedAmount = Number(charge.amount || 0) * frequencyMultiplier * periodMonths
    amounts.set(charge.category_id, Number(amounts.get(charge.category_id) || 0) + projectedAmount)
  })

  return amounts
}

export function buildCategoryChartDataForPeriod(
  transactions: Transaction[],
  categories: Category[],
  installments: CreditCardInstallment[],
  period: BudgetPeriod,
  msiPurchaseIds: Set<string>
) {
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]))
  const realAmounts = sumRealBudgetSpendByCategory(transactions, period, msiPurchaseIds)
  const installmentAmounts = sumInstallmentSpendByCategory(installments, period)
  const totals = new Map<string, number>()

  realAmounts.forEach((amount, categoryId) => totals.set(categoryId, Number(totals.get(categoryId) || 0) + amount))
  installmentAmounts.forEach((amount, categoryId) => totals.set(categoryId, Number(totals.get(categoryId) || 0) + amount))

  return Array.from(totals.entries())
    .map(([categoryId, value]) => ({
      categoryId,
      name: getCategoryName(categoryId === 'uncategorized' ? null : categoryId, categoryMap),
      value: roundMoney(value),
    }))
    .sort((a, b) => b.value - a.value)
}

export function buildBudgetInsights({
  transactions,
  categories,
  budgets,
  installments,
  recurring,
  referenceDate,
  currentPeriod,
  msiPurchaseIds,
}: {
  transactions: Transaction[]
  categories: Category[]
  budgets: Budget[]
  installments: CreditCardInstallment[]
  recurring: RecurringCharge[]
  referenceDate: Date
  currentPeriod: BudgetPeriod
  msiPurchaseIds: Set<string>
}): CategoryBudgetInsight[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]))
  const budgetMap = new Map(
    budgets
      .filter((budget) => budget.period_month === currentPeriod.month && budget.period_year === currentPeriod.year)
      .map((budget) => [budget.category_id, Number(budget.budget_amount || 0)])
  )
  const currentReal = sumRealBudgetSpendByCategory(transactions, currentPeriod, msiPurchaseIds)
  const currentInstallments = sumInstallmentSpendByCategory(installments, currentPeriod)
  const nextMonth = buildMonthPeriod(referenceDate, 1)
  const futureInstallments = sumInstallmentSpendByCategory(installments, nextMonth)
  const futureRecurring = sumRecurringProjectionByCategory(recurring, nextMonth)
  const previousMonthSpend = sumRealBudgetSpendByCategory(transactions, buildMonthPeriod(referenceDate, -1), msiPurchaseIds)

  const history3 = [1, 2, 3].map((offset) => sumRealBudgetSpendByCategory(transactions, buildMonthPeriod(referenceDate, -offset), msiPurchaseIds))
  const history6 = [1, 2, 3, 4, 5, 6].map((offset) => sumRealBudgetSpendByCategory(transactions, buildMonthPeriod(referenceDate, -offset), msiPurchaseIds))

  const categoryIds = new Set<string>([
    ...categories.filter((category) => category.category_type === 'expense').map((category) => category.id),
    ...currentReal.keys(),
    ...currentInstallments.keys(),
    ...futureInstallments.keys(),
    ...futureRecurring.keys(),
    ...budgetMap.keys(),
  ])

  return Array.from(categoryIds)
    .map((categoryId) => {
      const realSpend = Number(currentReal.get(categoryId) || 0)
      const installmentSpend = Number(currentInstallments.get(categoryId) || 0)
      const currentSpend = realSpend + installmentSpend
      const average3Months = history3.reduce((acc, month) => acc + Number(month.get(categoryId) || 0), 0) / 3
      const average6Months = history6.reduce((acc, month) => acc + Number(month.get(categoryId) || 0), 0) / 6
      const previousSpend = Number(previousMonthSpend.get(categoryId) || 0)
      const msiFuture = Number(futureInstallments.get(categoryId) || 0)
      const recurringProjected = Number(futureRecurring.get(categoryId) || 0)
      const currentBudget = Number(budgetMap.get(categoryId) || 0)
      const baseline = Math.max(average3Months, average6Months * 0.8)
      const suggestedBudget = Math.ceil((baseline + msiFuture + recurringProjected) / 50) * 50
      const trend: CategoryBudgetInsight['trend'] =
        average3Months > average6Months * 1.15
          ? 'up'
          : average3Months < average6Months * 0.85
            ? 'down'
            : 'flat'
      const progress = currentBudget > 0 ? (currentSpend / currentBudget) * 100 : 0
      const status: CategoryBudgetInsight['status'] =
        currentBudget <= 0 && currentSpend > 0
          ? 'unbudgeted'
          : progress >= 100
            ? 'over'
            : progress >= 80
              ? 'tight'
              : 'ok'

      return {
        categoryId,
        categoryName: categoryMap.get(categoryId) || 'Sin categoría',
        currentSpend: roundMoney(currentSpend),
        realSpend: roundMoney(realSpend),
        installmentSpend: roundMoney(installmentSpend),
        futureInstallmentSpend: roundMoney(msiFuture),
        recurringProjected: roundMoney(recurringProjected),
        average3Months: roundMoney(average3Months),
        average6Months: roundMoney(average6Months),
        previousMonthSpend: roundMoney(previousSpend),
        suggestedBudget: roundMoney(Math.max(0, suggestedBudget)),
        currentBudget,
        trend,
        status,
      }
    })
    .filter((row) =>
      row.currentSpend > 0 ||
      row.average3Months > 0 ||
      row.average6Months > 0 ||
      row.suggestedBudget > 0 ||
      row.currentBudget > 0
    )
    .sort((a, b) => b.currentSpend - a.currentSpend || b.suggestedBudget - a.suggestedBudget)
}

export function summarizeMonthSeries(
  transactions: Transaction[],
  installments: CreditCardInstallment[],
  referenceDate: Date,
  msiPurchaseIds: Set<string>,
  months = 6
) {
  return Array.from({ length: months }, (_, index) => {
    const offset = -(months - 1 - index)
    const period = buildMonthPeriod(referenceDate, offset)
    const real = Array.from(sumRealBudgetSpendByCategory(transactions, period, msiPurchaseIds).values()).reduce((acc, value) => acc + value, 0)
    const msi = Array.from(sumInstallmentSpendByCategory(installments, period).values()).reduce((acc, value) => acc + value, 0)

    return {
      key: monthKey(period.start),
      label: period.start.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }),
      real: roundMoney(real),
      msi: roundMoney(msi),
      total: roundMoney(real + msi),
    }
  })
}
