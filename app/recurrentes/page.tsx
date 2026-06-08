'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatMoney, friendlyFrequency } from '@/lib/utils'
import { KpiCard } from '@/components/ui/KpiCard'
import {
  getPendingRecurringAmount,
  getPendingRecurringOccurrences,
  isRecurringChargeAutoPayable,
  isRecurringChargeDue,
  processRecurringCharges,
  type RecurringCharge,
} from '@/lib/recurring-charges'

type Account = {
  id: string
  name: string
}

type CreditCard = {
  id: string
  name: string
}

export default function RecurrentesPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [charges, setCharges] = useState<RecurringCharge[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])

  const initialize = async () => {
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData.session) {
      window.location.href = '/'
      return
    }

    const [
      { data: chargesData, error: chargesError },
      { data: accountsData, error: accountsError },
      { data: cardsData, error: cardsError },
    ] = await Promise.all([
      supabase
        .from('recurring_charges')
        .select('*')
        .eq('is_active', true)
        .order('next_charge_date', { ascending: true }),
      supabase.from('accounts').select('id, name').eq('is_active', true).order('name'),
      supabase.from('credit_cards').select('id, name').eq('is_active', true).order('name'),
    ])

    if (chargesError || accountsError || cardsError) {
      setMessage(
        chargesError?.message ||
        accountsError?.message ||
        cardsError?.message ||
        'No se pudo cargar la información'
      )
    }

    setCharges((chargesData as RecurringCharge[]) ?? [])
    setAccounts((accountsData as Account[]) ?? [])
    setCards((cardsData as CreditCard[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void initialize()
  }, [])

  const accountMap = useMemo(() => {
    const map = new Map<string, string>()
    accounts.forEach((a) => map.set(a.id, a.name))
    return map
  }, [accounts])

  const cardMap = useMemo(() => {
    const map = new Map<string, string>()
    cards.forEach((c) => map.set(c.id, c.name))
    return map
  }, [cards])

  const dueCharges = useMemo(
    () => charges.filter((charge) => isRecurringChargeDue(charge)),
    [charges]
  )

  const autoDueCharges = useMemo(
    () => dueCharges.filter((charge) => isRecurringChargeAutoPayable(charge)),
    [dueCharges]
  )

  const manualDueCharges = useMemo(
    () => dueCharges.filter((charge) => !isRecurringChargeAutoPayable(charge)),
    [dueCharges]
  )

  const pendingAmount = useMemo(
    () =>
      dueCharges.reduce(
        (acc, charge) => acc + (charge.affects_cash === false ? 0 : getPendingRecurringAmount(charge)),
        0
      ),
    [dueCharges]
  )

  const paymentMethodLabel = (charge: RecurringCharge) => {
    if (charge.payment_method_type === 'manual_choice') {
      return 'Por definir al pagar'
    }
    if (charge.payment_method_type === 'account') {
      return accountMap.get(charge.account_id || '') || 'Cuenta'
    }
    return cardMap.get(charge.credit_card_id || '') || 'Tarjeta'
  }

  const handleDelete = async (id: string, name: string) => {
    const ok = window.confirm(`¿Eliminar el cargo recurrente "${name}"?`)
    if (!ok) return

    const { error } = await supabase
      .from('recurring_charges')
      .delete()
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setCharges((prev) => prev.filter((item) => item.id !== id))
  }

  const handleProcess = async () => {
    if (autoDueCharges.length === 0) return

    setProcessing(true)
    setMessage('')

    try {
      const processed = await processRecurringCharges(supabase, autoDueCharges)
      setCharges((prev) => {
        const processedMap = new Map(processed.map((charge) => [charge.id, charge]))
        return prev.map((charge) => processedMap.get(charge.id) ?? charge)
      })
      setMessage('Cargos recurrentes procesados correctamente.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron procesar los recurrentes.')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Cargando cargos...</p>
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
                <span className="text-slate-200 font-medium">Recurrentes</span>
              </nav>
              <h1 className="text-5xl font-extrabold tracking-tight">Cargos Recurrentes</h1>
              <p className="text-slate-400 mt-3 text-lg max-w-2xl">
                Administra tus suscripciones y pagos automáticos para evitar sorpresas.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/recurrentes/nuevo"
                className="rounded-2xl bg-emerald-500 hover:bg-emerald-400 transition-all px-6 py-4 font-bold text-white shadow-lg active:scale-95"
              >
                Nuevo cargo
              </Link>

              <button
                type="button"
                onClick={handleProcess}
                disabled={processing || autoDueCharges.length === 0}
                className="rounded-2xl bg-violet-500 hover:bg-violet-600 transition-all px-6 py-4 font-bold text-white shadow-lg active:scale-95 disabled:opacity-50"
              >
                {processing ? 'Procesando...' : 'Procesar domiciliados'}
              </button>

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
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm animate-in fade-in slide-in-from-top-2">
            {message}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <KpiCard
            title="Cargos activos"
            value={String(charges.filter((c) => c.is_active).length)}
          />
          <KpiCard
            title="Pendiente del periodo"
            value={formatMoney(pendingAmount)}
            valueClassName="text-violet-600 font-bold"
          />
          <KpiCard
            title="Próximo vencimiento"
            value={charges.filter(c => c.next_charge_date)[0]?.next_charge_date ? new Date(charges.filter(c => c.next_charge_date)[0].next_charge_date!).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '---'}
            valueClassName="text-sky-600"
          />
        </div>

        {manualDueCharges.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 shadow-sm animate-in fade-in slide-in-from-top-2">
            Tienes {manualDueCharges.length} recurrente(s) vencido(s) con pago por definir. Liquídalos desde Pagar ahora.
          </div>
        )}

        <div className="rounded-[2.5rem] border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 bg-white">
            <h2 className="text-2xl font-bold text-slate-900">Listado de Suscripciones</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px]">
              <thead className="bg-slate-50/50">
                <tr className="text-left">
                  <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Nombre</th>
                  <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Monto</th>
                  <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Frecuencia</th>
                  <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Próximo cobro</th>
                  <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Método de pago</th>
                  <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Estado</th>
                  <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-widest"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {charges.map((charge) => (
                  <tr key={charge.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5">
                      <p className="font-extrabold text-slate-900">{charge.name}</p>
                      {charge.description && <p className="text-xs text-slate-400 mt-0.5">{charge.description}</p>}
                    </td>
                    <td className="px-8 py-5">
                      <p className="font-bold text-slate-900">{formatMoney(Number(charge.amount || 0))}</p>
                    </td>
                    <td className="px-8 py-5">
                      <span className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                        {friendlyFrequency(charge.frequency)}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-sm font-medium text-slate-700">
                        {charge.next_charge_date ? new Date(charge.next_charge_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '---'}
                      </p>
                      {getPendingRecurringOccurrences(charge).length > 0 ? (
                        <p className="text-xs font-bold text-violet-600 mt-1">
                          Pendientes: {getPendingRecurringOccurrences(charge).length}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-sm text-slate-600 font-medium">{paymentMethodLabel(charge)}</p>
                      {charge.affects_cash === false ? (
                        <p className="mt-1 text-xs font-bold text-sky-600 uppercase tracking-widest">Solo recordatorio</p>
                      ) : (
                        <p className="mt-1 text-xs font-bold text-emerald-600 uppercase tracking-widest">Afecta caja</p>
                      )}
                      {charge.payment_method_type === 'manual_choice' ? (
                        <p className="mt-1 text-xs font-bold text-amber-600 uppercase tracking-widest">Se elige al liquidar</p>
                      ) : null}
                    </td>
                    <td className="px-8 py-5">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black tracking-widest uppercase ${charge.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                        {charge.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex flex-wrap gap-2 justify-end">
                        {charge.affects_cash !== false && charge.payment_method_type === 'manual_choice' && isRecurringChargeDue(charge) ? (
                          <Link
                            href={`/recurrentes/${charge.id}/pagar`}
                            className="rounded-xl border-2 border-amber-100 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-500 hover:text-white transition-all active:scale-95"
                          >
                            PAGAR AHORA
                          </Link>
                        ) : null}
                        <Link
                          href={`/recurrentes/${charge.id}/editar`}
                          className="rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-900 hover:text-white transition-all active:scale-95"
                        >
                          EDITAR
                        </Link>
                        <button
                          onClick={() => handleDelete(charge.id, charge.name)}
                          className="rounded-xl border-2 border-rose-50 bg-white px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-600 hover:text-white transition-all active:scale-95"
                        >
                          BORRAR
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {charges.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-8 py-20 text-center">
                      <div className="text-slate-200 text-6xl mb-4">🔁</div>
                      <p className="text-slate-500 font-medium">No hay cargos recurrentes registrados.</p>
                      <Link href="/recurrentes/nuevo" className="text-emerald-500 font-bold hover:underline mt-2 inline-block">
                        Registrar el primero ahora
                      </Link>
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
