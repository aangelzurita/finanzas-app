import { isBudgetAffectingTransaction } from '@/lib/budget-rules'
import {
  getInstallmentChargeDate,
  type CreditCardInstallment,
} from '@/lib/credit-card-installments'
import type { FinancialCalendarEvent } from '@/lib/financial-calendar'

export type DiagnosticRiskLevel = 'ok' | 'caution' | 'risk'

export type DiagnosticAccount = {
  id: string
  name: string
  institution?: string | null
  account_type: string
  current_balance: number
  is_external?: boolean | null
  include_in_balance?: boolean | null
}

export type DiagnosticCreditCard = {
  id: string
  name: string
  bank?: string | null
  current_balance: number
  credit_limit: number
  minimum_payment: number
  no_interest_payment: number
  payment_due_day: number
}

export type DiagnosticTransaction = {
  id: string
  transaction_type: string
  amount: number
  description: string | null
  transaction_date: string
  category_id: string | null
  status?: string | null
  affects_budget?: boolean | null
}

export type DiagnosticCategory = {
  id: string
  name: string
  category_type: string
}

export type PaymentRecommendation = {
  targetId: string
  targetName: string
  targetBank?: string | null
  amount: number
  dueDate?: string
  recommendedAccountId?: string
  recommendedAccountName?: string
  recommendedAccountInstitution?: string | null
  projectedMarginAfterPayment: number
  score: number
  riskLevel: DiagnosticRiskLevel
  reasons: string[]
  warnings: string[]
}

export type AccountPressure = {
  accountId: string
  accountName: string
  accountType: string
  currentBalance: number
  projectedInflow: number
  projectedOutflow: number
  projectedBalance: number
  riskLevel: DiagnosticRiskLevel
  reasons: string[]
}

export type CategorySpendingInsight = {
  categoryId: string
  categoryName: string
  currentSpend: number
  previousSpend: number
  averagePrevious3Months: number
  changeVsPrevious: number
  changeRateVsPrevious: number
  trend: 'up' | 'down' | 'flat'
}

export type SpendingDiagnosis = {
  currentMonthSpend: number
  previousMonthSpend: number
  averagePrevious3Months: number
  changeVsPrevious: number
  changeRateVsPrevious: number
  topIncreases: CategorySpendingInsight[]
  topDecreases: CategorySpendingInsight[]
  topCurrentCategories: CategorySpendingInsight[]
  findings: string[]
}

export type FinancialDiagnosis = {
  generatedAt: string
  paymentRecommendations: PaymentRecommendation[]
  accountPressures: AccountPressure[]
  spending: SpendingDiagnosis
  executiveFindings: string[]
}

type BuildFinancialDiagnosisInput = {
  accounts: DiagnosticAccount[]
  creditCards: DiagnosticCreditCard[]
  transactions: DiagnosticTransaction[]
  categories: DiagnosticCategory[]
  installments: CreditCardInstallment[]
  events: FinancialCalendarEvent[]
  referenceDate: Date
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function moneyText(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function startOfMonth(value: Date, offset = 0) {
  return new Date(value.getFullYear(), value.getMonth() + offset, 1)
}

function endOfMonth(value: Date, offset = 0) {
  return new Date(value.getFullYear(), value.getMonth() + offset + 1, 0, 23, 59, 59, 999)
}

function isWithin(value: string | Date, start: Date, end: Date) {
  const date = value instanceof Date ? value : new Date(value)
  return date >= start && date <= end
}

function formatDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateForDay(referenceDate: Date, preferredDay: number) {
  const safeDay = Math.max(1, Number(preferredDay || 1))
  const lastDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate()
  let target = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), Math.min(safeDay, lastDay))
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())

  if (target < today) {
    const nextLastDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 2, 0).getDate()
    target = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, Math.min(safeDay, nextLastDay))
  }

  return target
}

