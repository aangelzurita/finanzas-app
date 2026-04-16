'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatMoney, formatDateTime, friendlyTransactionType } from '@/lib/utils'
import { KpiCard } from '@/components/ui/KpiCard'
import { MiniStat } from '@/components/ui/MiniStat'

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

type Transaction = {
  id: string
  transaction_type: string
  amount: number
  description: string | null
  transaction_date: string
  related_credit_card_id: string | null
  source_account_id: string | null
  status: string
}

export default function TarjetaDetallePage() {
  const supabase = createClient()
  const params = useParams()
  const cardId = params.id as string

  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [card, setCard] = useState<CreditCard | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    void initialize()
  }, [cardId])

  const initialize = async () => {
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData.session) {
      window.location.href = '/'
      return
    }

    const [{ data: cardData, error: cardError }, { data: txData, error: txError }] =
      await Promise.all([
        supabase
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
          .eq('id', cardId)
          .single(),
        supabase
          .from('transactions')
          .select(`
            id,
            transaction_type,
            amount,
            description,
            transaction_date,
            related_credit_card_id,
            source_account_id,
            status
          `)
          .eq('related_credit_card_id', cardId)
          .order('transaction_date', { ascending: false }),
      ])

    if (cardError || txError) {
      setMessage(cardError?.message || txError?.message || 'Error al cargar la tarjeta')
    }

    setCard((cardData as CreditCard) ?? null)
    setTransactions((txData as Transaction[]) ?? [])
    setLoading(false)
  }

  const usagePercent = useMemo(() => {
    if (!card?.credit_limit || card.credit_limit <= 0) return 0
    return (Number(card.current_balance || 0) / Number(card.credit_limit || 0)) * 100
  }, [card])

  const available = useMemo(() => {
    if (!card) return 0
    return Number(card.credit_limit || 0) - Number(card.current_balance || 0)
  }, [card])

  const totalPurchases = useMemo(() => {
    return transactions
      .filter((tx) => tx.transaction_type === 'credit_card_purchase')
      .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)
  }, [transactions])

  const totalPayments = useMemo(() => {
    return transactions
      .filter((tx) => tx.transaction_type === 'credit_card_payment')
      .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)
  }, [transactions])

  const usageColor = () => {
    if (usagePercent < 30) return 'bg-emerald-500'
    if (usagePercent < 70) return 'bg-amber-500'
    return 'bg-rose-500'
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Cargando tarjeta...</p>
        </div>
      </main>
    )
  }

  if (!card) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-12 shadow-xl max-w-lg w-full text-center">
          <div className="text-6xl mb-6">🔍</div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Tarjeta no encontrada</h1>
          <p className="text-slate-500 mb-8">{message || 'No se pudo encontrar la tarjeta solicitada.'}</p>
          <Link
            href="/tarjetas"
            className="rounded-2xl bg-slate-900 px-8 py-4 font-bold text-white shadow-lg hover:bg-black transition active:scale-95 inline-block"
          >
            Volver a tarjetas
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <section className="bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                <Link href="/" className="hover:text-white transition">Home</Link>
                <span>/</span>
                <Link href="/tarjetas" className="hover:text-white transition">Tarjetas</Link>
                <span>/</span>
                <span className="text-slate-200 truncate max-w-[150px] md:max-w-none">{card.name}</span>
              </nav>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">{card.bank || 'Institución'}</p>
              <h1 className="text-5xl font-extrabold tracking-tight">{card.name}</h1>
              <p className="text-slate-400 mt-3 text-lg">
                Detalle completo e historial de movimientos.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/tarjetas/${card.id}/movimiento?type=credit_card_purchase`}
                className="rounded-2xl bg-emerald-500 hover:bg-emerald-600 transition-all px-6 py-4 font-bold text-white shadow-lg active:scale-95"
              >
                Registrar compra
              </Link>

              <Link
                href={`/tarjetas/${card.id}/movimiento?type=credit_card_payment`}
                className="rounded-2xl bg-sky-500 hover:bg-sky-600 transition-all px-6 py-4 font-bold text-white shadow-lg active:scale-95"
              >
                Registrar pago
              </Link>

              <Link
                href={`/tarjetas/${card.id}/editar`}
                className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition shadow-lg active:scale-95"
              >
                Editar
              </Link>

              <Link
                href="/tarjetas"
                className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition shadow-lg active:scale-95"
              >
                Cerrar
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 -mt-8 pb-12">
        {message && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
            {message}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <KpiCard title="Línea total" value={formatMoney(Number(card.credit_limit || 0))} valueClassName="text-slate-900" />
          <KpiCard title="Saldo usado" value={formatMoney(Number(card.current_balance || 0))} valueClassName="text-rose-600" />
          <KpiCard title="Disponible" value={formatMoney(available)} valueClassName="text-emerald-600" />
          <KpiCard title="% de uso" value={`${usagePercent.toFixed(1)}%`} valueClassName={usagePercent > 80 ? 'text-rose-600' : 'text-slate-900'} />
        </div>

        <div className="rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-lg mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <span className="w-2 h-6 bg-slate-900 rounded-full" />
            Configuración y Límites
          </h2>

          <div className="mb-8">
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">Progreso de uso</p>
              <p className={`text-sm font-bold ${usagePercent > 80 ? 'text-rose-600' : 'text-slate-700'}`}>
                {usagePercent.toFixed(1)}%
              </p>
            </div>

            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-50">
              <div
                className={`h-full transition-all duration-1000 ease-out border-r border-white/20 ${usageColor()}`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <MiniStat label="Día de corte" value={`Día ${card.statement_cutoff_day}`} />
            <MiniStat label="Día límite pago" value={`Día ${card.payment_due_day}`} />
            <MiniStat label="Pago mínimo" value={formatMoney(Number(card.minimum_payment || 0))} />
            <MiniStat label="Para no generar intereses" value={formatMoney(Number(card.no_interest_payment || 0))} valueClassName="text-emerald-600 font-bold" />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <KpiCard title="Total Compras" value={formatMoney(totalPurchases)} valueClassName="text-slate-700" />
          <KpiCard title="Total Pagos" value={formatMoney(totalPayments)} valueClassName="text-emerald-600" />
        </div>

        <div className="rounded-[2.5rem] border border-slate-100 bg-white shadow-xl overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-white">
            <h2 className="text-2xl font-extrabold text-slate-900">Historial de movimientos</h2>
            <span className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-bold text-slate-600">
              {transactions.length} registros
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead className="bg-slate-50/50">
                <tr className="text-left">
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Descripción</th>
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Tipo</th>
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Monto</th>
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Estatus</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-8 py-5 text-sm text-slate-500 font-medium whitespace-nowrap">
                      {formatDateTime(tx.transaction_date)}
                    </td>

                    <td className="px-8 py-5 text-sm text-slate-900 font-bold">
                      {tx.description || 'Sin descripción'}
                    </td>

                    <td className="px-8 py-5 text-sm font-medium text-slate-600">
                      {friendlyTransactionType(tx.transaction_type)}
                    </td>

                    <td className={`px-8 py-5 text-sm font-black whitespace-nowrap ${tx.transaction_type === 'credit_card_payment' ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {tx.transaction_type === 'credit_card_payment' ? '+ ' : '- '}
                      {formatMoney(Number(tx.amount || 0))}
                    </td>

                    <td className="px-8 py-5 text-sm">
                      <span className={`inline-flex rounded-full px-3 py-1 font-bold text-[10px] uppercase tracking-wider ${tx.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-500'
                        }`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}

                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="text-4xl mb-3 opacity-20">🧾</div>
                      <p className="text-slate-400 font-medium italic">No hay movimientos asociados a esta tarjeta.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}
