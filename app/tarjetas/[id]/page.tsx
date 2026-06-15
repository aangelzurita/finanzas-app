'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatMoney, formatDateTime, friendlyTransactionType } from '@/lib/utils'
import { KpiCard } from '@/components/ui/KpiCard'
import { MiniStat } from '@/components/ui/MiniStat'
import { reconcileCreditCard } from '@/lib/accounting/card-reconciliation'
import {
  getPendingInstallmentAmount,
  getPendingInstallmentCount,
  getInstallmentDisplayState,
  getOutstandingInstallmentCount,
  processInstallmentPlansForCard,
  syncInstallmentPlans,
  type CreditCardInstallment,
} from '@/lib/credit-card-installments'

type CreditCard = {
  id: string
  account_id: string
  name: string
  bank: string | null
  statement_cutoff_day: number
  payment_due_day: number
  credit_limit: number
  current_balance: number
  initial_balance: number
  mirror_current_balance: number
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
  related_installment_id: string | null
  source_account_id: string | null
  status: string
  affects_balance: boolean | null
}

type InstallmentPlan = CreditCardInstallment

export default function TarjetaDetallePage() {
  const supabase = createClient()
  const params = useParams()
  const cardId = params.id as string

  const [loading, setLoading] = useState(true)
  const [processingInstallments, setProcessingInstallments] = useState(false)
  const [message, setMessage] = useState('')
  const [card, setCard] = useState<CreditCard | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [installments, setInstallments] = useState<InstallmentPlan[]>([])

  useEffect(() => {
    void initialize()
  }, [cardId])

  const initialize = async () => {
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData.session) {
      window.location.href = '/'
      return
    }

    const [
      { data: cardData, error: cardError },
      { data: txData, error: txError },
      { data: installmentData, error: installmentError },
    ] =
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
            related_installment_id,
            source_account_id,
            status,
            affects_balance
          `)
          .eq('related_credit_card_id', cardId)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('credit_card_installments')
          .select('*')
          .eq('credit_card_id', cardId)
          .order('charge_day', { ascending: true }),
      ])

    if (cardError || txError || installmentError) {
      setMessage(cardError?.message || txError?.message || installmentError?.message || 'Error al cargar la tarjeta')
    }

    let initialBalance = 0
    let mirrorCurrentBalance = Number(cardData?.current_balance || 0)
    if (cardData?.account_id) {
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('initial_balance, current_balance')
        .eq('id', cardData.account_id)
        .single()

      if (accountError) {
        setMessage(accountError.message)
      } else {
        initialBalance = Number(accountData?.initial_balance || 0)
        mirrorCurrentBalance = Number(accountData?.current_balance ?? cardData.current_balance ?? 0)
      }
    }

    const syncedInstallments = await syncInstallmentPlans(
      supabase,
      ((installmentData as InstallmentPlan[]) ?? []),
    ).catch(() => ((installmentData as InstallmentPlan[]) ?? []))

    setCard(cardData ? ({
      ...(cardData as Omit<CreditCard, 'initial_balance' | 'mirror_current_balance'>),
      initial_balance: initialBalance,
      mirror_current_balance: mirrorCurrentBalance,
    }) : null)
    setTransactions((txData as Transaction[]) ?? [])
    setInstallments(syncedInstallments)
    setLoading(false)
  }

  const usagePercent = useMemo(() => {
    if (!card?.credit_limit || card.credit_limit <= 0) return 0
    return (Math.max(0, Number(card.current_balance || 0)) / Number(card.credit_limit || 0)) * 100
  }, [card])

  const available = useMemo(() => {
    if (!card) return 0
    return Number(card.credit_limit || 0) - Math.max(0, Number(card.current_balance || 0))
  }, [card])

  const currentBalanceValue = useMemo(() => Number(card?.current_balance || 0), [card])
  const hasCreditBalance = currentBalanceValue < 0
  const balanceTitle = hasCreditBalance ? 'Saldo a favor' : 'Saldo usado'
  const balanceValueClassName = hasCreditBalance ? 'text-emerald-600' : 'text-rose-600'

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

  const reconciliation = useMemo(() => {
    if (!card) return null

    return reconcileCreditCard({
      currentBalance: Number(card.current_balance || 0),
      initialBalance: Number(card.initial_balance || 0),
      transactions,
      installments,
    })
  }, [card, transactions, installments])

  const internalBalanceDifference = useMemo(() => {
    if (!card) return 0
    return Number((Number(card.current_balance || 0) - Number(card.mirror_current_balance || 0)).toFixed(2))
  }, [card])

  const hasInternalBalanceMismatch = Math.abs(internalBalanceDifference) > 0.01

  const activeInstallments = useMemo(
    () => installments.filter((plan) => plan.status === 'active' && getOutstandingInstallmentCount(plan) > 0),
    [installments]
  )

  const processableInstallments = useMemo(
    () => activeInstallments.filter((plan) => !plan.purchase_transaction_id),
    [activeInstallments]
  )

  const monthInstallmentProjection = useMemo(() => {
    return activeInstallments
      .reduce((acc, plan) => acc + getPendingInstallmentAmount(plan), 0)
  }, [activeInstallments])

  const pendingInstallmentCharges = useMemo(() => {
    return processableInstallments.reduce((acc, plan) => acc + getPendingInstallmentCount(plan), 0)
  }, [processableInstallments])

  const handleProcessInstallments = async () => {
    if (!card || pendingInstallmentCharges === 0) return

    setProcessingInstallments(true)
    setMessage('')

    try {
      await processInstallmentPlansForCard(supabase, processableInstallments, card.account_id)
      setMessage('MSI procesados correctamente. Ya se generaron los cargos reales pendientes.')
      await initialize()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron procesar los MSI.')
    } finally {
      setProcessingInstallments(false)
    }
  }

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
                href={`/tarjetas/${card.id}/movimiento?type=credit_card_refund`}
                className="rounded-2xl bg-amber-500 hover:bg-amber-600 transition-all px-6 py-4 font-bold text-white shadow-lg active:scale-95"
              >
                Registrar reembolso
              </Link>

              <button
                type="button"
                onClick={handleProcessInstallments}
                disabled={processingInstallments || pendingInstallmentCharges === 0}
                className="rounded-2xl bg-violet-500 hover:bg-violet-600 transition-all px-6 py-4 font-bold text-white shadow-lg active:scale-95 disabled:opacity-50 disabled:hover:bg-violet-500"
              >
                {processingInstallments ? 'Procesando MSI...' : 'Procesar MSI'}
              </button>

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
          <KpiCard title={balanceTitle} value={formatMoney(Math.abs(currentBalanceValue))} valueClassName={balanceValueClassName} />
          <KpiCard title="Disponible" value={formatMoney(available)} valueClassName="text-emerald-600" />
          <KpiCard title="% de uso" value={`${usagePercent.toFixed(1)}%`} valueClassName={usagePercent > 80 ? 'text-rose-600' : 'text-slate-900'} />
        </div>

        {reconciliation && (
          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-lg mb-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-black text-slate-900">Conciliación de tarjeta</h2>
                  <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${
                    reconciliation.status === 'OK' && !hasInternalBalanceMismatch
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : 'bg-amber-50 text-amber-700 border border-amber-100'
                  }`}>
                    {hasInternalBalanceMismatch ? 'REVISAR' : reconciliation.status}
                  </span>
                </div>
                <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
                  Esta conciliación compara el saldo guardado de la tarjeta, la cuenta espejo y los movimientos registrados. Es una estimación y puede variar si existen ajustes históricos o movimientos no registrados.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <MiniStat label="Saldo histórico inicial" value={formatMoney(reconciliation.initialBalance)} />
              <MiniStat label="Movimientos registrados" value={formatMoney(reconciliation.movementNet)} />
              <MiniStat label="Saldo tarjeta" value={formatMoney(reconciliation.registeredBalance)} />
              <MiniStat label="Saldo esperado" value={formatMoney(reconciliation.expectedBalance)} />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <MiniStat
                label="Diferencia"
                value={formatMoney(reconciliation.difference)}
                valueClassName={reconciliation.status === 'OK' && !hasInternalBalanceMismatch ? 'text-emerald-600 font-black' : 'text-amber-600 font-black'}
              />
              <MiniStat label="Cuenta espejo" value={formatMoney(Number(card.mirror_current_balance || 0))} />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <MiniStat
                label="Diferencia interna tarjeta/espejo"
                value={formatMoney(internalBalanceDifference)}
                valueClassName={hasInternalBalanceMismatch ? 'text-amber-600 font-black' : 'text-emerald-600 font-black'}
              />
              <MiniStat label="Sin impacto" value={String(reconciliation.excludedTransactions)} />
            </div>

            {hasInternalBalanceMismatch && (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                El saldo de la tarjeta y su cuenta espejo no coinciden. Recalcula la tarjeta o edita el saldo real desde la tarjeta para sincronizarlos.
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600">
                Compras normales: <span className="text-slate-900">{formatMoney(reconciliation.normalPurchases)}</span>
              </div>
              <div className="rounded-2xl bg-sky-50 p-3 text-sm font-bold text-sky-700">
                Compras MSI: <span>{formatMoney(reconciliation.msiPurchases)}</span>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
                Pagos: <span>{formatMoney(reconciliation.payments)}</span>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-700">
                Reembolsos: <span>{formatMoney(reconciliation.refunds)}</span>
              </div>
            </div>
          </div>
        )}

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

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <KpiCard title="Total Compras" value={formatMoney(totalPurchases)} valueClassName="text-slate-700" />
          <KpiCard title="Total Pagos" value={formatMoney(totalPayments)} valueClassName="text-emerald-600" />
          <KpiCard title="MSI pendientes" value={formatMoney(monthInstallmentProjection)} valueClassName="text-sky-600" />
        </div>

        <div className="rounded-[2.5rem] border border-slate-100 bg-white shadow-xl overflow-hidden mb-8">
          <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-white">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Meses Sin Intereses</h2>
              <p className="text-sm text-slate-400 mt-1">Seguimiento de compras diferidas ligadas a esta tarjeta.</p>
              <p className="mt-2 text-xs font-bold text-sky-700">
                El saldo usado refleja el total de la compra; el presupuesto mensual considera la mensualidad.
              </p>
            </div>

            <Link
              href={`/tarjetas/${card.id}/msi/nuevo`}
              className="rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white hover:bg-black transition"
            >
              Nuevo MSI
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {installments.length === 0 ? (
              <div className="px-8 py-14 text-center text-slate-400 font-medium italic">
                No hay compras MSI asociadas a esta tarjeta.
              </div>
            ) : (
              installments.map((plan) => {
                const displayState = getInstallmentDisplayState(plan)

                return (
                  <div key={plan.id} className="px-8 py-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-extrabold text-slate-900">
                        {plan.description} — {formatMoney(Number(plan.monthly_amount || 0))} (Próxima {displayState.currentInstallmentNumber}/{plan.total_months})
                      </p>
                      <p className="text-sm text-slate-500 mt-1">
                        Después de esta quedan {displayState.remainingInstallments} mensualidades · Día {plan.charge_day}
                      </p>
                      {plan.purchase_transaction_id ? (
                        <p className="text-xs text-emerald-600 font-bold mt-1">
                          Creado desde compra · sin procesamiento manual
                        </p>
                      ) : getPendingInstallmentCount(plan) > 0 ? (
                        <p className="text-xs text-violet-600 font-bold mt-1">
                          Pendientes por procesar: {getPendingInstallmentCount(plan)}
                        </p>
                      ) : null}
                      {plan.notes ? <p className="text-xs text-slate-400 mt-1">{plan.notes}</p> : null}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold border ${
                        plan.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : plan.status === 'completed'
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {plan.status === 'active' ? 'Activo' : plan.status === 'completed' ? 'Completado' : 'Cancelado'}
                      </span>

                      <Link
                        href={`/tarjetas/${card.id}/msi/${plan.id}/editar`}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
                      >
                        Editar
                      </Link>
                    </div>
                  </div>
                )
              })
            )}
          </div>
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

                    <td className={`px-8 py-5 text-sm font-black whitespace-nowrap ${tx.transaction_type === 'credit_card_payment' || tx.transaction_type === 'credit_card_refund' ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {tx.transaction_type === 'credit_card_payment' || tx.transaction_type === 'credit_card_refund' ? '+ ' : '- '}
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
