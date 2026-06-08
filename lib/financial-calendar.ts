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

export function buildFinancialCalendarEvents({
  incomeSchedules = [],
  from,
  to,
}: {
  incomeSchedules?: IncomeSchedule[]
  from?: string | Date
  to?: string | Date
}) {
  // TODO: Integrar recurrentes, recordatorios, MSI, pagos de tarjeta y deudas como eventos derivados.
  return buildIncomeScheduleEvents(incomeSchedules, { from, to })
}
