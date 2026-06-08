import {
  buildCashflowProjection,
  type CashflowProjectionSummary,
} from '@/lib/cashflow-projection'
import type { FinancialCalendarEvent } from '@/lib/financial-calendar'

export type SimulationType =
  | 'cash_expense'
  | 'credit_card_purchase'
  | 'installment_purchase'
  | 'debt_payment'
  | 'extra_income'

export type SimulationInput = {
  amount: number
  date: string
  type: SimulationType
  title?: string
  accountId?: string
  creditCardId?: string
  debtId?: string
  months?: number
}

export type SimulationResult = {
  baseSummary: CashflowProjectionSummary
  simulatedSummary: CashflowProjectionSummary
  impactToday: number
  impactEndBalance: number
  impactLowestBalance: number
  lowestBalanceDate: string
  warnings: string[]
  recommendation: 'safe' | 'caution' | 'avoid'
  simulatedEvents: FinancialCalendarEvent[]
}

type BuildSimulationResultInput = {
  currentBalance: number
  baseEvents: FinancialCalendarEvent[]
  projectionStartDate: string | Date
  projectionEndDate: string | Date
  simulation: SimulationInput
  cautionBuffer?: number
}

function parseDateOnly(value: string | Date) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  return new Date(`${value}T12:00:00`)
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function safeDayForMonth(year: number, month: number, preferredDay: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return Math.min(preferredDay, lastDay)
}

function addMonthsKeepingDay(value: Date, months: number) {
  const day = value.getDate()
  const target = new Date(value)
  target.setMonth(target.getMonth() + months)
  return new Date(target.getFullYear(), target.getMonth(), safeDayForMonth(target.getFullYear(), target.getMonth(), day))
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function defaultTitle(input: SimulationInput) {
  if (input.title?.trim()) return input.title.trim()

  const labels: Record<SimulationType, string> = {
    cash_expense: 'Gasto simulado',
    credit_card_purchase: 'Compra con tarjeta simulada',
    installment_purchase: 'Compra MSI simulada',
    debt_payment: 'Pago extra a deuda simulado',
    extra_income: 'Ingreso extra simulado',
  }

  return labels[input.type]
}

export function buildSimulationEvents(input: SimulationInput): {
  events: FinancialCalendarEvent[]
  warnings: string[]
} {
  const warnings: string[] = []
  const amount = Number(input.amount || 0)
  const date = input.date
  const title = defaultTitle(input)

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      events: [],
      warnings: ['Ingresa un monto mayor a cero para simular.'],
    }
  }

  if (!date) {
    return {
      events: [],
      warnings: ['Elige una fecha para la simulación.'],
    }
  }

  if (input.type === 'cash_expense' || input.type === 'debt_payment') {
    return {
      events: [{
        id: `simulation-${input.type}-${date}`,
        date,
        title,
        amount,
        direction: 'outflow',
        sourceType: input.type === 'debt_payment' ? 'debt_payment' : 'transaction',
        accountId: input.accountId,
        debtId: input.type === 'debt_payment' ? input.debtId : undefined,
        confidence: 'manual',
        affectsCash: true,
        affectsBudget: input.type === 'cash_expense',
      }],
      warnings,
    }
  }

  if (input.type === 'extra_income') {
    return {
      events: [{
        id: `simulation-extra-income-${date}`,
        date,
        title,
        amount,
        direction: 'inflow',
        sourceType: 'income_schedule',
        accountId: input.accountId,
        confidence: 'manual',
        affectsCash: true,
        affectsBudget: false,
      }],
      warnings,
    }
  }

  if (input.type === 'credit_card_purchase') {
    warnings.push('No afecta tu efectivo hoy, pero aumentaría deuda o compromisos futuros de tarjeta.')
    return {
      events: [{
        id: `simulation-credit-card-purchase-${date}`,
        date,
        title,
        amount,
        direction: 'outflow',
        sourceType: 'credit_card_payment',
        creditCardId: input.creditCardId,
        confidence: 'estimated',
        affectsCash: false,
        affectsBudget: true,
      }],
      warnings,
    }
  }

  const months = Math.max(1, Math.floor(Number(input.months || 0)))
  const monthlyAmount = roundMoney(amount / months)
  warnings.push(`En MSI comprometería aproximadamente ${monthlyAmount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} al mes por ${months} meses.`)

  const start = parseDateOnly(date)
  return {
    events: Array.from({ length: months }, (_, index) => {
      const eventDate = addMonthsKeepingDay(start, index)
      return {
        id: `simulation-installment-${date}-${index + 1}`,
        date: formatDateOnly(eventDate),
        title: `${title} ${index + 1}/${months}`,
        amount: monthlyAmount,
        direction: 'outflow' as const,
        sourceType: 'installment' as const,
        creditCardId: input.creditCardId,
        confidence: 'estimated' as const,
        affectsCash: true,
        affectsBudget: true,
      }
    }),
    warnings,
  }
}

export function simulateCashflowDecision({
  currentBalance,
  baseEvents,
  projectionStartDate,
  projectionEndDate,
  simulation,
  cautionBuffer,
}: BuildSimulationResultInput): SimulationResult {
  const baseProjection = buildCashflowProjection({
    currentBalance,
    events: baseEvents,
    startDate: projectionStartDate,
    endDate: projectionEndDate,
    cautionBuffer,
  })
  const { events: simulatedEvents, warnings } = buildSimulationEvents(simulation)
  const simulatedProjection = buildCashflowProjection({
    currentBalance,
    events: [...baseEvents, ...simulatedEvents],
    startDate: projectionStartDate,
    endDate: projectionEndDate,
    cautionBuffer,
  })

  const today = formatDateOnly(parseDateOnly(projectionStartDate))
  const baseToday = baseProjection.points.find((point) => point.date === today)
  const simulatedToday = simulatedProjection.points.find((point) => point.date === today)
  const impactToday = roundMoney((simulatedToday?.endingBalance ?? currentBalance) - (baseToday?.endingBalance ?? currentBalance))
  const impactEndBalance = roundMoney(simulatedProjection.summary.projectedEndBalance - baseProjection.summary.projectedEndBalance)
  const impactLowestBalance = roundMoney(simulatedProjection.summary.lowestBalance - baseProjection.summary.lowestBalance)
  const cautionThreshold = Math.max(0, cautionBuffer ?? Number(currentBalance || 0) * 0.1)
  const nextWarnings = [...warnings]

  let recommendation: SimulationResult['recommendation'] = 'safe'
  if (simulatedProjection.summary.lowestBalance < 0) {
    recommendation = 'avoid'
    nextWarnings.push(`Esto te dejaría negativo el día ${simulatedProjection.summary.lowestBalanceDate}.`)
  } else if (simulatedProjection.summary.lowestBalance < cautionThreshold) {
    recommendation = 'caution'
    nextWarnings.push('Puedes hacerlo, pero tu saldo quedaría muy cerca de tu margen mínimo.')
  } else if (impactLowestBalance < 0) {
    nextWarnings.push(`Puedes hacerlo, pero tu saldo más bajo bajaría a ${simulatedProjection.summary.lowestBalance.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.`)
  }

  return {
    baseSummary: baseProjection.summary,
    simulatedSummary: simulatedProjection.summary,
    impactToday,
    impactEndBalance,
    impactLowestBalance,
    lowestBalanceDate: simulatedProjection.summary.lowestBalanceDate,
    warnings: nextWarnings,
    recommendation,
    simulatedEvents,
  }
}
