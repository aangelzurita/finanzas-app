export type RecurringFrequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'

function safeDayForMonth(year: number, month: number, preferredDay: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return Math.min(preferredDay, lastDay)
}

export function calculateNextChargeDate(
  frequency: RecurringFrequency,
  chargeDay?: number | null
): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (frequency === 'weekly') {
    const next = new Date(today)
    next.setDate(next.getDate() + 7)
    return next.toISOString().slice(0, 10)
  }

  if (frequency === 'biweekly') {
    const next = new Date(today)
    next.setDate(next.getDate() + 14)
    return next.toISOString().slice(0, 10)
  }

  const preferredDay = chargeDay && chargeDay >= 1 ? chargeDay : today.getDate()

  let year = today.getFullYear()
  let month = today.getMonth()

  const currentMonthDay = safeDayForMonth(year, month, preferredDay)
  let candidate = new Date(year, month, currentMonthDay)

  if (candidate <= today) {
    if (frequency === 'monthly') month += 1
    if (frequency === 'quarterly') month += 3
    if (frequency === 'yearly') year += 1

    if (frequency !== 'yearly') {
      year += Math.floor(month / 12)
      month = month % 12
    }
  }

  const finalDay = safeDayForMonth(year, month, preferredDay)
  const next = new Date(year, month, finalDay)

  return next.toISOString().slice(0, 10)
}
