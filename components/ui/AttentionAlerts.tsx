import Link from 'next/link'
import { AlertTriangle, BellRing, CalendarClock } from 'lucide-react'
import { formatDate, formatMoney } from '@/lib/utils'
import type { AttentionAlert } from '@/lib/attention-alerts'

type AttentionAlertsProps = {
  alerts: AttentionAlert[]
  title?: string
  compact?: boolean
  className?: string
}

const urgencyLabels: Record<AttentionAlert['urgency'], string> = {
  overdue: 'Vencido',
  today: 'Hoy',
  tomorrow: 'Mañana',
}

const severityClasses: Record<AttentionAlert['severity'], string> = {
  critical: 'border-rose-200 bg-rose-50 text-rose-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
}

function summaryText(alerts: AttentionAlert[]) {
  const overdue = alerts.filter((alert) => alert.urgency === 'overdue').length
  const today = alerts.filter((alert) => alert.urgency === 'today').length
  const tomorrow = alerts.filter((alert) => alert.urgency === 'tomorrow').length

  if (overdue > 0) return `${overdue} vencido${overdue === 1 ? '' : 's'} por atender`
  if (today > 0) return `${today} pendiente${today === 1 ? '' : 's'} para hoy`
  if (tomorrow > 0) return `${tomorrow} aviso${tomorrow === 1 ? '' : 's'} para mañana`
  return 'Sin alertas urgentes'
}

export function AttentionAlerts({
  alerts,
  title = 'Atención inmediata',
  compact = false,
  className = '',
}: AttentionAlertsProps) {
  if (alerts.length === 0) return null

  const primaryAlert = alerts[0]
  const visibleAlerts = compact ? alerts.slice(0, 2) : alerts.slice(0, 4)
  const Icon = primaryAlert.urgency === 'tomorrow' ? CalendarClock : BellRing
  const mainActionHref = alerts.length > 1 ? '/flujo' : primaryAlert.actionHref
  const mainActionLabel = alerts.length > 1 ? 'Ver alertas' : primaryAlert.actionLabel

  if (compact) {
    return (
      <section className={`rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 shadow-sm ${className}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${severityClasses[primaryAlert.severity]}`}>
              <Icon size={17} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{title}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${severityClasses[primaryAlert.severity]}`}>
                  {summaryText(alerts)}
                </span>
              </div>
              <p className="mt-1 truncate text-sm font-black text-slate-950">
                {primaryAlert.title} · {primaryAlert.amount > 0 ? formatMoney(primaryAlert.amount) : 'Sin monto'} · {formatDate(primaryAlert.date)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Link href={mainActionHref} className="text-xs font-black uppercase tracking-widest text-slate-500 transition hover:text-slate-950">
              {mainActionLabel}
            </Link>
          </div>
        </div>
        {visibleAlerts.length > 1 && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {visibleAlerts.map((alert) => (
              <div key={alert.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-900">{alert.title}</p>
                  <p className="text-[11px] font-bold text-slate-500">
                    {urgencyLabels[alert.urgency]} · {formatDate(alert.date)}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-black ${alert.amount > 0 && alert.affectsCash ? 'text-rose-600' : alert.amount > 0 ? 'text-sky-600' : 'text-slate-500'}`}>
                  {alert.amount > 0 ? formatMoney(alert.amount) : 'Sin monto'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <section className={`rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${severityClasses[primaryAlert.severity]}`}>
            <Icon size={18} />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{title}</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">{summaryText(alerts)}</h2>
            <p className="mt-1 max-w-2xl text-xs font-bold leading-relaxed text-slate-500">
              Avisos generados con tus pagos, recordatorios, recurrentes e ingresos esperados. Atiende o confirma para mantener tu flujo limpio.
            </p>
          </div>
        </div>
        <Link
          href={mainActionHref}
          className="w-fit rounded-xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-slate-800"
        >
          {mainActionLabel}
        </Link>
      </div>

      <div className="mt-4 grid gap-2">
        {visibleAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`rounded-xl border px-3 py-2 ${
              alert.severity === 'critical'
                ? 'border-rose-100 bg-rose-50/70'
                : alert.severity === 'warning'
                  ? 'border-amber-100 bg-amber-50/70'
                  : 'border-sky-100 bg-sky-50/70'
            }`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${severityClasses[alert.severity]}`}>
                    {urgencyLabels[alert.urgency]}
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {alert.affectsCash ? 'Afecta caja' : 'Informativo'}
                  </span>
                </div>
                <p className="mt-1 text-base font-black text-slate-950">{alert.title}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{formatDate(alert.date)} · {alert.description}</p>
              </div>
              <div className="text-left md:text-right">
                <p className={`text-base font-black ${alert.amount > 0 && alert.affectsCash ? 'text-rose-600' : alert.amount > 0 ? 'text-sky-600' : 'text-slate-600'}`}>
                  {alert.amount > 0 ? formatMoney(alert.amount) : 'Sin monto'}
                </p>
                <Link href={alert.actionHref} className="mt-1 inline-flex text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:text-slate-950">
                  Atender
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {alerts.length > visibleAlerts.length && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
          <AlertTriangle size={16} />
          Hay {alerts.length - visibleAlerts.length} aviso{alerts.length - visibleAlerts.length === 1 ? '' : 's'} más en el flujo.
        </div>
      )}
    </section>
  )
}
