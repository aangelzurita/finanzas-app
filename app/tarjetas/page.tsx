'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatMoney, daysUntilDayOfMonth } from '@/lib/utils'
import { syncCardReminders } from '@/lib/card-reminders'
import { KpiCard } from '@/components/ui/KpiCard'
import { MiniStat } from '@/components/ui/MiniStat'
import { AlertRow, AlertPill } from '@/components/ui/Alerts'
import { DeleteCardButton } from '@/components/cards/DeleteCardButton'

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

export default function TarjetasPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<CreditCard[]>([])
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info')
  const [syncingReminders, setSyncingReminders] = useState(false)

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
    } catch (error: any) {
      setMessage(error?.message || 'No se pudieron sincronizar los recordatorios.')
      setMessageType('error')
    } finally {
      setSyncingReminders(false)
    }
  }

  const today = new Date()

  const getRecommendation = (cutoffDay: number) => {
    const todayDay = today.getDate()
    const diff = cutoffDay - todayDay

    if (diff >= 7) {
      return {
        text: 'Buen momento para comprar',
        color: 'text-emerald-600',
        bg: 'bg-emerald-50 border-emerald-200',
      }
    }

    if (diff >= 1 && diff < 7) {
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

  const getUsageColor = (percent: number) => {
    if (percent < 30) return 'bg-emerald-500'
    if (percent < 70) return 'bg-amber-500'
    return 'bg-rose-500'
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

      const daysToCutoff = daysUntilDayOfMonth(card.statement_cutoff_day)
      const daysToPayment = daysUntilDayOfMonth(card.payment_due_day)
      const recommendation = getRecommendation(card.statement_cutoff_day)
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
  }, [cards])

  const bestCard = useMemo(() => {
    if (evaluatedCards.length === 0) return null
    return [...evaluatedCards].sort((a, b) => b.score - a.score)[0]
  }, [evaluatedCards])

  const allAlerts = useMemo(() => {
    return evaluatedCards.flatMap((item) =>
      item.alerts.map((alert) => ({
        cardName: item.card.name,
        ...alert,
      }))
    )
  }, [evaluatedCards])

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
    <main className="min-h-screen bg-slate-100 pb-12">
      <section className="bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <KpiCard title="Línea total" value={formatMoney(summary.totalLimit)} valueClassName="text-slate-900" />
          <KpiCard title="Saldo usado" value={formatMoney(summary.totalUsed)} valueClassName="text-rose-600" />
          <KpiCard title="Disponible" value={formatMoney(summary.totalAvailable)} valueClassName="text-emerald-600 font-bold" />
        </div>

        {bestCard && (
          <div className="mb-8 rounded-[2.5rem] border border-emerald-100 bg-white p-8 shadow-xl shadow-emerald-900/5 transition-all hover:shadow-emerald-900/10">
            <p className="text-sm font-bold text-emerald-600 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-2 h-4 bg-emerald-500 rounded-full" />
              Recomendación inteligente
            </p>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">
                  Usa <span className="text-emerald-500">{bestCard.card.name}</span>
                </h2>
                <p className="text-slate-500 text-lg mt-1 font-medium italic">
                  Emitida por: {bestCard.card.bank || 'Institución financiera'}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {bestCard.reasons.map((reason, index) => (
                    <span
                      key={index}
                      className="rounded-full bg-slate-50 border border-slate-100 px-4 py-1.5 text-sm font-bold text-slate-600"
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 min-w-[340px]">
                <MiniStat label="Días al corte" value={`${bestCard.daysToCutoff} días`} />
                <MiniStat label="% de uso" value={`${bestCard.usagePercent.toFixed(1)}%`} />
                <MiniStat label="Disponible" value={formatMoney(bestCard.available)} valueClassName="text-emerald-600 font-black" />
                <MiniStat label="Score" value={`${bestCard.score}`} valueClassName="text-slate-900 font-black" />
              </div>
            </div>
          </div>
        )}

        {allAlerts.length > 0 && (
          <div className="mb-8 rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <span className="w-2 h-8 bg-rose-500 rounded-full" />
              Alertas del mes
            </h2>

            <div className="space-y-4">
              {allAlerts.map((alert, index) => (
                <AlertRow
                  key={`${alert.cardName}-${alert.text}-${index}`}
                  cardName={alert.cardName}
                  text={alert.text}
                  level={alert.level}
                />
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          {evaluatedCards.map((item) => {
            const { card, usagePercent, available, daysToCutoff, daysToPayment, recommendation, alerts } = item

            return (
              <div
                key={card.id}
                className="rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-lg hover:shadow-2xl transition-all group underline-offset-4 overflow-hidden relative"
              >
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{card.bank || 'Banco'}</p>
                    <Link
                      href={`/tarjetas/${card.id}`}
                      className="text-3xl font-black text-slate-900 group-hover:text-slate-700 decoration-slate-300 transition-colors"
                    >
                      {card.name}
                    </Link>
                  </div>

                  <div className={`rounded-2xl border px-4 py-2 text-sm font-black shadow-sm ${recommendation.bg} ${recommendation.color}`}>
                    {recommendation.text}
                  </div>
                </div>

                {alerts.length > 0 && (
                  <div className="mb-6 space-y-2">
                    {alerts.map((alert, index) => (
                      <AlertPill key={index} level={alert.level} text={alert.text} />
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <MiniStat
                    label={Number(card.current_balance || 0) < 0 ? 'Saldo a favor' : 'Saldo usado'}
                    value={formatMoney(Math.abs(Number(card.current_balance || 0)))}
                    valueClassName={Number(card.current_balance || 0) < 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}
                  />
                  <MiniStat label="Disponible" value={formatMoney(available)} valueClassName="text-emerald-600 font-black" />
                  <MiniStat label="Línea total" value={formatMoney(Number(card.credit_limit || 0))} />
                  <MiniStat label="% de uso" value={`${usagePercent.toFixed(1)}%`} />
                </div>

                <div className="mb-8 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">Utilización</p>
                    <p className={`text-sm font-black ${usagePercent > 80 ? 'text-rose-600' : 'text-slate-700'}`}>
                      {usagePercent.toFixed(1)}%
                    </p>
                  </div>

                  <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-50">
                    <div
                      className={`h-full transition-all duration-1000 ease-out border-r border-white/20 ${getUsageColor(usagePercent)}`}
                      style={{ width: `${Math.min(usagePercent, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <MiniStat
                    label="Fecha de Corte"
                    value={`Día ${card.statement_cutoff_day}`}
                    subvalue={`Faltan ${daysToCutoff} días`}
                  />

                  <MiniStat
                    label="Límite de Pago"
                    value={`Día ${card.payment_due_day}`}
                    subvalue={`Faltan ${daysToPayment} días`}
                  />

                  <MiniStat
                    label="Pago mínimo"
                    value={formatMoney(Number(card.minimum_payment || 0))}
                  />

                  <MiniStat
                    label="No genera intereses"
                    value={formatMoney(Number(card.no_interest_payment || 0))}
                    valueClassName="text-emerald-600 font-black"
                  />
                </div>

                <div className="flex gap-4 pt-6 border-t border-slate-50 mt-auto">
                  <Link
                    href={`/tarjetas/${card.id}/editar`}
                    className="flex-1 text-center rounded-2xl border-2 border-slate-100 bg-white px-4 py-4 font-black text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all active:scale-[0.98] shadow-sm"
                  >
                    Detalles
                  </Link>

                  <DeleteCardButton
                    cardId={card.id}
                    accountId={card.account_id}
                    cardName={card.name}
                  />
                </div>
              </div>
            )
          })}

          {cards.length === 0 && (
            <div className="rounded-[2.5rem] border-2 border-dashed border-slate-200 bg-white p-20 text-center lg:col-span-2 shadow-inner">
              <div className="text-slate-200 text-8xl mb-6 text-center">🏦</div>
              <h3 className="text-3xl font-black text-slate-900 mb-3">Ordena tus finanzas</h3>
              <p className="text-slate-500 mb-10 text-lg max-w-sm mx-auto font-medium">
                Sincroniza tus tarjetas para obtener recomendaciones basadas en tus fechas de corte.
              </p>
              <Link
                href="/tarjetas/nueva"
                className="rounded-2xl bg-emerald-500 px-10 py-5 font-black text-white shadow-xl shadow-emerald-200 hover:bg-emerald-600 transition-all active:scale-95 inline-block"
              >
                Agregar mi primera tarjeta
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
