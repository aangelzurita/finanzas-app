'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { KpiCard } from '@/components/ui/KpiCard'
import { buildCashflowProjection, type CashflowRiskLevel } from '@/lib/cashflow-projection'
import {
  buildFinancialCalendarEvents,
  getEndOfCurrentMonth,
  type FinancialCalendarCreditCard,
  type FinancialCalendarDebt,
  type FinancialCalendarEvent,
  type FinancialCalendarReminder,
  type IncomeSchedule,
} from '@/lib/financial-calendar'
import { type CreditCardInstallment } from '@/lib/credit-card-installments'
import { type RecurringCharge } from '@/lib/recurring-charges'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatMoney } from '@/lib/utils'

type Horizon = '15d' | 'month' | '60d'

type Account = {
  id: string
  account_type: string
  current_balance: number
}

const horizonLabels: Record<Horizon, string> = {
  '15d': '15 días',
  month: 'Este mes',
  '60d': '60 días',
}

const riskLabels: Record<CashflowRiskLevel, string> = {
  ok: 'Estable',
  caution: 'Precaución',
  risk: 'Riesgo',
}

const riskClasses: Record<CashflowRiskLevel, string> = {
  ok: 'text-emerald-600',
  caution: 'text-amber-600',
  risk: 'text-rose-600',
}