function normalizeText(value?: string | null) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isOwnBalanceAccount(account: DiagnosticAccount) {
  return account.is_external !== true && account.include_in_balance !== false
}

function isLiquidAccount(account: DiagnosticAccount) {
  return isOwnBalanceAccount(account) && ['cash', 'debit', 'savings'].includes(account.account_type)
}

function isSameInstitution(account: DiagnosticAccount, targetBank?: string | null) {
  const bank = normalizeText(targetBank)
  if (!bank) return false

  const accountText = `${normalizeText(account.name)} ${normalizeText(account.institution)}`
  return bank.split(/\s+/).filter(Boolean).some((token) => token.length >= 3 && accountText.includes(token))
}

function riskFromMargin(margin: number, amount: number) {
  const cautionMargin = Math.max(500, amount * 0.15)
  if (margin < 0) return 'risk' as const
  if (margin < cautionMargin) return 'caution' as const
  return 'ok' as const
}

function accountEventsUntil(events: FinancialCalendarEvent[], accountId: string, untilDate: string) {
  return events.filter((event) =>
    event.affectsCash &&
    event.accountId === accountId &&
    event.date <= untilDate
  )
}

export function buildPaymentRecommendations({
  accounts,
  creditCards,
  events,
  referenceDate,
}: Pick<BuildFinancialDiagnosisInput, 'accounts' | 'creditCards' | 'events' | 'referenceDate'>) {
  const candidateAccounts = accounts
    .filter(isLiquidAccount)
    .filter((account) => Number(account.current_balance || 0) > 0)

  return creditCards
    .map((card): PaymentRecommendation | null => {
      const amount = Number(card.no_interest_payment || card.minimum_payment || 0)
      if (Number(card.current_balance || 0) <= 0 || amount <= 0) return null

      const dueDate = formatDateKey(dateForDay(referenceDate, card.payment_due_day))
      const evaluated = candidateAccounts.map((account) => {
        const linkedEvents = accountEventsUntil(events, account.id, dueDate)
        const inflow = linkedEvents
          .filter((event) => event.direction === 'inflow')
          .reduce((acc, event) => acc + Number(event.amount || 0), 0)
        const outflow = linkedEvents
          .filter((event) => event.direction === 'outflow')
          .reduce((acc, event) => acc + Number(event.amount || 0), 0)
        const projectedBeforePayment = Number(account.current_balance || 0) + inflow - outflow
        const margin = roundMoney(projectedBeforePayment - amount)
        const sameInstitution = isSameInstitution(account, card.bank)
        const riskLevel = riskFromMargin(margin, amount)
        let score = 0
        const reasons: string[] = []
        const warnings: string[] = []

        if (margin >= 0) {
          score += 45
          reasons.push('Puede cubrir el pago completo sin dividirlo.')
        } else {
          score -= 80
          warnings.push('No cubre el pago completo con el saldo proyectado.')
        }

        if (sameInstitution) {
          score += 30
          reasons.push('Mismo banco o institución similar; evita transferencias innecesarias.')
        }

        if (account.account_type === 'savings') {
          score -= 18
          warnings.push('Es una cuenta de ahorro; úsala solo si quieres liberar presión.')
        } else {
          score += 10
        }

        score += Math.min(35, Math.max(-35, Math.round((margin / Math.max(amount, 1)) * 20)))

        if (riskLevel === 'caution') warnings.push('Deja poco margen después del pago.')
        if (riskLevel === 'risk') warnings.push('Dejaría la cuenta en negativo.')

        return {
          account,
          projectedMarginAfterPayment: margin,
          score,
          riskLevel,
          reasons,
          warnings,
        }
      })

      const best = evaluated.sort((a, b) => b.score - a.score)[0]

      if (!best) {
        return {
          targetId: card.id,
          targetName: card.name,
          targetBank: card.bank,
          amount,
          dueDate,
          projectedMarginAfterPayment: 0 - amount,
          score: 0,
          riskLevel: 'risk',
          reasons: [],
          warnings: ['No hay cuentas propias con saldo disponible para recomendar.'],
        }
      }

      return {
        targetId: card.id,
        targetName: card.name,
        targetBank: card.bank,
        amount,
        dueDate,
        recommendedAccountId: best.account.id,
        recommendedAccountName: best.account.name,
        recommendedAccountInstitution: best.account.institution,
        projectedMarginAfterPayment: best.projectedMarginAfterPayment,
        score: Math.max(0, Math.min(100, best.score)),
        riskLevel: best.riskLevel,
        reasons: best.reasons,
        warnings: best.warnings,
      }
    })
    .filter((item): item is PaymentRecommendation => Boolean(item))
    .sort((a, b) => {
      const riskOrder = { risk: 0, caution: 1, ok: 2 }
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || new Date(a.dueDate || '').getTime() - new Date(b.dueDate || '').getTime()
    })
}

