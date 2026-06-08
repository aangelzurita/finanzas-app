import {
  getInstallmentChargeDate,
  getOutstandingInstallmentCount,
  type CreditCardInstallment,
} from '@/lib/credit-card-installments'
import type { RecurringCharge } from '@/lib/recurring-charges'

export type IncomeScheduleFrequency = 'one_time' | 'weekly' | 'biweekly' | 'monthly' | 'custom_days'
export type IncomeScheduleVariability = 'fixed' | 'variable' | 'bonus'
export type IncomeScheduleConfidence = 'confirmed' | 'expected' | 'tentative'

export type IncomeSchedule = {
  id: string
  user_id: string
  name: string
  amount: number
  frequency: IncomeScheduleFrequency
  expected_day: number | null
  second_expected_day: number | null
  next_income_date: string
  account_id: string | null
  category_id: string | null
  variability: IncomeScheduleVariability
  confidence: IncomeScheduleConfidence
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  notes: string | null
  created_at?: string
  updated_at?: string
}

export type FinancialCalendarEvent = {
  id: string
  date: string
  title: string
  amount: number
  direction: 'inflow' | 'outflow' | 'neutral'
  sourceType:
    | 'income_schedule'
    | 'recurring_charge'
    | 'installment'
    | 'credit_card_payment'
    | 'debt_payment'
    | 'reminder'
    | 'transaction'
  accountId?: string
  creditCardId?: string
  debtId?: string
  confidence: 'confirmed' | 'estimated' | 'manual'
  affectsCash: boolean
  affectsBudget: boolean
}

export type FinancialCalendarReminder = {
  id: string
  title: string
  due_date: string
  amount: number | null
  status?: string | null
}

export type FinancialCalendarCreditCard = {
  id: string
  name: string
  current_balance: number
  payment_due_day: number
  minimum_payment: number
  no_interest_payment: number
}

export type FinancialCalendarDebt = {
  id: string
  name?: string | null
  current_balance: number
  monthly_payment?: number | null
  start_date?: string | null
  status?: string | null
}

type BuildFinancialCalendarOptions = {
  from?: string | Date
  to?: string | Date
  maxEventsPerSchedule?: number
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

function startOfNextMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 1)
}

function safeDayForMonth(year: number, month: number, preferredDay: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return Math.min(preferredDay, lastDay)
}

function addMonthsOnDay(value: Date, preferredDay: number) {
  const year = value.getFullYear()
  const month = value.getMonth() + 1
  const nextYear = year + Math.floor(month / 12)
  const nextMonth = month % 12
  return new Date(nextYear, nextMonth, safeDayForMonth(nextYear, nextMonth, preferredDay))
}

function firstDateOnOrAfter(from: Date, preferredDay: number) {
  const current = new Date(
    from.getFullYear(),
    from.getMonth(),
    safeDayForMonth(from.getFullYear(), from.getMonth(), preferredDay)
  )

  if (current >= from) return current
  return addMonthsOnDay(current, preferredDay)
}

function isWithinWindow(date: Date, from: Date, to: Date) {
  return date >= from && date <= to
}

function normalizeConfidence(confidence: IncomeScheduleConfidence): FinancialCalendarEvent['confidence'] {
  if (confidence === 'confirmed') return 'confirmed'
  if (confidence === 'tentative') return 'estimated'
  return 'estimated'
}

function getCustomDayCandidates(schedule: IncomeSchedule, cursor: Date) {
  const days = [schedule.expected_day, schedule.second_expected_day]
    .filter((day): day is number => Boolean(day && day >= 1 && day <= 31))
    .sort((a, b) => a - b)

  if (days.length === 0) {
    return [cursor]
  }

  return days.map((day) => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    return new Date(year, month, safeDayForMonth(year, month, day))
  })
}

function nextIncomeDate(schedule: IncomeSchedule, current: Date) {
  if (schedule.frequency === 'weekly') return addDays(current, 7)
  if (schedule.frequency === 'biweekly') return addDays(current, 14)

  if (schedule.frequency === 'monthly') {
    return addMonthsOnDay(current, schedule.expected_day || current.getDate())
  }

  if (schedule.frequency === 'custom_days') {
    const tomorrow = addDays(current, 1)
    const candidates = [
      ...getCustomDayCandidates(schedule, tomorrow),
      ...getCustomDayCandidates(schedule, addMonthsOnDay(tomorrow, 1)),
    ].filter((candidate) => candidate > current)

    return candidates.sort((a, b) => a.getTime() - b.getTime())[0] || addMonthsOnDay(current, current.getDate())
  }

  return addDays(current, 1)
}

