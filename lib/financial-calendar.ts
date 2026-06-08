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
  eventStatus?: 'confirmed' | 'estimated' | 'manual' | 'pending_confirmation' | 'informational'
  possibleDuplicate?: boolean
  duplicateReason?: string
  affectsCash: boolean
  affectsBudget: boolean
}

export type FinancialCalendarReminder = {
  id: string
  title: string
  due_date: string
  amount: number | null
  status?: string | null
  reminder_type?: string | null
}

export type FinancialCalendarCreditCard = {
  id: string
  name: string
  credit_limit?: number
  current_balance: number
  statement_cutoff_day?: number
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
  next_payment_date?: string | null
  payment_frequency?: 'one_time' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | null
  payment_account_id?: string | null
  payment_account_is_external?: boolean
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

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime())
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

function nextDebtPaymentDate(
  frequency: NonNullable<FinancialCalendarDebt['payment_frequency']>,
  current: Date
) {
  if (frequency === 'weekly') return addDays(current, 7)
  if (frequency === 'biweekly') return addDays(current, 14)
  if (frequency === 'quarterly') {
    const next = new Date(current)
    next.setMonth(next.getMonth() + 3)
    return next
  }
  if (frequency === 'yearly') {
    const next = new Date(current)
    next.setFullYear(next.getFullYear() + 1)
    return next
  }
  return addMonthsOnDay(current, current.getDate())
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
            eventStatus: schedule.confidence === 'confirmed' ? 'confirmed' : 'estimated',
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

  const events: FinancialCalendarEvent[] = []

  reminders
    .filter((reminder) => (reminder.status || 'pending') === 'pending')
    .forEach((reminder) => {
      const amount = Number(reminder.amount || 0)
      const dueDate = parseDateOnly(reminder.due_date)
      const isNonFinancial = reminder.reminder_type === 'non_financial'
      const affectsCash = amount > 0 && !isNonFinancial

      if (!isValidDate(dueDate)) return

      events.push({
        id: `reminder-${reminder.id}`,
        date: formatDateOnly(dueDate),
        title: reminder.title,
        amount,
        direction: affectsCash ? 'outflow' as const : 'neutral' as const,
        sourceType: 'reminder' as const,
        confidence: 'manual' as const,
        eventStatus: affectsCash ? 'manual' as const : 'informational' as const,
        affectsCash,
        affectsBudget: false,
      })
    })

  return events
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
    const cashEnabled = charge.affects_cash !== false
    const affectsCash = cashEnabled && charge.payment_method_type !== 'credit_card'
    let cursor = parseDateOnly(charge.next_charge_date)
    let guard = 0

    if (!isValidDate(cursor)) return []

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
        eventStatus: cashEnabled ? (charge.payment_method_type === 'manual_choice' ? 'manual' : 'estimated') : 'informational',
        affectsCash,
        affectsBudget: cashEnabled,
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
        eventStatus: 'informational',
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
      if (Number(card.current_balance || 0) <= 0) return []

      const dueDate = firstDateOnOrAfter(from, Number(card.payment_due_day || from.getDate()))
      return [{
        id: `credit_card_payment-${card.id}-${formatDateOnly(dueDate)}`,
        date: formatDateOnly(dueDate),
        title: amount > 0 ? `Pago ${card.name}` : `Pago ${card.name} pendiente por confirmar`,
        amount,
        direction: amount > 0 ? 'outflow' as const : 'neutral' as const,
        sourceType: 'credit_card_payment' as const,
        creditCardId: card.id,
        confidence: 'estimated' as const,
        eventStatus: amount > 0 ? 'estimated' as const : 'pending_confirmation' as const,
        affectsCash: amount > 0,
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
  const maxEventsPerSchedule = options.maxEventsPerSchedule ?? 24

  const events: FinancialCalendarEvent[] = []

  debts
    .filter((debt) => (debt.status || 'active') === 'active')
    .filter((debt) => Number(debt.current_balance || 0) > 0)
    .forEach((debt) => {
      const amount = Number(debt.monthly_payment || 0)
      const paymentDate = debt.next_payment_date || debt.start_date
      if (!paymentDate) return

      let cursor = parseDateOnly(paymentDate)
      if (!isValidDate(cursor)) return

      const frequency = debt.payment_frequency || 'monthly'
      let guard = 0

      while (cursor < from && frequency !== 'one_time' && guard < maxEventsPerSchedule) {
        cursor = nextDebtPaymentDate(frequency, cursor)
        guard += 1
      }

      while (cursor <= to && guard < maxEventsPerSchedule) {
        const hasAmount = amount > 0
        const affectsCash = hasAmount && debt.payment_account_is_external !== true

        events.push({
          id: `debt_payment-${debt.id}-${formatDateOnly(cursor)}`,
          date: formatDateOnly(cursor),
          title: hasAmount ? `Pago ${debt.name || 'deuda'}` : `Pago ${debt.name || 'deuda'} pendiente por confirmar`,
          amount,
          direction: hasAmount ? 'outflow' as const : 'neutral' as const,
          sourceType: 'debt_payment' as const,
          accountId: debt.payment_account_id || undefined,
          debtId: debt.id,
          confidence: 'estimated' as const,
          eventStatus: hasAmount && debt.payment_account_is_external !== true ? 'estimated' as const : 'informational' as const,
          affectsCash,
          affectsBudget: false,
        })

        if (frequency === 'one_time') break
        cursor = nextDebtPaymentDate(frequency, cursor)
        guard += 1
      }
    })

  return events
    .filter((event) => isWithinWindow(parseDateOnly(event.date), from, to))
}

function buildCalendarSource(label: string, build: () => FinancialCalendarEvent[]) {
  try {
    return build()
  } catch (error) {
    console.warn(`No se pudieron generar eventos de ${label}.`, error)
    return []
  }
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
  const events = [
    ...buildCalendarSource('ingresos programados', () => buildIncomeScheduleEvents(incomeSchedules, { from, to })),
    ...buildCalendarSource('recordatorios', () => buildReminderEvents(reminders, { from, to })),
    ...buildCalendarSource('recurrentes', () => buildRecurringChargeEvents(recurringCharges, { from, to })),
    ...buildCalendarSource('MSI', () => buildInstallmentEvents(installments, { from, to })),
    ...buildCalendarSource('pagos de tarjeta', () => buildCreditCardPaymentEvents(creditCards, { from, to })),
    ...buildCalendarSource('deudas', () => buildDebtPaymentEvents(debts, { from, to })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return markPossibleDuplicateReminders(events)
}

export function getEndOfCurrentMonth(referenceDate = new Date()) {
  return addDays(startOfNextMonth(referenceDate), -1)
}

function markPossibleDuplicateReminders(events: FinancialCalendarEvent[]) {
  return events.map((event) => {
    if (event.sourceType !== 'reminder' || !event.affectsCash || event.amount <= 0) {
      return event
    }

    const duplicate = events.find((candidate) => {
      if (candidate.id === event.id) return false
      if (candidate.sourceType === 'reminder') return false
      if (!candidate.affectsCash || candidate.direction !== 'outflow') return false
      if (candidate.date !== event.date) return false
      return Math.abs(Number(candidate.amount || 0) - Number(event.amount || 0)) <= 1
    })

    if (!duplicate) return event

    return {
      ...event,
      affectsCash: false,
      affectsBudget: false,
      eventStatus: 'informational' as const,
      possibleDuplicate: true,
      duplicateReason: `Coincide con ${duplicate.title} el mismo dia y por un monto similar.`,
    }
  })
}
