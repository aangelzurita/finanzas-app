import type { FinancialCalendarEvent } from '@/lib/financial-calendar'

export type AttentionAlertUrgency = 'overdue' | 'today' | 'tomorrow'
export type AttentionAlertSeverity = 'critical' | 'warning' | 'info'

export type AttentionAlert = {
  id: string
  title: string
  date: string
  amount: number
  sourceType: FinancialCalendarEvent['sourceType']
  urgency: AttentionAlertUrgency
  severity: AttentionAlertSeverity
  affectsCash: boolean
  actionLabel: string
  actionHref: string
  description: string
}

function parseDateOnly(value: string | Date) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  return new Date(`${value.slice(0, 10)}T12:00:00`)
}

function formatDateOnly(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function daysBetween(from: Date, to: Date) {
  const start = parseDateOnly(from)
  const end = parseDateOnly(to)
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

function actionForSource(sourceType: FinancialCalendarEvent['sourceType']) {
  const actions: Record<FinancialCalendarEvent['sourceType'], { label: string; href: string }> = {
    income_schedule: { label: 'Confirmar ingreso', href: '/ingresos' },
    recurring_charge: { label: 'Atender recurrente', href: '/recurrentes' },
    installment: { label: 'Ver MSI', href: '/obligaciones' },
    credit_card_payment: { label: 'Registrar pago', href: '/movimientos/nuevo?type=credit_card_payment' },
    debt_payment: { label: 'Registrar pago', href: '/movimientos/nuevo?type=debt_payment' },
    reminder: { label: 'Ver recordatorio', href: '/recordatorios' },
    transaction: { label: 'Ver movimientos', href: '/movimientos' },
  }

  return actions[sourceType]
}

function actionForEvent(event: FinancialCalendarEvent) {
  if (event.sourceType === 'credit_card_payment') {
    const cardParam = event.creditCardId || event.sourceId
    const params = new URLSearchParams({
      type: 'credit_card_payment',
      returnTo: '/flujo',
    })

    if (cardParam) params.set('creditCard', cardParam)
    return { label: 'Pagar tarjeta', href: `/movimientos/nuevo?${params.toString()}` }
  }

  if (event.sourceType === 'debt_payment') {
    const params = new URLSearchParams({
      type: 'debt_payment',
      returnTo: '/flujo',
    })

    if (event.debtId || event.sourceId) params.set('debt', event.debtId || event.sourceId || '')
    return { label: 'Pagar deuda', href: `/movimientos/nuevo?${params.toString()}` }
  }

  if (event.sourceType === 'recurring_charge' && event.sourceId) {
    const params = new URLSearchParams({
      returnTo: '/flujo',
      dueDate: event.date,
    })
    return { label: 'Atender recurrente', href: `/recurrentes/${event.sourceId}/pagar?${params.toString()}` }
  }

  return actionForSource(event.sourceType)
}

function descriptionFor(event: FinancialCalendarEvent, urgency: AttentionAlertUrgency) {
  if (event.sourceType === 'income_schedule') {
    return urgency === 'overdue'
      ? 'Este ingreso esperado ya pasó. Confirma si lo recibiste o ajusta la próxima fecha.'
      : 'Ingreso esperado cercano. Confírmalo cuando caiga para mantener la proyección limpia.'
  }

  if (event.sourceType === 'credit_card_payment') {
    if (urgency === 'today') {
      return event.amount > 0
        ? 'Hoy es la fecha límite de pago. Atiéndelo hoy para evitar intereses o atraso.'
        : 'Hoy es fecha límite, pero falta confirmar el monto real del corte.'
    }

    if (urgency === 'overdue') {
      return event.amount > 0
        ? 'Este pago ya aparece vencido. Si ya lo pagaste, registra o revisa el pago asociado a esta tarjeta.'
        : 'Este pago venció sin monto confirmado. Revisa el corte.'
    }

    return event.amount > 0
      ? 'Pago de tarjeta próximo. Prepáralo antes de la fecha límite.'
      : 'Pago de tarjeta pendiente por confirmar. Revisa el corte y captura el monto real.'
  }

  if (!event.affectsCash) {
    return 'Recordatorio visible. No baja caja hasta que tenga monto o se registre el movimiento.'
  }

  return 'Compromiso cercano que puede bajar tu efectivo disponible.'
}

function shouldAlert(event: FinancialCalendarEvent) {
  if (event.sourceType === 'installment') return false
  if (event.possibleDuplicate) return false
  if (event.sourceType === 'transaction') return false

  if (event.sourceType === 'income_schedule') return true
  if (event.eventStatus === 'pending_confirmation') return true
  if (event.affectsCash) return true
  if (event.sourceType === 'reminder') return true

  return false
}

export function buildAttentionAlerts(
  events: FinancialCalendarEvent[],
  referenceDate: string | Date = new Date()
): AttentionAlert[] {
  const today = parseDateOnly(referenceDate)
  const tomorrow = addDays(today, 1)
  const tomorrowKey = formatDateOnly(tomorrow)

  return events
    .filter(shouldAlert)
    .map((event): AttentionAlert | null => {
      const eventDate = parseDateOnly(event.date)
      const diff = daysBetween(today, eventDate)

      if (diff > 1) return null
      if (
        event.sourceType === 'credit_card_payment' &&
        Number(event.amount || 0) <= 0 &&
        event.eventStatus === 'pending_confirmation' &&
        diff < 0
      ) {
        return null
      }

      const urgency: AttentionAlertUrgency =
        diff < 0 ? 'overdue' : diff === 0 ? 'today' : 'tomorrow'
      const severity: AttentionAlertSeverity =
        urgency === 'overdue' || urgency === 'today'
          ? event.affectsCash || event.sourceType === 'credit_card_payment'
            ? 'critical'
            : 'warning'
          : 'warning'
      const action = actionForEvent(event)

      return {
        id: event.id,
        title: event.title,
        date: formatDateOnly(eventDate),
        amount: Number(event.amount || 0),
        sourceType: event.sourceType,
        urgency,
        severity,
        affectsCash: event.affectsCash,
        actionLabel: action.label,
        actionHref: action.href,
        description: descriptionFor(event, urgency),
      }
    })
    .filter((alert): alert is AttentionAlert => Boolean(alert))
    .sort((a, b) => {
      const priority = (alert: AttentionAlert) => {
        if (alert.sourceType === 'credit_card_payment' && alert.urgency === 'today') return 0
        if (alert.sourceType === 'credit_card_payment' && alert.urgency === 'overdue') return 1
        if (alert.urgency === 'today') return 2
        if (alert.urgency === 'overdue') return 3
        return 4
      }
      const priorityDiff = priority(a) - priority(b)
      if (priorityDiff !== 0) return priorityDiff

      const urgencyOrder: Record<AttentionAlertUrgency, number> = { overdue: 0, today: 1, tomorrow: 2 }
      const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
      if (urgencyDiff !== 0) return urgencyDiff

      const dateDiff = new Date(`${a.date}T12:00:00`).getTime() - new Date(`${b.date}T12:00:00`).getTime()
      if (dateDiff !== 0) return dateDiff

      return Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0))
    })
    .filter((alert) => alert.urgency !== 'tomorrow' || alert.date === tomorrowKey)
}