function nextRecurringDate(
  frequency: RecurringCharge['frequency'],
  chargeDay: number | null | undefined,
  current: Date
) {
  if (frequency === 'weekly') return addDays(current, 7)
  if (frequency === 'biweekly') return addDays(current, 14)

  const day = chargeDay && chargeDay >= 1 ? chargeDay : current.getDate()
  if (frequency === 'quarterly') {
    const next = new Date(current)
    next.setMonth(next.getMonth() + 3)
    return new Date(next.getFullYear(), next.getMonth(), safeDayForMonth(next.getFullYear(), next.getMonth(), day))
  }
  if (frequency === 'yearly') {
    const next = new Date(current)
    next.setFullYear(next.getFullYear() + 1)
    return new Date(next.getFullYear(), next.getMonth(), safeDayForMonth(next.getFullYear(), next.getMonth(), day))
  }

  return addMonthsOnDay(current, day)
}

export function buildIncomeScheduleEvents(
  schedules: IncomeSchedule[],
  options: BuildFinancialCalendarOptions = {}
): FinancialCalendarEvent[] {
  const from = parseDateOnly(options.from || new Date())
  const to = parseDateOnly(options.to || addDays(from, 60))
  const maxEventsPerSchedule = options.maxEventsPerSchedule ?? 24

  return schedules
    .flatMap((schedule) => {
      if (!schedule.is_active) return []

      const startsAt = schedule.starts_at ? parseDateOnly(schedule.starts_at) : null
      const endsAt = schedule.ends_at ? parseDateOnly(schedule.ends_at) : null
      const lowerBound = startsAt && startsAt > from ? startsAt : from
      const upperBound = endsAt && endsAt < to ? endsAt : to
      const events: FinancialCalendarEvent[] = []
      let cursor = parseDateOnly(schedule.next_income_date)
      let guard = 0

      while (cursor < lowerBound && schedule.frequency !== 'one_time' && guard < maxEventsPerSchedule) {
        cursor = nextIncomeDate(schedule, cursor)
        guard += 1
      }

      while (cursor <= upperBound && guard < maxEventsPerSchedule) {
        if (isWithinWindow(cursor, lowerBound, upperBound)) {
          events.push({
            id: `income_schedule-${schedule.id}-${formatDateOnly(cursor)}`,
            date: formatDateOnly(cursor),
            title: schedule.name,
            amount: Number(schedule.amount || 0),
            direction: 'inflow',
            sourceType: 'income_schedule',
            accountId: schedule.account_id || undefined,
            confidence: normalizeConfidence(schedule.confidence),
            affectsCash: true,
            affectsBudget: false,
          })
        }

        if (schedule.frequency === 'one_time') break
        cursor = nextIncomeDate(schedule, cursor)
        guard += 1
      }

      return events
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function buildReminderEvents(
  reminders: FinancialCalendarReminder[],
  options: BuildFinancialCalendarOptions = {}
): FinancialCalendarEvent[] {
  const from = parseDateOnly(options.from || new Date())
  const to = parseDateOnly(options.to || addDays(from, 60))

  return reminders
    .filter((reminder) => (reminder.status || 'pending') === 'pending')
    .filter((reminder) => Number(reminder.amount || 0) > 0)
    .map((reminder) => ({
      id: `reminder-${reminder.id}`,
      date: formatDateOnly(parseDateOnly(reminder.due_date)),
      title: reminder.title,
      amount: Number(reminder.amount || 0),
      direction: 'outflow' as const,
      sourceType: 'reminder' as const,
      confidence: 'manual' as const,
      affectsCash: true,
      affectsBudget: false,
    }))
    .filter((event) => isWithinWindow(parseDateOnly(event.date), from, to))
}

export function buildRecurringChargeEvents(
  charges: RecurringCharge[],
  options: BuildFinancialCalendarOptions = {}
): FinancialCalendarEvent[] {
  const from = parseDateOnly(options.from || new Date())
  const to = parseDateOnly(options.to || addDays(from, 60))
  const maxEventsPerSchedule = options.maxEventsPerSchedule ?? 24

  return charges.flatMap((charge) => {
    if (!charge.is_active || !charge.next_charge_date || Number(charge.amount || 0) <= 0) return []

    const events: FinancialCalendarEvent[] = []
    let cursor = parseDateOnly(charge.next_charge_date)
    let guard = 0

    while (cursor < from && guard < maxEventsPerSchedule) {
      cursor = nextRecurringDate(charge.frequency, charge.charge_day, cursor)
      guard += 1
    }

    while (cursor <= to && guard < maxEventsPerSchedule) {
      events.push({
        id: `recurring_charge-${charge.id}-${formatDateOnly(cursor)}`,
        date: formatDateOnly(cursor),
        title: charge.name,
        amount: Number(charge.amount || 0),
        direction: 'outflow',
        sourceType: 'recurring_charge',
        accountId: charge.account_id || undefined,
        creditCardId: charge.credit_card_id || undefined,
        confidence: charge.payment_method_type === 'manual_choice' ? 'manual' : 'estimated',
        affectsCash: charge.payment_method_type !== 'credit_card',
        affectsBudget: true,
      })

      cursor = nextRecurringDate(charge.frequency, charge.charge_day, cursor)
      guard += 1
    }

    return events
  })
}

export function buildInstallmentEvents(
  installments: CreditCardInstallment[],
  options: BuildFinancialCalendarOptions = {}
): FinancialCalendarEvent[] {
  const from = parseDateOnly(options.from || new Date())
  const to = parseDateOnly(options.to || addDays(from, 60))

  return installments.flatMap((plan) => {
    if (plan.status !== 'active' || Number(plan.monthly_amount || 0) <= 0) return []

    const outstanding = getOutstandingInstallmentCount(plan)
    const startNumber = Math.max(1, Number(plan.current_installment_number || 1))
    const events: FinancialCalendarEvent[] = []

    for (let offset = 0; offset < outstanding; offset += 1) {
      const installmentNumber = startNumber + offset
      if (installmentNumber > Number(plan.total_months || 0)) break

      const chargeDate = getInstallmentChargeDate(plan, installmentNumber)
      if (!isWithinWindow(chargeDate, from, to)) continue

      events.push({
        id: `installment-${plan.id}-${installmentNumber}`,
        date: formatDateOnly(chargeDate),
        title: plan.description,
        amount: Number(plan.monthly_amount || 0),
        direction: 'outflow',
        sourceType: 'installment',
        creditCardId: plan.credit_card_id,
        confidence: 'estimated',
        affectsCash: false,
        affectsBudget: true,
      })
    }

    return events
  })
}

export function buildCreditCardPaymentEvents(
  cards: FinancialCalendarCreditCard[],
  options: BuildFinancialCalendarOptions = {}
): FinancialCalendarEvent[] {
  const from = parseDateOnly(options.from || new Date())
  const to = parseDateOnly(options.to || addDays(from, 60))

  return cards
    .flatMap((card) => {
      const amount = Number(card.no_interest_payment || card.minimum_payment || 0)
      if (Number(card.current_balance || 0) <= 0 || amount <= 0) return []

      const dueDate = firstDateOnOrAfter(from, Number(card.payment_due_day || from.getDate()))
      return [{
        id: `credit_card_payment-${card.id}-${formatDateOnly(dueDate)}`,
        date: formatDateOnly(dueDate),
        title: `Pago ${card.name}`,
        amount,
        direction: 'outflow' as const,
        sourceType: 'credit_card_payment' as const,
        creditCardId: card.id,
        confidence: 'estimated' as const,
        affectsCash: true,
        affectsBudget: false,
      }]
    })
    .filter((event) => isWithinWindow(parseDateOnly(event.date), from, to))
}

export function buildDebtPaymentEvents(
  debts: FinancialCalendarDebt[],
  options: BuildFinancialCalendarOptions = {}
): FinancialCalendarEvent[] {
  const from = parseDateOnly(options.from || new Date())
  const to = parseDateOnly(options.to || addDays(from, 60))

  return debts
    .filter((debt) => (debt.status || 'active') === 'active')
    .filter((debt) => Number(debt.current_balance || 0) > 0 && Number(debt.monthly_payment || 0) > 0)
    .filter((debt) => Boolean(debt.start_date))
    .map((debt) => {
      const startDate = parseDateOnly(debt.start_date || formatDateOnly(from))
      const dueDate = firstDateOnOrAfter(from, startDate.getDate())

      return {
        id: `debt_payment-${debt.id}-${formatDateOnly(dueDate)}`,
        date: formatDateOnly(dueDate),
        title: `Pago ${debt.name || 'deuda'}`,
        amount: Number(debt.monthly_payment || 0),
        direction: 'outflow' as const,
        sourceType: 'debt_payment' as const,
        debtId: debt.id,
        confidence: 'estimated' as const,
        affectsCash: true,
        affectsBudget: false,
      }
    })
    .filter((event) => isWithinWindow(parseDateOnly(event.date), from, to))
}

export function buildFinancialCalendarEvents({
  incomeSchedules = [],
  reminders = [],
  recurringCharges = [],
  installments = [],
  creditCards = [],
  debts = [],
  from,
  to,
}: {
  incomeSchedules?: IncomeSchedule[]
  reminders?: FinancialCalendarReminder[]
  recurringCharges?: RecurringCharge[]
  installments?: CreditCardInstallment[]
  creditCards?: FinancialCalendarCreditCard[]
  debts?: FinancialCalendarDebt[]
  from?: string | Date
  to?: string | Date
}) {
  return [
    ...buildIncomeScheduleEvents(incomeSchedules, { from, to }),
    ...buildReminderEvents(reminders, { from, to }),
    ...buildRecurringChargeEvents(recurringCharges, { from, to }),
    ...buildInstallmentEvents(installments, { from, to }),
    ...buildCreditCardPaymentEvents(creditCards, { from, to }),
    ...buildDebtPaymentEvents(debts, { from, to }),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function getEndOfCurrentMonth(referenceDate = new Date()) {
  return addDays(startOfNextMonth(referenceDate), -1)
}
