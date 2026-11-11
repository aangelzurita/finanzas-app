'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getAppDate } from '@/lib/app-date'
import { formatMoney } from '@/lib/utils'
import { syncCardReminders } from '@/lib/card-reminders'
import { KpiCard } from '@/components/ui/KpiCard'
import { MiniStat } from '@/components/ui/MiniStat'
import { AlertPill } from '@/components/ui/Alerts'
import { DeleteCardButton } from '@/components/cards/DeleteCardButton'
import { adviseCreditCards } from '@/lib/credit-card-advisor'

type CreditCard = {
  id: string
  account_id: string
  name: string
  bank: string | null
  statement_cutoff_day: number
  payment_due_day: number
  credit_limit: number
  current_balance: number
  minimum_payment: number
  no_interest_payment: number
}

type CardEvaluation = {
  card: CreditCard
  usagePercent: number
  available: number
  daysToCutoff: number
  daysToPayment: number
  recommendation: {
    text: string
    color: string
    bg: string
  }
  score: number
  reasons: string[]
  alerts: {
    level: 'info' | 'warning' | 'danger'
    text: string
  }[]
}

function daysUntilDayOfMonthFrom(referenceDate: Date, day: number) {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
  const safeDay = Math.max(1, Number(day || 1))
  let target = new Date(today.getFullYear(), today.getMonth(), safeDay)

  if (target < today) {
    target = new Date(today.getFullYear(), today.getMonth() + 1, safeDay)
  }

  const diff = target.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export default function TarjetasPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<CreditCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info')
  const [syncingReminders, setSyncingReminders] = useState(false)
  const appDate = useMemo(() => getAppDate(), [])

  useEffect(() => {
    void initialize()
  }, [])

  const initialize = async () => {
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData.session) {
      window.location.href = '/'
      return
    }

    const { data, error } = await supabase
      .from('credit_cards')
      .select(`
        id,
        account_id,
        name,
        bank,
        statement_cutoff_day,
        payment_due_day,
        credit_limit,
        current_balance,
        minimum_payment,
        no_interest_payment
      `)
      .eq('is_active', true)
      .order('name')

    if (error) {
      setMessage(error.message)
      setMessageType('error')
    }

    setCards((data as CreditCard[]) ?? [])
    setLoading(false)
  }

  const handleSyncReminders = async () => {
    setSyncingReminders(true)
    setMessage('')

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user?.id

    if (!userId) {
      setMessage('No hay sesión activa.')
      setMessageType('error')
      setSyncingReminders(false)
      return
    }

    try {
      await syncCardReminders(
        supabase,
        userId,
        cards.map((card) => ({
          id: card.id,
          name: card.name,
          statement_cutoff_day: card.statement_cutoff_day,
          payment_due_day: card.payment_due_day,
        }))
      )

      setMessage('Recordatorios sincronizados correctamente.')
      setMessageType('success')
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron sincronizar los recordatorios.')
      setMessageType('error')
    } finally {
      setSyncingReminders(false)
    }
  }

  const getRecommendation = (daysToCutoff: number) => {
    if (daysToCutoff >= 7) {
      return {
        text: 'Buen momento para comprar',
        color: 'text-emerald-600',
        bg: 'bg-emerald-50 border-emerald-200',
      }
    }

    if (daysToCutoff >= 1 && daysToCutoff < 7) {
      return {
        text: 'Compra con cuidado, el corte está cerca',
        color: 'text-amber-600',
        bg: 'bg-amber-50 border-amber-200',
      }
    }

    return {
      text: 'Conviene esperar al próximo corte',
      color: 'text-rose-600',
      bg: 'bg-rose-50 border-rose-200',
    }
  }

  const getUsagePercent = (balance: number, limit: number) => {
    if (!limit || limit <= 0) return 0
    return (Math.max(0, balance) / limit) * 100
  }

  const getAlerts = (
    usagePercent: number,
    daysToCutoff: number,
    daysToPayment: number
  ) => {
    const alerts: { level: 'info' | 'warning' | 'danger'; text: string }[] = []

    if (daysToCutoff <= 0) {
      alerts.push({ level: 'danger', text: 'Hoy es día de corte o ya pasó el corte.' })
    } else if (daysToCutoff <= 2) {
      alerts.push({ level: 'danger', text: `Corte en ${daysToCutoff} día(s).` })
    } else if (daysToCutoff <= 5) {
      alerts.push({ level: 'warning', text: `El corte está cerca: ${daysToCutoff} días.` })
    }

    if (daysToPayment <= 0) {
      alerts.push({ level: 'danger', text: 'Hoy vence el pago o ya venció.' })
    } else if (daysToPayment <= 2) {
      alerts.push({ level: 'danger', text: `Pago límite en ${daysToPayment} día(s).` })
    } else if (daysToPayment <= 5) {
      alerts.push({ level: 'warning', text: `Pago próximo: ${daysToPayment} días.` })
    }

    if (usagePercent >= 90) {
      alerts.push({ level: 'danger', text: 'Uso de línea arriba de 90%.' })
    } else if (usagePercent >= 70) {
      alerts.push({ level: 'warning', text: 'Uso de línea arriba de 70%.' })
    } else if (usagePercent >= 50) {
      alerts.push({ level: 'info', text: 'Uso de línea moderado.' })
    }

    return alerts
  }

  const evaluatedCards = useMemo<CardEvaluation[]>(() => {
    return cards.map((card) => {
      const usagePercent = getUsagePercent(
        Number(card.current_balance || 0),
        Number(card.credit_limit || 0)
      )

      const available =
        Number(card.credit_limit || 0) - Math.max(0, Number(card.current_balance || 0))

      const daysToCutoff = daysUntilDayOfMonthFrom(appDate, card.statement_cutoff_day)
      const daysToPayment = daysUntilDayOfMonthFrom(appDate, card.payment_due_day)
      const recommendation = getRecommendation(daysToCutoff)
      const alerts = getAlerts(usagePercent, daysToCutoff, daysToPayment)

      let score = 0
      const reasons: string[] = []

      if (daysToCutoff >= 7) {
        score += 50
        reasons.push('Está lejos de la fecha de corte')
      } else if (daysToCutoff >= 3) {
        score += 25
        reasons.push('Todavía no está tan cerca del corte')
      } else {
        score -= 20
        reasons.push('Está muy cerca de la fecha de corte')
      }

      if (usagePercent < 30) {
        score += 35
        reasons.push('Tiene bajo nivel de uso')
      } else if (usagePercent < 60) {
        score += 15
        reasons.push('Tiene un nivel de uso aceptable')
      } else if (usagePercent < 80) {
        score -= 10
        reasons.push('Ya tiene un uso relativamente alto')
      } else {
        score -= 30
        reasons.push('Está muy cargada')
      }

      if (available > 5000) {
        score += 15
        reasons.push('Tiene buen crédito disponible')
      } else if (available <= 1000) {
        score -= 20
        reasons.push('Tiene poco crédito disponible')
      }

      return {
        card,
        usagePercent,
        available,
        daysToCutoff,
        daysToPayment,
        recommendation,
        score,
        reasons,
        alerts,
      }
    })
  }, [cards, appDate])

  const advisorResults = useMemo(() => adviseCreditCards(cards, appDate), [cards, appDate])

  const bestAdvisorCard = advisorResults[0] || null

  const walletCards = useMemo(() => {
    const advisorRanks = new Map(advisorResults.map((item, index) => [item.cardId, index]))
    return [...evaluatedCards].sort((a, b) =>
      (advisorRanks.get(a.card.id) ?? Number.MAX_SAFE_INTEGER) -
      (advisorRanks.get(b.card.id) ?? Number.MAX_SAFE_INTEGER)
    )
  }, [advisorResults, evaluatedCards])

  const selectedCardEvaluation =
    walletCards.find((item) => item.card.id === selectedCardId) ??
    walletCards.find((item) => item.card.id === bestAdvisorCard?.cardId) ??
    walletCards[0] ??
    null

  const selectedAdvisorCard = advisorResults.find(
    (item) => item.cardId === selectedCardEvaluation?.card.id
  )

  const summary = useMemo(() => {
    const totalLimit = cards.reduce((acc, c) => acc + Number(c.credit_limit || 0), 0)
    const totalUsed = cards.reduce((acc, c) => acc + Math.max(0, Number(c.current_balance || 0)), 0)
    const totalAvailable = totalLimit - totalUsed

    return {
      totalLimit,
      totalUsed,
      totalAvailable,
    }
  }, [cards])

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Cargando tarjetas...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="finance-shell min-h-screen pb-12">
      <section className="finance-surface-dark text-white">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                <Link href="/" className="hover:text-white transition">Home</Link>
                <span>/</span>
                <span className="text-slate-200 font-medium">Tarjetas</span>
              </nav>
              <h1 className="text-5xl font-extrabold tracking-tight">Mis Tarjetas</h1>
              <p className="text-slate-400 mt-3 text-lg max-w-2xl">
                Visualiza el estado de tus créditos, fechas de corte y optimiza tus compras.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSyncReminders}
                disabled={syncingReminders}
                className="rounded-2xl bg-sky-600 hover:bg-sky-500 transition-all px-6 py-4 font-bold text-white shadow-lg active:scale-95 disabled:opacity-50"
              >
                {syncingReminders ? 'Sincronizando...' : 'Sincronizar recordatorios'}
              </button>

              <Link
                href="/tarjetas/nueva"
                className="rounded-2xl bg-emerald-500 hover:bg-emerald-400 transition-all px-6 py-4 font-bold text-white shadow-lg active:scale-95"
              >
                Nueva tarjeta
              </Link>

              <Link
                href="/"
                className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition-all active:scale-95 shadow-lg"
              >
                Cerrar
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 -mt-8">
        {message && (
          <div className={`mb-6 rounded-2xl border px-4 py-4 text-sm font-bold shadow-lg animate-in fade-in slide-in-from-top-2 ${messageType === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
              messageType === 'error' ? 'bg-rose-50 border-rose-100 text-rose-700' :
                'bg-sky-50 border-sky-100 text-sky-700'
            }`}>
            <span className="mr-2 text-lg">{messageType === 'success' ? '✅' : messageType === 'error' ? '❌' : 'ℹ️'}</span>
            {message}
          </div>
        )}

        <div className="mb-8 grid gap-6 md:grid-cols-3">
          <KpiCard title="Línea total" value={formatMoney(summary.totalLimit)} valueClassName="text-slate-900" />
          <KpiCard title="Saldo usado" value={formatMoney(summary.totalUsed)} valueClassName="text-rose-600" />
          <KpiCard title="Disponible" value={formatMoney(summary.totalAvailable)} valueClassName="text-emerald-600 font-bold" />
        </div>

        <div className="finance-card-strong mb-8 overflow-hidden rounded-[2.5rem] p-6 md:p-8">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-600">Billetera</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Selecciona una tarjeta</h2>
            </div>
            <p className="text-sm font-semibold text-slate-500">El detalle cambia aquí, sin repetir la lista.</p>
          </div>

          {walletCards.length > 0 ? (
            <>
              <div className="mb-6 flex gap-3 overflow-x-auto pb-3">
                {walletCards.map((item) => {
                  const isSelected = selectedCardEvaluation?.card.id === item.card.id
                  const advisor = advisorResults.find((result) => result.cardId === item.card.id)

                  return (
                    <button
                      key={item.card.id}
                      type="button"
                      onClick={() => setSelectedCardId(item.card.id)}
                      aria-pressed={isSelected}
                      className={`min-w-52 rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 shadow-md ring-2 ring-indigo-100'
                          : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block truncate text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {item.card.bank || 'Tarjeta'}
                      </span>
                      <span className="mt-1 block truncate text-base font-black text-slate-950">{item.card.name}</span>
                      {advisor?.recommendation === 'best' && (
                        <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                          Mejor para comprar
                        </span>
                      )}
                      <span className="mt-3 block text-xs font-bold text-slate-500">Usado</span>
                      <span className="block text-lg font-black text-rose-600">
                        {formatMoney(Math.max(0, Number(item.card.current_balance || 0)))}
                      </span>
                    </button>
                  )
                })}
              </div>

              {selectedCardEvaluation && (() => {
                const { card, usagePercent, available, daysToCutoff, daysToPayment, recommendation, alerts } =
                  selectedCardEvaluation

                return (
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">{card.bank || 'Banco'}</p>
                        <h3 className="mt-1 text-3xl font-black text-slate-950">{card.name}</h3>
                        <p className={`mt-2 w-fit rounded-full border px-3 py-1 text-xs font-black ${recommendation.bg} ${recommendation.color}`}>
                          {recommendation.text}
                        </p>
                      </div>
                      {selectedAdvisorCard && (
                        <p className="max-w-md rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                          Mejor financiamiento para comprar hoy: {selectedAdvisorCard.financingDaysIfUsedToday} días.
                        </p>
                      )}
                    </div>

                    {alerts.length > 0 && (
                      <div className="mt-5 space-y-2">
                        {alerts.map((alert, index) => (
                          <AlertPill key={`${card.id}-${index}`} level={alert.level} text={alert.text} />
                        ))}
                      </div>
                    )}

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <MiniStat
                        label={Number(card.current_balance || 0) < 0 ? 'Saldo a favor' : 'Saldo usado'}
                        value={formatMoney(Math.abs(Number(card.current_balance || 0)))}
                        valueClassName={Number(card.current_balance || 0) < 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}
                      />
                      <MiniStat label="Disponible" value={formatMoney(available)} valueClassName="text-emerald-600 font-black" />
                      <MiniStat label="Línea total" value={formatMoney(Number(card.credit_limit || 0))} />
                      <MiniStat label="Uso" value={`${usagePercent.toFixed(1)}%`} />
                      <MiniStat label="Próximo corte" value={`Día ${card.statement_cutoff_day}`} subvalue={`${daysToCutoff} días`} />
                      <MiniStat label="Próximo pago" value={`Día ${card.payment_due_day}`} subvalue={`${daysToPayment} días`} />
                      <MiniStat label="Pago mínimo" value={formatMoney(Number(card.minimum_payment || 0))} />
                      <MiniStat label="No generar intereses" value={formatMoney(Number(card.no_interest_payment || 0))} valueClassName="text-indigo-700 font-black" />
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
                      <Link
                        href={`/movimientos/nuevo?type=credit_card_payment&creditCard=${encodeURIComponent(card.id)}`}
                        className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700"
                      >
                        Registrar pago
                      </Link>
                      <Link
                        href={`/tarjetas/${card.id}`}
                        className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        Ver movimientos y MSI
                      </Link>
                      <DeleteCardButton cardId={card.id} accountId={card.account_id} cardName={card.name} />
                    </div>
                  </div>
                )
              })()}
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">
              Agrega una tarjeta para empezar tu billetera.
            </div>
          )}
        </div>

      </section>
    </main>
  )
}