export function buildAccountPressure({
  accounts,
  events,
  horizonEnd,
}: {
  accounts: DiagnosticAccount[]
  events: FinancialCalendarEvent[]
  horizonEnd: string
}) {
  return accounts
    .filter(isLiquidAccount)
    .map((account): AccountPressure => {
      const linkedEvents = accountEventsUntil(events, account.id, horizonEnd)
      const projectedInflow = linkedEvents
        .filter((event) => event.direction === 'inflow')
        .reduce((acc, event) => acc + Number(event.amount || 0), 0)
      const projectedOutflow = linkedEvents
        .filter((event) => event.direction === 'outflow')
        .reduce((acc, event) => acc + Number(event.amount || 0), 0)
      const projectedBalance = roundMoney(Number(account.current_balance || 0) + projectedInflow - projectedOutflow)
      const riskLevel = projectedBalance < 0 ? 'risk' : projectedBalance < Math.max(500, Number(account.current_balance || 0) * 0.1) ? 'caution' : 'ok'
      const reasons = [
        projectedOutflow > 0
          ? `Tiene ${moneyText(roundMoney(projectedOutflow))} en salidas registradas vinculadas.`
          : 'No tiene salidas vinculadas en el horizonte revisado.',
      ]

      if (projectedInflow > 0) reasons.push(`Tiene ${moneyText(roundMoney(projectedInflow))} en entradas esperadas vinculadas.`)
      if (riskLevel === 'risk') reasons.push('Puede quedar negativa si los eventos se cumplen.')
      if (riskLevel === 'caution') reasons.push('Queda con margen bajo.')

      return {
        accountId: account.id,
        accountName: account.name,
        accountType: account.account_type,
        currentBalance: Number(account.current_balance || 0),
        projectedInflow: roundMoney(projectedInflow),
        projectedOutflow: roundMoney(projectedOutflow),
        projectedBalance,
        riskLevel,
        reasons,
      }
    })
    .sort((a, b) => {
      const riskOrder = { risk: 0, caution: 1, ok: 2 }
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || a.projectedBalance - b.projectedBalance
    })
}

function sumSpendByCategory({
  transactions,
  installments,
  categories,
  start,
  end,
  msiPurchaseIds,
}: {
  transactions: DiagnosticTransaction[]
  installments: CreditCardInstallment[]
  categories: DiagnosticCategory[]
  start: Date
  end: Date
  msiPurchaseIds: Set<string>
}) {
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]))
  const amounts = new Map<string, number>()

  transactions
    .filter((tx) => (tx.status || 'completed') === 'completed')
    .filter((tx) => isWithin(tx.transaction_date, start, end))
    .filter((tx) => isBudgetAffectingTransaction(tx, msiPurchaseIds))
    .forEach((tx) => {
      const key = tx.category_id || 'uncategorized'
      amounts.set(key, Number(amounts.get(key) || 0) + Number(tx.amount || 0))
    })

  installments.forEach((plan) => {
    if (plan.status === 'canceled' || !plan.category_id || Number(plan.monthly_amount || 0) <= 0) return

    for (let installmentNumber = 1; installmentNumber <= Number(plan.total_months || 0); installmentNumber += 1) {
      const chargeDate = getInstallmentChargeDate(plan, installmentNumber)
      if (!isWithin(chargeDate, start, end)) continue
      amounts.set(plan.category_id, Number(amounts.get(plan.category_id) || 0) + Number(plan.monthly_amount || 0))
    }
  })

  return Array.from(amounts.entries()).map(([categoryId, amount]) => ({
    categoryId,
    categoryName: categoryId === 'uncategorized' ? 'Sin categoría' : categoryMap.get(categoryId) || 'Otros',
    amount: roundMoney(amount),
  }))
}