const confidenceLabels: Record<FinancialCalendarEvent['confidence'], string> = {
  confirmed: 'Confirmado',
  estimated: 'Estimado',
  manual: 'Manual',
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function endDateForHorizon(horizon: Horizon) {
  const today = new Date()
  if (horizon === '15d') return addDays(today, 15)
  if (horizon === '60d') return addDays(today, 60)
  return getEndOfCurrentMonth(today)
}

export default function FlujoPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [horizon, setHorizon] = useState<Horizon>('month')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [incomeSchedules, setIncomeSchedules] = useState<IncomeSchedule[]>([])
  const [reminders, setReminders] = useState<FinancialCalendarReminder[]>([])
  const [recurring, setRecurring] = useState<RecurringCharge[]>([])
  const [installments, setInstallments] = useState<CreditCardInstallment[]>([])
  const [cards, setCards] = useState<FinancialCalendarCreditCard[]>([])
  const [debts, setDebts] = useState<FinancialCalendarDebt[]>([])

  const loadData = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      window.location.href = '/'
      return
    }

    const [
      { data: accountsData, error: accountsError },
      { data: incomeData, error: incomeError },
      { data: remindersData, error: remindersError },
      { data: recurringData, error: recurringError },
      { data: installmentData, error: installmentError },
      { data: cardData, error: cardError },
      { data: debtsData, error: debtsError },
    ] = await Promise.all([
      supabase.from('accounts').select('id, account_type, current_balance').eq('is_active', true),
      supabase.from('income_schedules').select('*').eq('is_active', true).order('next_income_date', { ascending: true }),
      supabase.from('reminders').select('id, title, due_date, amount, status').eq('status', 'pending').order('due_date', { ascending: true }),
      supabase.from('recurring_charges').select('*').eq('is_active', true),
      supabase.from('credit_card_installments').select('*').neq('status', 'canceled'),
      supabase
        .from('credit_cards')
        .select('id, name, current_balance, payment_due_day, minimum_payment, no_interest_payment')
        .eq('is_active', true),
      supabase.from('debts').select('id, name, current_balance, monthly_payment, start_date, status').neq('status', 'canceled'),
    ])

    const firstError = [
      accountsError,
      incomeError,
      remindersError,
      recurringError,
      installmentError,
      cardError,
      debtsError,
    ].find(Boolean)

    if (firstError) {
      setMessage(firstError.message)
    }

    setAccounts((accountsData as Account[]) ?? [])
    setIncomeSchedules((incomeData as IncomeSchedule[]) ?? [])
    setReminders((remindersData as FinancialCalendarReminder[]) ?? [])
    setRecurring((recurringData as RecurringCharge[]) ?? [])
    setInstallments((installmentData as CreditCardInstallment[]) ?? [])
    setCards((cardData as FinancialCalendarCreditCard[]) ?? [])
    setDebts((debtsData as FinancialCalendarDebt[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
  }, [loadData])

  const currentBalance = useMemo(
    () =>
      accounts
        .filter((account) => ['cash', 'debit'].includes(account.account_type))
        .reduce((acc, account) => acc + Number(account.current_balance || 0), 0),
    [accounts]
  )

  const endDate = useMemo(() => endDateForHorizon(horizon), [horizon])

  const events = useMemo(
    () =>
      buildFinancialCalendarEvents({
        incomeSchedules,
        reminders,
        recurringCharges: recurring,
        installments,
        creditCards: cards,
        debts,
        from: new Date(),
        to: endDate,
      }),
    [incomeSchedules, reminders, recurring, installments, cards, debts, endDate]
  )

  const projection = useMemo(
    () =>
      buildCashflowProjection({
        currentBalance,
        events,
        startDate: new Date(),
        endDate,
      }),
    [currentBalance, events, endDate]
  )

  const pointsWithEvents = projection.points.filter((point) => point.events.length > 0)

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Calculando flujo...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-12">
      <section className="bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                <Link href="/" className="hover:text-white transition">Home</Link>
                <span>/</span>
                <span className="text-slate-200 font-medium">Flujo</span>
              </nav>
              <h1 className="text-5xl font-extrabold tracking-tight">Proyección de Flujo</h1>
              <p className="text-slate-400 mt-3 text-lg max-w-2xl">
                Proyección estimada con base en ingresos y compromisos registrados.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition shadow-lg active:scale-95"
            >
              Volver
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 -mt-8">
        {message && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 shadow-sm">
            {message}
          </div>
        )}

        <div className="mb-6 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-xl">
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(horizonLabels).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setHorizon(value as Horizon)}
                className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                  horizon === value
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <KpiCard title="Saldo actual" value={formatMoney(projection.summary.currentBalance)} />
          <KpiCard title="Cierre proyectado" value={formatMoney(projection.summary.projectedEndBalance)} valueClassName={projection.summary.projectedEndBalance >= 0 ? 'text-slate-950' : 'text-rose-600'} />
          <KpiCard title="Saldo más bajo" value={formatMoney(projection.summary.lowestBalance)} subtitle={formatDate(projection.summary.lowestBalanceDate)} valueClassName={projection.summary.lowestBalance >= 0 ? 'text-slate-950' : 'text-rose-600'} />
          <KpiCard title="Riesgo" value={riskLabels[projection.summary.riskLevel]} valueClassName={riskClasses[projection.summary.riskLevel]} />
        </div>

        <div className="rounded-[2.5rem] border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="border-b border-slate-100 px-8 py-6">
            <h2 className="text-2xl font-black text-slate-900">Eventos y saldo proyectado</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Compras con tarjeta y MSI pueden mostrarse como compromisos; el efectivo baja solo en eventos que afectan caja.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {pointsWithEvents.map((point) => (
              <div key={point.date} className="grid gap-4 px-8 py-5 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <p className="font-black text-slate-900">{formatDate(point.date)}</p>
                  <p className={`mt-1 text-sm font-black ${riskClasses[point.riskLevel]}`}>
                    Saldo: {formatMoney(point.endingBalance)}
                  </p>
                </div>

                <div className="space-y-3 lg:col-span-9">
                  {point.events.map((event) => (
                    <div key={event.id} className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-slate-900">{event.title}</p>
                          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {confidenceLabels[event.confidence]}
                          </span>
                          {!event.affectsCash && (
                            <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-sky-700">
                              Compromiso
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs font-bold text-slate-400">{event.sourceType.replaceAll('_', ' ')}</p>
                      </div>
                      <p className={`text-lg font-black ${event.direction === 'inflow' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {event.direction === 'inflow' ? '+' : '-'} {formatMoney(event.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {pointsWithEvents.length === 0 && (
              <div className="px-8 py-20 text-center">
                <p className="font-bold text-slate-500">No hay eventos futuros para este horizonte.</p>
                <p className="mt-1 text-sm text-slate-400">Registra ingresos programados o compromisos para proyectar el flujo.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
