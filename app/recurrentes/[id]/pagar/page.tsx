'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {
  getPendingRecurringOccurrences,
  settleRecurringCharge,
  type RecurringCharge,
} from '@/lib/recurring-charges'

type Account = {
  id: string
  name: string
  account_type: string
}

type CreditCard = {
  id: string
  name: string
}

export default function PagarRecurrentePage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('')
  const [charge, setCharge] = useState<RecurringCharge | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [paymentMethodType, setPaymentMethodType] = useState<'account' | 'credit_card'>('credit_card')
  const [accountId, setAccountId] = useState('')
  const [creditCardId, setCreditCardId] = useState('')

  useEffect(() => {
    void initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const initialize = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      router.push('/')
      return
    }

    const [
      { data: chargeData, error: chargeError },
      { data: accountsData, error: accountsError },
      { data: cardsData, error: cardsError },
    ] = await Promise.all([
      supabase.from('recurring_charges').select('*').eq('id', id).single(),
      supabase
        .from('accounts')
        .select('id, name, account_type')
        .in('account_type', ['cash', 'debit', 'savings'])
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('credit_cards')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),
    ])

    if (chargeError || accountsError || cardsError || !chargeData) {
      setMessage(chargeError?.message || accountsError?.message || cardsError?.message || 'No se pudo cargar el recurrente.')
      setMessageType('error')
      setLoading(false)
      return
    }

    setCharge(chargeData as RecurringCharge)
    setAccounts((accountsData as Account[]) ?? [])
    setCards((cardsData as CreditCard[]) ?? [])
    setLoading(false)
  }

  const dueDates = useMemo(
    () => (charge ? getPendingRecurringOccurrences(charge) : []),
    [charge]
  )

  const fail = (text: string) => {
    setMessage(text)
    setMessageType('error')
    setSaving(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setMessageType('')

    if (!charge) {
      fail('No se encontró el recurrente.')
      return
    }

    if (dueDates.length === 0) {
      fail('Este recurrente todavía no vence.')
      return
    }

    if (paymentMethodType === 'account' && !accountId) {
      fail('Selecciona una cuenta.')
      return
    }

    if (paymentMethodType === 'credit_card' && !creditCardId) {
      fail('Selecciona una tarjeta.')
      return
    }

    try {
      await settleRecurringCharge(
        supabase,
        charge,
        paymentMethodType,
        paymentMethodType === 'account' ? accountId : creditCardId
      )

      setMessage('Recurrente liquidado correctamente.')
      setMessageType('success')
      setTimeout(() => {
        router.push('/recurrentes')
        router.refresh()
      }, 700)
    } catch (error) {
      fail(error instanceof Error ? error.message : 'No se pudo liquidar el recurrente.')
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Cargando recurrente...</p>
        </div>
      </main>
    )
  }

  if (!charge) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center shadow-lg">
          <p className="text-slate-900 font-bold">No se encontró el recurrente.</p>
          {message ? <p className="mt-3 text-sm text-rose-600">{message}</p> : null}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-12">
      <section className="bg-slate-950 text-white">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                <Link href="/" className="hover:text-white transition">Home</Link>
                <span>/</span>
                <Link href="/recurrentes" className="hover:text-white transition">Recurrentes</Link>
                <span>/</span>
                <span className="text-slate-200 font-medium">Pagar</span>
              </nav>
              <h1 className="text-5xl font-extrabold tracking-tight">Liquidar Recurrente</h1>
              <p className="text-slate-400 mt-3 text-lg">
                Elige en este momento si lo vas a pagar con cuenta o tarjeta.
              </p>
            </div>

            <Link
              href="/recurrentes"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition-all active:scale-95 shadow-lg"
            >
              Cerrar
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 -mt-8">
        <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl">
          <div className="mb-8 rounded-[2rem] border border-slate-100 bg-slate-50 p-6">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Recurrente vencido</p>
            <h2 className="mt-2 text-3xl font-black text-slate-900">{charge.name}</h2>
            <p className="mt-2 text-sm text-slate-500">
              Monto: <span className="font-bold text-slate-900">${Number(charge.amount || 0).toFixed(2)}</span>
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Fecha pendiente: <span className="font-bold text-slate-900">{dueDates[0] || '---'}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Field label="Pagar con">
              <select
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all appearance-none"
                value={paymentMethodType}
                onChange={(e) => setPaymentMethodType(e.target.value as 'account' | 'credit_card')}
              >
                <option value="credit_card">Tarjeta de crédito</option>
                <option value="account">Cuenta / efectivo</option>
              </select>
            </Field>

            {paymentMethodType === 'account' ? (
              <Field label="Selecciona la cuenta">
                <select
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all appearance-none"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Selecciona una cuenta</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Selecciona la tarjeta">
                <select
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all appearance-none"
                  value={creditCardId}
                  onChange={(e) => setCreditCardId(e.target.value)}
                >
                  <option value="">Selecciona una tarjeta</option>
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>{card.name}</option>
                  ))}
                </select>
              </Field>
            )}

            <div className="pt-4">
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-[2rem] bg-slate-900 py-6 text-xl font-black text-white hover:bg-slate-800 transition-all active:scale-[0.98] shadow-xl disabled:opacity-50"
              >
                {saving ? 'Liquidando...' : 'Registrar pago'}
              </button>

              {message && (
                <div className={`mt-6 rounded-2xl p-4 text-center text-sm font-bold ${messageType === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                  {message}
                </div>
              )}
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      {children}
    </div>
  )
}