export function buildSpendingDiagnosis({
  transactions,
  categories,
  installments,
  referenceDate,
}: Pick<BuildFinancialDiagnosisInput, 'transactions' | 'categories' | 'installments' | 'referenceDate'>): SpendingDiagnosis {
  const msiPurchaseIds = new Set(installments.map((plan) => plan.purchase_transaction_id).filter(Boolean) as string[])
  const currentStart = startOfMonth(referenceDate)
  const currentEnd = endOfMonth(referenceDate)
  const previousStart = startOfMonth(referenceDate, -1)
  const previousEnd = endOfMonth(referenceDate, -1)
  const previousPeriods = [1, 2, 3].map((offset) => ({
    start: startOfMonth(referenceDate, -offset),
    end: endOfMonth(referenceDate, -offset),
  }))

  const currentRows = sumSpendByCategory({ transactions, categories, installments, start: currentStart, end: currentEnd, msiPurchaseIds })
  const previousRows = sumSpendByCategory({ transactions, categories, installments, start: previousStart, end: previousEnd, msiPurchaseIds })
  const previousMaps = previousPeriods.map((period) =>
    new Map(sumSpendByCategory({ transactions, categories, installments, start: period.start, end: period.end, msiPurchaseIds }).map((row) => [row.categoryId, row.amount]))
  )

  const currentMap = new Map(currentRows.map((row) => [row.categoryId, row]))
  const previousMap = new Map(previousRows.map((row) => [row.categoryId, row.amount]))
  const allCategoryIds = new Set([...currentRows.map((row) => row.categoryId), ...previousRows.map((row) => row.categoryId)])
  const currentMonthSpend = currentRows.reduce((acc, row) => acc + row.amount, 0)
  const previousMonthSpend = previousRows.reduce((acc, row) => acc + row.amount, 0)
  const averagePrevious3Months = previousMaps.reduce(
    (acc, month) => acc + Array.from(month.values()).reduce((sum, value) => sum + value, 0),
    0
  ) / Math.max(1, previousMaps.length)

  const categoryInsights = Array.from(allCategoryIds).map((categoryId): CategorySpendingInsight => {
    const currentSpend = Number(currentMap.get(categoryId)?.amount || 0)
    const previousSpend = Number(previousMap.get(categoryId) || 0)
    const averagePrevious3 = previousMaps.reduce((acc, month) => acc + Number(month.get(categoryId) || 0), 0) / Math.max(1, previousMaps.length)
    const changeVsPrevious = roundMoney(currentSpend - previousSpend)
    const changeRateVsPrevious = previousSpend > 0 ? changeVsPrevious / previousSpend : currentSpend > 0 ? 1 : 0
    const trend = changeVsPrevious > Math.max(300, previousSpend * 0.15) ? 'up' : changeVsPrevious < -Math.max(300, previousSpend * 0.15) ? 'down' : 'flat'

    return {
      categoryId,
      categoryName: currentMap.get(categoryId)?.categoryName || previousRows.find((row) => row.categoryId === categoryId)?.categoryName || 'Otros',
      currentSpend: roundMoney(currentSpend),
      previousSpend: roundMoney(previousSpend),
      averagePrevious3Months: roundMoney(averagePrevious3),
      changeVsPrevious,
      changeRateVsPrevious: roundMoney(changeRateVsPrevious),
      trend,
    }
  })

  const topIncreases = categoryInsights
    .filter((item) => item.changeVsPrevious > 0)
    .sort((a, b) => b.changeVsPrevious - a.changeVsPrevious)
    .slice(0, 5)
  const topDecreases = categoryInsights
    .filter((item) => item.changeVsPrevious < 0)
    .sort((a, b) => a.changeVsPrevious - b.changeVsPrevious)
    .slice(0, 5)
  const topCurrentCategories = categoryInsights
    .sort((a, b) => b.currentSpend - a.currentSpend)
    .slice(0, 5)
  const changeVsPrevious = roundMoney(currentMonthSpend - previousMonthSpend)
  const changeRateVsPrevious = previousMonthSpend > 0 ? roundMoney(changeVsPrevious / previousMonthSpend) : currentMonthSpend > 0 ? 1 : 0
  const findings: string[] = []

  if (changeVsPrevious > 0) findings.push(`Tu gasto presupuestal va arriba del mes anterior por ${moneyText(roundMoney(changeVsPrevious))}.`)
  if (changeVsPrevious < 0) findings.push(`Tu gasto presupuestal va abajo del mes anterior por ${moneyText(Math.abs(roundMoney(changeVsPrevious)))}.`)
  if (topIncreases[0]) findings.push(`${topIncreases[0].categoryName} es el mayor incremento frente al mes anterior.`)
  if (topCurrentCategories[0]) findings.push(`${topCurrentCategories[0].categoryName} concentra el mayor gasto del mes.`)
  if (findings.length === 0) findings.push('No hay cambios fuertes de gasto contra el mes anterior.')

  return {
    currentMonthSpend: roundMoney(currentMonthSpend),
    previousMonthSpend: roundMoney(previousMonthSpend),
    averagePrevious3Months: roundMoney(averagePrevious3Months),
    changeVsPrevious,
    changeRateVsPrevious,
    topIncreases,
    topDecreases,
    topCurrentCategories,
    findings,
  }
}

