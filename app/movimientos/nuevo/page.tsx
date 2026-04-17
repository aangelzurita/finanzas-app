'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {
  applyTransactionMetadata,
  prepareTransactionForPersistence,
  type TransactionLedgerEntry,
} from '@/lib/accounting/transactions'
import {
  calculateMonthlyInstallment,
  calculateTotalAmount,
  createInstallmentPlan,
  validateInstallmentDraft,
} from '@/lib/credit-card-installments'
import { ArrowLeft } from 'lucide-react'

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
  | 'credit_card_refund'
  | 'debt_payment'

export default function NuevoMovimientoPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [debts, setDebts] = useState<Debt[]>([])

  const [transactionType, setTransactionType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [transactionDate, setTransactionDate] = useState(() => {
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)
  })

  const [sourceAccountId, setSourceAccountId] = useState('')
  const [destinationAccountId, setDestinationAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [relatedCreditCardId, setRelatedCreditCardId] = useState('')
  const [relatedDebtId, setRelatedDebtId] = useState('')
  const [affectsBalance, setAffectsBalance] = useState(true)
  const [isMsi, setIsMsi] = useState(false)
  const [installmentDescription, setInstallmentDescription] = useState('')
  const [installmentMonthlyAmount, setInstallmentMonthlyAmount] = useState('')
  const [installmentTotalMonths, setInstallmentTotalMonths] = useState('')
  const [installmentCurrentNumber, setInstallmentCurrentNumber] = useState('1')
  const [installmentChargeDay, setInstallmentChargeDay] = useState('')
  const [installmentStartDate, setInstallmentStartDate] = useState('')
  const [installmentNotes, setInstallmentNotes] = useState('')

  async function initialize() {
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData.session) {
      window.location.href = '/'
      return
    }

    const [{ data: accountsData }, { data: categoriesData }, { data: cardsData }, { data: debtsData }] =
      await Promise.all([
        supabase.from('accounts').select('id, name, account_type').eq('is_active', true).order('name'),
        supabase.from('categories').select('id, name, category_type').eq('is_active', true).order('name'),
        supabase.from('credit_cards').select('id, name, account_id').eq('is_active', true).order('name'),
        supabase.from('debts').select('id, name').neq('status', 'paid').order('name'),
      ])

    setAccounts(accountsData ?? [])
    setCategories(categoriesData ?? [])
    setCreditCards(cardsData ?? [])
    setDebts(debtsData ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void initialize()
  }, [])

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

  const installmentMonthlyAmountPreview = useMemo(() => {
    const monthlyAmount = Number(installmentMonthlyAmount)
    if (monthlyAmount > 0) return monthlyAmount
    return calculateMonthlyInstallment(Number(amount), Number(installmentTotalMonths))
  }, [installmentMonthlyAmount, amount, installmentTotalMonths])

  const installmentTotalAmountPreview = useMemo(() => {
    const totalAmount = Number(amount)
    if (totalAmount > 0) return totalAmount
    return calculateTotalAmount(Number(installmentMonthlyAmount), Number(installmentTotalMonths))
  }, [amount, installmentMonthlyAmount, installmentTotalMonths])

  const handleTypeChange = (value: TransactionType) => {
    setTransactionType(value)
    setMessage('')
    setSourceAccountId('')
    setDestinationAccountId('')
    setCategoryId('')
    setRelatedCreditCardId('')
    setRelatedDebtId('')
    setAffectsBalance(true)
    setIsMsi(false)
    setInstallmentDescription('')
    setInstallmentMonthlyAmount('')
    setInstallmentTotalMonths('')
    setInstallmentCurrentNumber('1')
    setInstallmentChargeDay('')
    setInstallmentStartDate('')
    setInstallmentNotes('')
  }

  const handleCreditCardChange = (creditCardId: string) => {
    setRelatedCreditCardId(creditCardId)

    const card = creditCards.find((c) => c.id === creditCardId)
    if (transactionType === 'credit_card_purchase') {
      setSourceAccountId(card?.account_id ?? '')
    }
  }

  const fail = (text: string) => {
    setMessage(text)
    setSaving(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    const parsedAmount =
      isMsi && transactionType === 'credit_card_purchase'
        ? installmentTotalAmountPreview
        : Number(amount)

    if (!parsedAmount || parsedAmount <= 0) {
      setMessage('Ingresa un monto válido.')
      setSaving(false)
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user?.id

    if (!userId) {
      setMessage('No hay sesión activa.')
      setSaving(false)
      return
    }

    if (transactionType === 'credit_card_purchase' && isMsi) {
      const installmentValidation = validateInstallmentDraft({
        categoryId,
        totalAmount: installmentTotalAmountPreview,
        monthlyAmount: installmentMonthlyAmountPreview,
        totalMonths: Number(installmentTotalMonths),
        currentInstallmentNumber: Number(installmentCurrentNumber),
        chargeDay: Number(installmentChargeDay),
      })

      if (installmentValidation) {
        setMessage(installmentValidation)
        setSaving(false)
        return
      }

      if (Number(amount) > 0 && Number(installmentMonthlyAmount) > 0) {
        const expectedTotal = calculateTotalAmount(Number(installmentMonthlyAmount), Number(installmentTotalMonths))
        if (Math.abs(expectedTotal - Number(amount)) > 0.01) {
          setMessage('El monto total no coincide con la mensualidad y el número de meses del MSI.')
          setSaving(false)
          return
        }
      }
    }

    if (transactionType === 'credit_card_refund' && !relatedCreditCardId) {
      fail('Selecciona la tarjeta del reembolso.')
      return
    }

    const draftTransaction: TransactionLedgerEntry = {
      transaction_type: transactionType,
      amount: parsedAmount,
      source_account_id:
        transactionType === 'income'
          ? null
          : transactionType === 'credit_card_purchase'
            ? sourceAccountId
            : sourceAccountId || null,
      destination_account_id:
        transactionType === 'income' || transactionType === 'transfer'
          ? destinationAccountId || null
          : null,
      related_credit_card_id:
        transactionType === 'credit_card_purchase' || transactionType === 'credit_card_payment' || transactionType === 'credit_card_refund'
          ? relatedCreditCardId || null
          : null,
      related_debt_id: transactionType === 'debt_payment' ? relatedDebtId || null : null,
      affects_balance: affectsBalance,
    }

    const preparedTx = await prepareTransactionForPersistence(supabase, draftTransaction)

    const payload: Record<string, unknown> = {
      user_id: userId,
      transaction_type: preparedTx.transaction_type,
      amount: preparedTx.amount,
      transaction_date: new Date(transactionDate).toISOString(),
      description: description || null,
      status: 'completed',
      affects_balance: affectsBalance,
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
      payload.source_account_id = sourceAccountId
      payload.related_credit_card_id = relatedCreditCardId
      payload.category_id = categoryId
    }

    if (transactionType === 'credit_card_payment') {
      payload.source_account_id = sourceAccountId
      payload.related_credit_card_id = relatedCreditCardId
      payload.applied_to_minimum_payment = preparedTx.applied_to_minimum_payment ?? 0
      payload.applied_to_no_interest_payment = preparedTx.applied_to_no_interest_payment ?? 0
    }

    if (transactionType === 'credit_card_refund') {
      payload.related_credit_card_id = relatedCreditCardId
    }

    if (transactionType === 'debt_payment') {
      payload.source_account_id = sourceAccountId
      payload.related_debt_id = relatedDebtId
    }

    const { data: insertedTx, error } = await supabase
      .from('transactions')
      .insert(payload)
      .select('id, transaction_type, amount, source_account_id, destination_account_id, related_credit_card_id, related_debt_id, affects_balance, applied_to_minimum_payment, applied_to_no_interest_payment')
      .single()

    if (error || !insertedTx) {
      setMessage(`Error: ${error?.message || 'No se pudo guardar el movimiento.'}`)
      setSaving(false)
      return
    }

    try {
      await applyTransactionMetadata(supabase, insertedTx as TransactionLedgerEntry)

      if (transactionType === 'credit_card_purchase' && isMsi && relatedCreditCardId) {
        await createInstallmentPlan(supabase, {
          userId,
          creditCardId: relatedCreditCardId,
          purchaseTransactionId: insertedTx.id,
          categoryId,
          description: installmentDescription.trim() || description.trim() || 'Compra MSI',
          totalAmount: installmentTotalAmountPreview,
          monthlyAmount: installmentMonthlyAmountPreview,
          totalMonths: Number(installmentTotalMonths),
          currentInstallmentNumber: Number(installmentCurrentNumber),
          chargeDay: Number(installmentChargeDay),
          startDate: installmentStartDate || undefined,
          notes: installmentNotes,
        })
      }
    } catch (impactError) {
      await supabase.from('transactions').delete().eq('id', insertedTx.id)
      setMessage(impactError instanceof Error ? impactError.message : 'No se pudo aplicar el movimiento.')
      setSaving(false)
      return
    }

    setMessage('Movimiento guardado correctamente.')
    setAmount('')
    setDescription('')

    setTimeout(() => {
      window.location.href = '/'
    }, 800)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Preparando transacción...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-20">
      <section className="bg-slate-950 text-white">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
            <Link href="/" className="hover:text-white transition flex items-center gap-1">
              <ArrowLeft size={14} /> Volver al Inicio
            </Link>
          </nav>
          <h1 className="text-5xl font-extrabold tracking-tight uppercase tracking-tighter">Nuevo Movimiento</h1>
          <p className="text-slate-400 mt-3 text-lg">Registra tus ingresos, gastos o abonos.</p>
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
                onChange={(e) => handleTypeChange(e.target.value as TransactionType)}
              >
                <option value="expense">📉 Gasto / Retiro</option>
                <option value="income">📈 Ingreso / Depósito</option>
                <option value="transfer">🔄 Transferencia</option>
                <option value="credit_card_purchase">💳 Compra con TDC</option>
                <option value="credit_card_payment">💰 Pago de TDC</option>
                <option value="credit_card_refund">↩️ Reembolso TDC</option>
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
                  required={!isMsi || transactionType !== 'credit_card_purchase'}
                  className="w-full rounded-2xl border-2 border-emerald-50 bg-emerald-50/30 p-4 pl-10 font-black text-emerald-600 focus:border-emerald-500 focus:ring-0 transition-all text-3xl placeholder:text-emerald-200"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
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
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
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
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
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
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
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
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
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
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
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
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
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
                    onChange={(e) => handleCreditCardChange(e.target.value)}
                  >
                    <option value="">Selecciona tarjeta</option>
                    {creditCards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name}
                      </option>
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
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="flex items-start gap-3 rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-4">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      checked={isMsi}
                      onChange={(e) => setIsMsi(e.target.checked)}
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-900">Es compra a MSI</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Guarda la compra y crea el plan MSI automáticamente.
                      </p>
                    </div>
                  </label>
                </div>

                {isMsi ? (
                  <>
                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Meses totales</label>
                      <input
                        type="number"
                        min="1"
                        className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                        value={installmentTotalMonths}
                        onChange={(e) => setInstallmentTotalMonths(e.target.value)}
                        placeholder="12"
                      />
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Mensualidad</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                        value={installmentMonthlyAmount}
                        onChange={(e) => setInstallmentMonthlyAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Próxima mensualidad</label>
                      <input
                        type="number"
                        min="1"
                        className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                        value={installmentCurrentNumber}
                        onChange={(e) => setInstallmentCurrentNumber(e.target.value)}
                        placeholder="1"
                      />
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Día de cargo</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                        value={installmentChargeDay}
                        onChange={(e) => setInstallmentChargeDay(e.target.value)}
                        placeholder="15"
                      />
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Fecha de inicio</label>
                      <input
                        type="date"
                        className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                        value={installmentStartDate}
                        onChange={(e) => setInstallmentStartDate(e.target.value)}
                      />
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Descripción MSI</label>
                      <input
                        type="text"
                        className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                        value={installmentDescription}
                        onChange={(e) => setInstallmentDescription(e.target.value)}
                        placeholder="Si la dejas vacía, usamos la descripción de la compra"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Resumen MSI</label>
                      <div className="rounded-2xl border-2 border-sky-100 bg-sky-50/60 p-4 text-sm font-bold text-slate-700">
                        Total calculado: {installmentTotalAmountPreview.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} · Mensualidad: {installmentMonthlyAmountPreview.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Notas MSI</label>
                      <input
                        type="text"
                        className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg placeholder:text-slate-300"
                        value={installmentNotes}
                        onChange={(e) => setInstallmentNotes(e.target.value)}
                        placeholder="Promoción, referencia o detalle del plan"
                      />
                    </div>
                  </>
                ) : null}
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
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
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
                      <option key={card.id} value={card.id}>
                        {card.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {(transactionType === 'credit_card_refund') && (
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Tarjeta del reembolso</label>
                <select
                  required
                  className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                  value={relatedCreditCardId}
                  onChange={(e) => setRelatedCreditCardId(e.target.value)}
                >
                  <option value="">Selecciona tarjeta</option>
                  {creditCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </div>
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
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
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
                      <option key={debt.id} value={debt.id}>
                        {debt.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="col-span-2">
              <label className="flex items-start gap-3 rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-4">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  checked={affectsBalance}
                  onChange={(e) => setAffectsBalance(e.target.checked)}
                />
                <div>
                  <p className="text-sm font-bold text-slate-900">Impactar saldos automáticamente</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Desactívalo si este movimiento ya venía reflejado en el saldo actual. Lo guardamos en historial,
                    pero no lo volvemos a sumar ni a restar.
                  </p>
                </div>
              </label>
            </div>

            <div className="col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Descripción / Notas</label>
              <input
                type="text"
                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg placeholder:text-slate-300"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej. Súper, Pago de luz, Transferencia a Juan..."
              />
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-slate-900 py-5 text-lg font-black text-white hover:bg-slate-800 transition-all active:scale-[0.98] shadow-xl disabled:opacity-50"
            >
              {saving ? 'GUARDANDO...' : 'GUARDAR MOVIMIENTO'}
            </button>
            <Link
              href="/"
              className="mt-4 block w-full rounded-2xl border-2 border-slate-100 py-4 text-center font-bold text-slate-400 hover:text-slate-600 transition-all"
            >
              CANCELAR
            </Link>
          </div>

          {message && (
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-center">
              <p className="text-slate-600 font-bold">{message}</p>
            </div>
          )}
        </form>
      </section>
    </main>
  )
}
