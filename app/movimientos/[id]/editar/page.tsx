'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {
  applyTransactionMetadata,
  prepareTransactionForPersistence,
  reverseTransactionMetadata,
  type TransactionLedgerEntry,
} from '@/lib/accounting/transactions'
import { ArrowLeft, Trash2 } from 'lucide-react'

type Account = {
  id: string
  name: string
  account_type: string
}

type Category = {
  id: string
  name: string
  category_type: 'income' | 'expense'
}

type CreditCard = {
  id: string
  name: string
  account_id: string
}

type Debt = {
  id: string
  name: string
}

type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'credit_card_purchase'
  | 'credit_card_payment'
  | 'debt_payment'

export default function EditarMovimientoPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const transactionId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('')

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [debts, setDebts] = useState<Debt[]>([])

  const [transactionType, setTransactionType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [transactionDate, setTransactionDate] = useState('')

  const [sourceAccountId, setSourceAccountId] = useState('')
  const [destinationAccountId, setDestinationAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [relatedCreditCardId, setRelatedCreditCardId] = useState('')
  const [relatedDebtId, setRelatedDebtId] = useState('')
  const [originalTransaction, setOriginalTransaction] = useState<(TransactionLedgerEntry & { id: string }) | null>(null)

  async function initialize() {
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData.session) {
      router.push('/')
      return
    }

    const [
      { data: accountsData },
      { data: categoriesData },
      { data: cardsData },
      { data: debtsData },
      { data: txData, error: txError },
    ] = await Promise.all([
      supabase.from('accounts').select('id, name, account_type').eq('is_active', true).order('name'),
      supabase.from('categories').select('id, name, category_type').eq('is_active', true).order('name'),
      supabase.from('credit_cards').select('id, name, account_id').eq('is_active', true).order('name'),
      supabase.from('debts').select('id, name').neq('status', 'paid').order('name'),
      supabase.from('transactions').select('*').eq('id', transactionId).single(),
    ])

    if (txError || !txData) {
      setMessage('No se pudo cargar el movimiento.')
      setMessageType('error')
      setLoading(false)
      return
    }

    setAccounts(accountsData ?? [])
    setCategories(categoriesData ?? [])
    setCreditCards(cardsData ?? [])
    setDebts(debtsData ?? [])

    setTransactionType(txData.transaction_type)
    setAmount(String(txData.amount ?? ''))
    setDescription(txData.description ?? '')
    setSourceAccountId(txData.source_account_id ?? '')
    setDestinationAccountId(txData.destination_account_id ?? '')
    setCategoryId(txData.category_id ?? '')
    setRelatedCreditCardId(txData.related_credit_card_id ?? '')
    setRelatedDebtId(txData.related_debt_id ?? '')
    setOriginalTransaction({
      id: txData.id,
      transaction_type: txData.transaction_type,
      amount: Number(txData.amount ?? 0),
      source_account_id: txData.source_account_id ?? null,
      destination_account_id: txData.destination_account_id ?? null,
      related_credit_card_id: txData.related_credit_card_id ?? null,
      related_debt_id: txData.related_debt_id ?? null,
      applied_to_minimum_payment: txData.applied_to_minimum_payment ?? 0,
      applied_to_no_interest_payment: txData.applied_to_no_interest_payment ?? 0,
    })

    const dt = new Date(txData.transaction_date)
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
    setTransactionDate(local.toISOString().slice(0, 16))

    setLoading(false)
  }

  useEffect(() => {
    void initialize()
  }, [transactionId])

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.category_type === 'income'),
    [categories]
  )

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.category_type === 'expense'),
    [categories]
  )

  const liquidAccounts = useMemo(
    () => accounts.filter((a) => ['cash', 'debit', 'savings'].includes(a.account_type)),
    [accounts]
  )

  const allNonCreditAccounts = useMemo(
    () => accounts.filter((a) => a.account_type !== 'credit_card'),
    [accounts]
  )

  const fail = (text: string) => {
    setMessage(text)
    setMessageType('error')
    setSaving(false)
  }

  const validateForm = () => {
    const parsedAmount = Number(amount)

    if (!parsedAmount || parsedAmount <= 0) {
      fail('Ingresa un monto válido.')
      return false
    }

    if (!transactionDate) {
      fail('Selecciona una fecha y hora.')
      return false
    }

    if (transactionType === 'income') {
      if (!destinationAccountId) return fail('Selecciona una cuenta destino.'), false
      if (!categoryId) return fail('Selecciona una categoría de ingreso.'), false
    }

    if (transactionType === 'expense') {
      if (!sourceAccountId) return fail('Selecciona una cuenta origen.'), false
      if (!categoryId) return fail('Selecciona una categoría de gasto.'), false
    }

    if (transactionType === 'transfer') {
      if (!sourceAccountId || !destinationAccountId) {
        return fail('Selecciona cuenta origen y cuenta destino.'), false
      }
      if (sourceAccountId === destinationAccountId) {
        return fail('La cuenta origen y destino no pueden ser la misma.'), false
      }
    }

    if (transactionType === 'credit_card_purchase') {
      if (!relatedCreditCardId) return fail('Selecciona una tarjeta.'), false
      if (!categoryId) return fail('Selecciona una categoría.'), false
    }

    if (transactionType === 'credit_card_payment') {
      if (!sourceAccountId) return fail('Selecciona la cuenta desde la que pagas.'), false
      if (!relatedCreditCardId) return fail('Selecciona la tarjeta.'), false
    }

    if (transactionType === 'debt_payment') {
      if (!sourceAccountId) return fail('Selecciona la cuenta desde la que pagas.'), false
      if (!relatedDebtId) return fail('Selecciona la deuda.'), false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setMessageType('')

    if (!validateForm()) return

    if (!originalTransaction) {
      fail('No se pudo cargar el movimiento original.')
      return
    }

    const parsedAmount = Number(amount)

    const payload: Record<string, unknown> = {
      transaction_type: transactionType,
      amount: parsedAmount,
      transaction_date: new Date(transactionDate).toISOString(),
      description: description || null,
      status: 'completed',
      affects_budget: ['expense', 'credit_card_purchase'].includes(transactionType),
      source_account_id: null,
      destination_account_id: null,
      category_id: null,
      related_credit_card_id: null,
      related_debt_id: null,
    }

    if (transactionType === 'income') {
      payload.destination_account_id = destinationAccountId
      payload.category_id = categoryId
    }

    if (transactionType === 'expense') {
      payload.source_account_id = sourceAccountId
      payload.category_id = categoryId
    }

    if (transactionType === 'transfer') {
      payload.source_account_id = sourceAccountId
      payload.destination_account_id = destinationAccountId
    }

    if (transactionType === 'credit_card_purchase') {
      const selectedCard = creditCards.find((c) => c.id === relatedCreditCardId)
      payload.source_account_id = selectedCard?.account_id ?? null
      payload.related_credit_card_id = relatedCreditCardId
      payload.category_id = categoryId
    }

    if (transactionType === 'credit_card_payment') {
      payload.source_account_id = sourceAccountId
      payload.related_credit_card_id = relatedCreditCardId
    }

    if (transactionType === 'debt_payment') {
      payload.source_account_id = sourceAccountId
      payload.related_debt_id = relatedDebtId
    }

    const preparedNextTransaction = await prepareTransactionForPersistence(supabase, {
      transaction_type: payload.transaction_type as TransactionType,
      amount: payload.amount as number,
      source_account_id: payload.source_account_id as string | null,
      destination_account_id: payload.destination_account_id as string | null,
      related_credit_card_id: payload.related_credit_card_id as string | null,
      related_debt_id: payload.related_debt_id as string | null,
    }, originalTransaction)

    payload.applied_to_minimum_payment = preparedNextTransaction.applied_to_minimum_payment ?? 0
    payload.applied_to_no_interest_payment = preparedNextTransaction.applied_to_no_interest_payment ?? 0

    const nextTransaction = preparedNextTransaction satisfies TransactionLedgerEntry

    try {
      await reverseTransactionMetadata(supabase, originalTransaction)
      await applyTransactionMetadata(supabase, nextTransaction)
    } catch (reapplyError) {
      try {
        await applyTransactionMetadata(supabase, originalTransaction)
      } catch {
        // Keep the original error for the UI.
      }
      fail(reapplyError instanceof Error ? reapplyError.message : 'No se pudo recalcular el movimiento.')
      return
    }

    const { data: updatedTx, error } = await supabase
      .from('transactions')
      .update(payload)
      .eq('id', transactionId)
      .select('id, transaction_type, amount, source_account_id, destination_account_id, related_credit_card_id, related_debt_id, applied_to_minimum_payment, applied_to_no_interest_payment')
      .single()

    if (error || !updatedTx) {
      try {
        await reverseTransactionMetadata(supabase, nextTransaction)
        await applyTransactionMetadata(supabase, originalTransaction)
      } catch {
        // Intentionally swallow here so the original update error reaches the UI.
      }
      fail(`Error: ${error?.message || 'No se pudo actualizar el movimiento.'}`)
      return
    }

    setOriginalTransaction(updatedTx as TransactionLedgerEntry & { id: string })

    setMessage('Movimiento actualizado correctamente.')
    setMessageType('success')

    setTimeout(() => {
      router.push('/movimientos')
      router.refresh()
    }, 700)
  }

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar este movimiento?')) return

    if (!originalTransaction) {
      fail('No se pudo cargar el movimiento original.')
      return
    }

    setSaving(true)
    try {
      await reverseTransactionMetadata(supabase, originalTransaction)
    } catch (reverseError) {
      fail(reverseError instanceof Error ? reverseError.message : 'No se pudo revertir el movimiento.')
      return
    }

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId)

    if (error) {
      try {
        await applyTransactionMetadata(supabase, originalTransaction)
      } catch {
        // Preserve the delete error for the UI.
      }
      fail(`Error: ${error.message}`)
      return
    }

    router.push('/movimientos')
    router.refresh()
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Cargando transacción...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-20">
      <section className="bg-slate-950 text-white">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
            <Link href="/movimientos" className="hover:text-white transition flex items-center gap-1">
              <ArrowLeft size={14} /> Volver a Movimientos
            </Link>
          </nav>
          <h1 className="text-5xl font-extrabold tracking-tight uppercase tracking-tighter">Editar Movimiento</h1>
          <p className="text-slate-400 mt-3 text-lg">Modifica los detalles de tu transacción.</p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 -mt-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-2xl space-y-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Tipo de movimiento</label>
              <select
                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value as TransactionType)}
              >
                <option value="expense">📉 Gasto / Retiro</option>
                <option value="income">📈 Ingreso / Depósito</option>
                <option value="transfer">🔄 Transferencia</option>
                <option value="credit_card_purchase">💳 Compra con TDC</option>
                <option value="credit_card_payment">💰 Pago de TDC</option>
                <option value="debt_payment">💸 Pago de Deuda</option>
              </select>
            </div>

            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-2">Monto</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-emerald-600">$</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="w-full rounded-2xl border-2 border-emerald-50 bg-emerald-50/30 p-4 pl-10 font-black text-emerald-600 focus:border-emerald-500 focus:ring-0 transition-all text-3xl"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Fecha y hora</label>
              <input
                type="datetime-local"
                required
                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
              />
            </div>

            {(transactionType === 'income') && (
              <>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Cuenta destino</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={destinationAccountId}
                    onChange={(e) => setDestinationAccountId(e.target.value)}
                  >
                    <option value="">Selecciona cuenta</option>
                    {allNonCreditAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Categoría</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">Selecciona categoría</option>
                    {incomeCategories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {(transactionType === 'expense') && (
              <>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Cuenta origen</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={sourceAccountId}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                  >
                    <option value="">Selecciona cuenta</option>
                    {allNonCreditAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Categoría</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">Selecciona categoría</option>
                    {expenseCategories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {(transactionType === 'transfer') && (
              <>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Desde cuenta</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={sourceAccountId}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                  >
                    <option value="">Selecciona origen</option>
                    {allNonCreditAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Hacia cuenta</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={destinationAccountId}
                    onChange={(e) => setDestinationAccountId(e.target.value)}
                  >
                    <option value="">Selecciona destino</option>
                    {allNonCreditAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {(transactionType === 'credit_card_purchase') && (
              <>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Tarjeta utilizada</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={relatedCreditCardId}
                    onChange={(e) => setRelatedCreditCardId(e.target.value)}
                  >
                    <option value="">Selecciona tarjeta</option>
                    {creditCards.map((card) => (
                      <option key={card.id} value={card.id}>{card.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Categoría</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">Selecciona categoría</option>
                    {expenseCategories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {(transactionType === 'credit_card_payment') && (
              <>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Desde cuenta</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={sourceAccountId}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                  >
                    <option value="">Selecciona origen</option>
                    {liquidAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Tarjeta a pagar</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={relatedCreditCardId}
                    onChange={(e) => setRelatedCreditCardId(e.target.value)}
                  >
                    <option value="">Selecciona tarjeta</option>
                    {creditCards.map((card) => (
                      <option key={card.id} value={card.id}>{card.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {(transactionType === 'debt_payment') && (
              <>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Desde cuenta</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={sourceAccountId}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                  >
                    <option value="">Selecciona origen</option>
                    {liquidAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Deuda a amortizar</label>
                  <select
                    required
                    className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                    value={relatedDebtId}
                    onChange={(e) => setRelatedDebtId(e.target.value)}
                  >
                    <option value="">Selecciona deuda</option>
                    {debts.map((debt) => (
                      <option key={debt.id} value={debt.id}>{debt.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Descripción / Notas</label>
              <input
                type="text"
                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg placeholder:text-slate-300"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-slate-900 py-5 text-lg font-black text-white hover:bg-slate-800 transition-all active:scale-[0.98] shadow-xl disabled:opacity-50"
            >
              {saving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
            </button>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-2xl border-2 border-rose-100 py-4 font-bold text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-all flex items-center justify-center gap-2"
              >
                <Trash2 size={18} /> ELIMINAR
              </button>
              <Link
                href="/movimientos"
                className="rounded-2xl border-2 border-slate-100 py-4 text-center font-bold text-slate-400 hover:text-slate-600 transition-all flex items-center justify-center"
              >
                CANCELAR
              </Link>
            </div>
          </div>

          {message && (
            <div className={`rounded-2xl border p-4 text-center ${messageType === 'error' ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
              <p className="font-bold">{message}</p>
            </div>
          )}
        </form>
      </section>
    </main>
  )
}
