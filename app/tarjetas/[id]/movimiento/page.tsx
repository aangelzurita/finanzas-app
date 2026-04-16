'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {
  applyTransactionMetadata,
  prepareTransactionForPersistence,
  type TransactionLedgerEntry,
} from '@/lib/accounting/transactions'

type CreditCard = {
  id: string
  account_id: string
  name: string
  bank: string | null
}

type Category = {
  id: string
  name: string
  category_type: 'income' | 'expense'
}

type Account = {
  id: string
  name: string
  account_type: string
}

type MovementType = 'credit_card_purchase' | 'credit_card_payment'

export default function TarjetaMovimientoPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()

  const cardId = params.id as string
  const initialType = (searchParams.get('type') || 'credit_card_purchase') as MovementType

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('')

  const [card, setCard] = useState<CreditCard | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])

  const [movementType, setMovementType] = useState<MovementType>(initialType)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [transactionDate, setTransactionDate] = useState('')
  const [sourceAccountId, setSourceAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  async function initialize() {
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData.session) {
      router.push('/')
      return
    }

    const [
      { data: cardData, error: cardError },
      { data: categoriesData, error: categoriesError },
      { data: accountsData, error: accountsError },
    ] = await Promise.all([
      supabase
        .from('credit_cards')
        .select('id, account_id, name, bank')
        .eq('id', cardId)
        .single(),
      supabase
        .from('categories')
        .select('id, name, category_type')
        .eq('category_type', 'expense')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('accounts')
        .select('id, name, account_type')
        .in('account_type', ['cash', 'debit', 'savings'])
        .eq('is_active', true)
        .order('name'),
    ])

    if (cardError || categoriesError || accountsError || !cardData) {
      setMessage(
        cardError?.message ||
        categoriesError?.message ||
        accountsError?.message ||
        'No se pudo cargar la información'
      )
      setMessageType('error')
      setLoading(false)
      return
    }

    setCard(cardData as CreditCard)
    setCategories((categoriesData as Category[]) ?? [])
    setAccounts((accountsData as Account[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    setTransactionDate(local.toISOString().slice(0, 16))
    void initialize()
  }, [cardId])

  const fail = (text: string) => {
    setMessage(text)
    setMessageType('error')
    setSaving(false)
  }

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.category_type === 'expense'),
    [categories]
  )

  const validate = () => {
    if (!amount || Number(amount) <= 0) {
      fail('Ingresa un monto válido.')
      return false
    }

    if (!transactionDate) {
      fail('Selecciona fecha y hora.')
      return false
    }

    if (movementType === 'credit_card_purchase') {
      if (!categoryId) {
        fail('Selecciona una categoría.')
        return false
      }
    }

    if (movementType === 'credit_card_payment') {
      if (!sourceAccountId) {
        fail('Selecciona la cuenta desde la que pagas.')
        return false
      }
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setMessageType('')

    if (!validate()) return

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user?.id

    if (!userId || !card) {
      fail('No hay sesión activa o tarjeta válida.')
      return
    }

    const preparedTx = await prepareTransactionForPersistence(supabase, {
      transaction_type: movementType,
      amount: Number(amount),
      source_account_id: movementType === 'credit_card_payment' ? sourceAccountId : card.account_id,
      destination_account_id: null,
      related_credit_card_id: card.id,
      related_debt_id: null,
    })

    const payload: Record<string, unknown> = {
      user_id: userId,
      transaction_type: movementType,
      amount: preparedTx.amount,
      transaction_date: new Date(transactionDate).toISOString(),
      description: description || null,
      related_credit_card_id: card.id,
      status: 'completed',
      affects_budget: movementType === 'credit_card_purchase',
      source_account_id: null,
      destination_account_id: null,
      category_id: null,
      related_debt_id: null,
    }

    if (movementType === 'credit_card_purchase') {
      payload.source_account_id = card.account_id
      payload.category_id = categoryId
    }

    if (movementType === 'credit_card_payment') {
      payload.source_account_id = sourceAccountId
      payload.applied_to_minimum_payment = preparedTx.applied_to_minimum_payment ?? 0
      payload.applied_to_no_interest_payment = preparedTx.applied_to_no_interest_payment ?? 0
    }

    const { data: insertedTx, error } = await supabase
      .from('transactions')
      .insert(payload)
      .select('id, transaction_type, amount, source_account_id, destination_account_id, related_credit_card_id, related_debt_id, applied_to_minimum_payment, applied_to_no_interest_payment')
      .single()

    if (error || !insertedTx) {
      fail(`Error: ${error?.message || 'No se pudo guardar el movimiento.'}`)
      return
    }

    try {
      await applyTransactionMetadata(supabase, insertedTx as TransactionLedgerEntry)
    } catch (impactError) {
      await supabase.from('transactions').delete().eq('id', insertedTx.id)
      fail(impactError instanceof Error ? impactError.message : 'No se pudo aplicar el movimiento.')
      return
    }

    setMessage(
      movementType === 'credit_card_purchase'
        ? 'Compra registrada correctamente.'
        : 'Pago registrado correctamente.'
    )
    setMessageType('success')

    setTimeout(() => {
      router.push(`/tarjetas/${card.id}`)
      router.refresh()
    }, 700)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Cargando formulario...</p>
        </div>
      </main>
    )
  }

  if (!card) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6 text-center">
        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-12 shadow-xl max-w-lg">
          <div className="text-6xl mb-6">🚫</div>
          <p className="text-slate-900 text-xl font-bold mb-4">No se encontró la tarjeta.</p>
          <Link href="/tarjetas" className="rounded-2xl bg-slate-900 px-6 py-3 font-bold text-white shadow-lg">
            Volver
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <section className="bg-slate-950 text-white">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                <Link href="/" className="hover:text-white transition">Home</Link>
                <span>/</span>
                <Link href="/tarjetas" className="hover:text-white transition">Tarjetas</Link>
                <span>/</span>
                <Link href={`/tarjetas/${card.id}`} className="hover:text-white transition">{card.name}</Link>
              </nav>
              <h1 className="text-4xl font-bold tracking-tight">
                {movementType === 'credit_card_purchase' ? 'Registrar compra' : 'Registrar pago'}
              </h1>
              <p className="text-slate-400 mt-2 text-lg">
                Movimiento para <span className="text-white font-bold">{card.name}</span>
              </p>
            </div>

            <Link
              href={`/tarjetas/${card.id}`}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition shadow-lg active:scale-95"
            >
              Cancelar
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 -mt-8 pb-12">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100"
        >
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Datos del Movimiento</h2>
            <p className="text-slate-500 mt-1">Ingresa el detalle del cargo o abono realizado.</p>
          </div>

          <div className="space-y-6">
            <div className="grid gap-5 md:grid-cols-2">
              <FormField label="Tipo de movimiento">
                <select
                  className="form-input"
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as MovementType)}
                >
                  <option value="credit_card_purchase">Compra con TDC</option>
                  <option value="credit_card_payment">Pago de TDC</option>
                </select>
              </FormField>

              <FormField label="Monto">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                  <input
                    type="number"
                    step="0.01"
                    className={`form-input pl-8 font-mono ${movementType === 'credit_card_payment' ? 'text-emerald-600 font-bold' : 'text-slate-900 font-bold'}`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </FormField>
            </div>

            <FormField label="Fecha y hora">
              <input
                type="datetime-local"
                className="form-input font-mono"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
              />
            </FormField>

            {movementType === 'credit_card_purchase' && (
              <FormField label="Categoría" helper="Ayuda a clasificar tus gastos">
                <select
                  className="form-input"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Selecciona una categoría</option>
                  {expenseCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            {movementType === 'credit_card_payment' && (
              <FormField label="Cuenta de origen" helper="¿Desde dónde salió el dinero para el pago?">
                <select
                  className="form-input"
                  value={sourceAccountId}
                  onChange={(e) => setSourceAccountId(e.target.value)}
                >
                  <option value="">Selecciona una cuenta</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.account_type})
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <FormField label="Descripción">
              <input
                type="text"
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej. Súper, Gasolina, Pago mensual..."
              />
            </FormField>
          </div>

          <div className="mt-12 flex flex-col gap-4">
            <button
              type="submit"
              disabled={saving}
              className={`w-full rounded-2xl py-4 font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 ${movementType === 'credit_card_payment' ? 'bg-sky-600 hover:bg-sky-700 text-white' : 'bg-slate-900 hover:bg-black text-white'
                }`}
            >
              {saving ? 'Guardando...' : 'Registrar movimiento'}
            </button>

            {message && (
              <div className={`p-4 rounded-xl text-center font-medium animate-in fade-in slide-in-from-top-2 ${messageType === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                }`}>
                {message}
              </div>
            )}
          </div>
        </form>
      </section>

      <style jsx>{`
        .form-input {
          width: 100%;
          background-color: #f8fafc;
          border: 2px solid transparent;
          border-radius: 1rem;
          padding: 0.875rem 1rem;
          font-size: 1rem;
          color: #1e293b;
          transition: all 0.2s ease;
        }
        .form-input:focus {
          outline: none;
          background-color: #ffffff;
          border-color: #0f172a;
          box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.05);
        }
        .form-input::placeholder {
          color: #94a3b8;
        }
      `}</style>
    </main>
  )
}

function FormField({
  label,
  helper,
  children,
}: {
  label: string
  helper?: string
  children: React.ReactNode
}) {
  return (
    <div className="group">
      <label className="block text-sm font-bold text-slate-700 mb-1.5 transition-colors group-focus-within:text-black">
        {label}
      </label>
      {children}
      {helper && <p className="mt-1.5 text-xs text-slate-400 font-medium">{helper}</p>}
    </div>
  )
}