export function buildFinancialDiagnosis(input: BuildFinancialDiagnosisInput): FinancialDiagnosis {
  const horizonEnd = formatDateKey(endOfMonth(input.referenceDate))
  const paymentRecommendations = buildPaymentRecommendations(input)
  const accountPressures = buildAccountPressure({
    accounts: input.accounts,
    events: input.events,
    horizonEnd,
  })
  const spending = buildSpendingDiagnosis(input)
  const executiveFindings: string[] = []
  const riskyRecommendation = paymentRecommendations.find((item) => item.riskLevel === 'risk' || item.riskLevel === 'caution')
  const safeRecommendation = paymentRecommendations.find((item) => item.riskLevel === 'ok')
  const pressuredAccount = accountPressures.find((item) => item.riskLevel !== 'ok')

  if (safeRecommendation?.recommendedAccountName) {
    executiveFindings.push(`Para ${safeRecommendation.targetName}, conviene pagar desde ${safeRecommendation.recommendedAccountName} si el monto sigue en ${moneyText(roundMoney(safeRecommendation.amount))}.`)
  }

  if (riskyRecommendation) {
    executiveFindings.push(`${riskyRecommendation.targetName} requiere revisión: la cuenta recomendada queda con margen ${moneyText(roundMoney(riskyRecommendation.projectedMarginAfterPayment))}.`)
  }

  if (pressuredAccount) {
    executiveFindings.push(`${pressuredAccount.accountName} aparece presionada por su saldo proyectado al cierre del mes.`)
  }

  executiveFindings.push(...spending.findings.slice(0, 2))

  return {
    generatedAt: formatDateKey(input.referenceDate),
    paymentRecommendations,
    accountPressures,
    spending,
    executiveFindings: executiveFindings.slice(0, 5),
  }
}
