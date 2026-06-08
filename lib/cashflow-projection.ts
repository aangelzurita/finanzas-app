import type { FinancialCalendarEvent } from '@/lib/financial-calendar'

export type CashflowRiskLevel = 'ok' | 'caution' | 'risk'

export type ProjectedBalancePoint = {
  date: string
  startingBalance: number
  inflows: number
  outflows: number
  endingBalance: number
  lowestBalanceToDate: number
  riskLevel: CashflowRiskLevel
  events: FinancialCalendarEvent[]
}

export type CashflowProjectionSummary = {
  currentBalance: number
  projectedEndBalance: number
  lowestBalance: number
  lowestBalanceDate: string
  totalInflows: number
  totalOutflows: number
  riskLevel: CashflowRiskLevel
  nextIncomeDate?: string
  nextIncomeAmount?: number
}

export type CashflowProjectionResult = {
  points: ProjectedBalancePoint[]
  summary: CashflowProjectionSummary
}

type BuildCashflowProjectionInput = {
  currentBalance: number
  events: FinancialCalendarEvent[]
  startDate?: string | Date
  endDate: string | Date
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

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function riskForBalance(balance: number, cautionThreshold: number): CashflowRiskLevel {
  if (balance < 0) return 'risk'
  if (balance < cautionThreshold) return 'caution'
  return 'ok'
}

function mergeRisk(current: CashflowRiskLevel, next: CashflowRiskLevel): CashflowRiskLevel {
  if (current === 'risk' || next === 'risk') return 'risk'
  if (current === 'caution' || next === 'caution') return 'caution'
  return 'ok'
}

export function buildCashflowProjection({
  currentBalance,
  events,
  startDate = new Date(),
  endDate,
  cautionBuffer,
}: BuildCashflowProjectionInput): CashflowProjectionResult {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate)
  const initialBalance = roundMoney(Number(currentBalance || 0))
  const cautionThreshold = Math.max(0, cautionBuffer ?? initialBalance * 0.1)
  const eventsByDate = new Map<string, FinancialCalendarEvent[]>()

  events.forEach((event) => {
    const eventDate = parseDateOnly(event.date)
    if (eventDate < start || eventDate > end) return

    const key = formatDateOnly(eventDate)
    eventsByDate.set(key, [...(eventsByDate.get(key) || []), event])
  })

  const points: ProjectedBalancePoint[] = []
  let cursor = start
  let balance = initialBalance
  let lowestBalance = initialBalance
  let lowestBalanceDate = formatDateOnly(start)
  let totalInflows = 0
  let totalOutflows = 0
  let aggregateRisk: CashflowRiskLevel = riskForBalance(balance, cautionThreshold)

  while (cursor <= end) {
    const date = formatDateOnly(cursor)
    const dayEvents = (eventsByDate.get(date) || []).sort((a, b) => {
      if (a.direction === b.direction) return Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0))
      return a.direction === 'inflow' ? -1 : 1
    })
    const startingBalance = balance
    const inflows = dayEvents
      .filter((event) => event.direction === 'inflow' && event.affectsCash)
      .reduce((acc, event) => acc + Number(event.amount || 0), 0)
    const outflows = dayEvents
      .filter((event) => event.direction === 'outflow' && event.affectsCash)
      .reduce((acc, event) => acc + Number(event.amount || 0), 0)

    totalInflows += inflows
    totalOutflows += outflows
    balance = roundMoney(startingBalance + inflows - outflows)

    if (balance < lowestBalance) {
      lowestBalance = balance
      lowestBalanceDate = date
    }

    const riskLevel = riskForBalance(balance, cautionThreshold)
    aggregateRisk = mergeRisk(aggregateRisk, riskLevel)

    points.push({
      date,
      startingBalance: roundMoney(startingBalance),
      inflows: roundMoney(inflows),
      outflows: roundMoney(outflows),
      endingBalance: balance,
      lowestBalanceToDate: roundMoney(lowestBalance),
      riskLevel,
      events: dayEvents,
    })

    cursor = addDays(cursor, 1)
  }

  const nextIncome = events
    .filter((event) => event.direction === 'inflow' && event.affectsCash)
    .filter((event) => parseDateOnly(event.date) >= start)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]

  return {
    points,
    summary: {
      currentBalance: initialBalance,
      projectedEndBalance: points[points.length - 1]?.endingBalance ?? initialBalance,
      lowestBalance: roundMoney(lowestBalance),
      lowestBalanceDate,
      totalInflows: roundMoney(totalInflows),
      totalOutflows: roundMoney(totalOutflows),
      riskLevel: aggregateRisk,
      nextIncomeDate: nextIncome?.date,
      nextIncomeAmount: nextIncome ? Number(nextIncome.amount || 0) : undefined,
    },
  }
}
