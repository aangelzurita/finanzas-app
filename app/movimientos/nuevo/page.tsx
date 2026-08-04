'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {
  applyTransactionMetadata,
  prepareTransactionForPersistence,
  type TransactionLedgerEntry,
} from '@/lib/accounting/transactions'
import {
  calculateFirstInstallmentPaymentDate,
  calculateMonthlyInstallment,
  calculateTotalAmount,
  createInstallmentPlan,
  validateInstallmentDraft,
} from '@/lib/credit-card-installments'
import { adviseCreditCards } from '@/lib/credit-card-advisor'
import { formatDate, formatMoney } from '@/lib/utils'
import { ArrowLeft, CheckCircle2, CreditCard as CardIcon, Info, Sparkles } from 'lucide-react'

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
  statement_cutoff_day: number
  payment_due_day: number
  credit_limit: number
  current_balance: number
  minimum_payment: number
  no_interest_payment: number
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

const transactionTypeLabels: Record<TransactionType, { title: string; description: string }> = {
  income: {
    title: 'Registrar ingreso',
    description: 'Guarda una entrada real de dinero en una cuenta.',
  },
  expense: {
    title: 'Registrar gasto',
    description: 'Guarda una salida real de efectivo, débito o cuenta propia.',
  },
  transfer: {
    title: 'Registrar transferencia',
    description: 'Mueve dinero entre cuentas sin duplicar gasto.',
  },
  credit_card_purchase: {
    title: 'Registrar compra con tarjeta',
    description: 'Guarda una compra normal o MSI en una tarjeta.',
  },
  credit_card_payment: {
    title: 'Registrar pago de tarjeta',
    description: 'Registra el pago real desde una cuenta hacia una TDC.',
  },
  credit_card_refund: {
    title: 'Registrar reembolso de tarjeta',
    description: 'Disminuye saldo usado de una tarjeta por un reembolso.',
  },
  debt_payment: {
    title: 'Registrar pago de deuda',
    description: 'Guarda un pago real hacia préstamo, deuda o financiamiento.',
  },
}

function isTransactionType(value: string | null): value is TransactionType {
  return [
    'income',
    'expense',
    'transfer',
    'credit_card_purchase',
    'credit_card_payment',
    'credit_card_refund',
    'debt_payment',
  ].includes(value || '')
}

export default function NuevoMovimientoPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const requestedType = searchParams.get('type')
  const initialType: TransactionType = isTransactionType(requestedType) ? requestedType : 'expense'
  const initialIsMsi = searchParams.get('msi') === '1'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [debts, setDebts] = useState<Debt[]>([])

  const [transactionType, setTransactionType] = useState<TransactionType>(initialType)
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
  const [isMsi, setIsMsi] = useState(initialIsMsi && initialType === 'credit_card_purchase')
  const [msiTimingMode, setMsiTimingMode] = useState<'new' | 'historical'>('new')
  const [msiCaptureMode, setMsiCaptureMode] = useState<'total' | 'monthly'>('total')
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
        supabase
          .from('credit_cards')
          .select('id, name, account_id, statement_cutoff_day, payment_due_day, credit_limit, current_balance, minimum_payment, no_interest_payment')
          .eq('is_active', true)
          .order('name'),
        supabase.from('debts').select('id, name').neq('status', 'paid').order('name'),
      ])

    setAccounts(accountsData ?? [])
    setCategories(categoriesData ?? [])
    setCreditCards(cardsData ?? [])
    setDebts(debtsData ?? [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (msiCaptureMode === 'monthly') return 0
    return calculateMonthlyInstallment(Number(amount), Number(installmentTotalMonths))
  }, [installmentMonthlyAmount, amount, installmentTotalMonths, msiCaptureMode])

  const installmentTotalAmountPreview = useMemo(() => {
    if (msiCaptureMode === 'monthly') {
      return calculateTotalAmount(Number(installmentMonthlyAmount), Number(installmentTotalMonths))
    }

    const totalAmount = Number(amount)
    if (totalAmount > 0) return totalAmount
    return calculateTotalAmount(Number(installmentMonthlyAmount), Number(installmentTotalMonths))
  }, [amount, installmentMonthlyAmount, installmentTotalMonths, msiCaptureMode])

  const isMonthlyMsiCapture =
    transactionType === 'credit_card_purchase' && isMsi && msiCaptureMode === 'monthly'

  const selectedCreditCard = useMemo(
    () => creditCards.find((card) => card.id === relatedCreditCardId) || null,
    [creditCards, relatedCreditCardId]
  )

  const parsedAmountForPreview = useMemo(() => {
    if (transactionType === 'credit_card_purchase' && isMsi) return installmentTotalAmountPreview
    return Number(amount || 0)
  }, [amount, installmentTotalAmountPreview, isMsi, transactionType])

  const cardAdvisorResults = useMemo(
    () => adviseCreditCards(creditCards, transactionDate ? new Date(transactionDate) : new Date()),
    [creditCards, transactionDate]
  )

  const bestAdvisorCard = cardAdvisorResults[0]
  const selectedAdvisorCard = useMemo(
    () => cardAdvisorResults.find((card) => card.cardId === relatedCreditCardId) || null,
    [cardAdvisorResults, relatedCreditCardId]
  )

  const selectedCardAfterPurchase = useMemo(() => {
    if (!selectedCreditCard) return null
    const currentBalance = Number(selectedCreditCard.current_balance || 0)
    const creditLimit = Number(selectedCreditCard.credit_limit || 0)
    const nextBalance = currentBalance + Math.max(0, parsedAmountForPreview)

    return {
      currentBalance,
      nextBalance,
      currentUtilization: creditLimit > 0 ? currentBalance / creditLimit : 0,
      nextUtilization: creditLimit > 0 ? nextBalance / creditLimit : 0,
      availableAfter: Math.max(0, creditLimit - nextBalance),
      noInterestAfter: Number(selectedCreditCard.no_interest_payment || 0) + Math.max(0, parsedAmountForPreview),
    }
  }, [parsedAmountForPreview, selectedCreditCard])

  const suggestedPaymentOptions = useMemo(() => {
    if (!selectedCreditCard) return []

    return [
      {
        label: 'Mínimo',
        value: Number(selectedCreditCard.minimum_payment || 0),
      },
      {
        label: 'No generar intereses',
        value: Number(selectedCreditCard.no_interest_payment || selectedCreditCard.current_balance || 0),
      },
      {
        label: 'Saldo usado',
        value: Number(selectedCreditCard.current_balance || 0),
      },
    ].filter((option) => option.value > 0)
  }, [selectedCreditCard])

  const firstMsiPaymentDate = useMemo(() => {
    if (!selectedCreditCard || !transactionDate) return ''
    return calculateFirstInstallmentPaymentDate(transactionDate, {
      statementCutoffDay: selectedCreditCard.statement_cutoff_day,
      paymentDueDay: selectedCreditCard.payment_due_day,
    })
  }, [selectedCreditCard, transactionDate])

  useEffect(() => {
    if (!selectedCreditCard || transactionType !== 'credit_card_purchase' || !isMsi) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstallmentChargeDay(String(selectedCreditCard.payment_due_day))

    if (msiTimingMode === 'new') {
      setInstallmentCurrentNumber('1')
      setInstallmentStartDate(firstMsiPaymentDate)
    }
  }, [firstMsiPaymentDate, isMsi, msiTimingMode, selectedCreditCard, transactionType])

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
    setMsiTimingMode('new')
    setMsiCaptureMode('total')
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

      if (msiCaptureMode === 'total' && Number(amount) > 0 && Number(installmentMonthlyAmount) > 0) {
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

  const currentTypeLabel = transactionTypeLabels[transactionType]

  return (
    <main className="min-h-screen bg-[#eef3f8] pb-28">
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <nav className="flex items-center gap-2 text-slate-500 text-sm mb-4">
            <Link href="/" className="hover:text-slate-950 transition flex items-center gap-1">
              <ArrowLeft size={14} /> Volver al Inicio
            </Link>
          </nav>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Acción rápida</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">{currentTypeLabel.title}</h1>
          <p className="text-slate-500 mt-3 text-lg font-semibold">{currentTypeLabel.description}</p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 -mt-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-[2.5rem] border border-slate-200 p-6 shadow-2xl shadow-slate-900/10 space-y-8 md:p-8">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">1. Captura</p>
              <p className="mt-1 text-sm font-black text-slate-950">Monto y fecha</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">2. Clasifica</p>
              <p className="mt-1 text-sm font-black text-slate-950">Cuenta, tarjeta o deuda</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">3. Confirma</p>
              <p className="mt-1 text-sm font-black text-slate-950">Revisa el impacto</p>
            </div>
          </div>

          <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm font-bold text-slate-700">
            <div className="flex items-start gap-3">
              <Info size={18} className="mt-0.5 shrink-0 text-sky-600" />
              <p>{currentTypeLabel.description} Puedes cambiar el tipo si abriste esta acción por error.</p>
            </div>
          </div>

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
                  required={!isMonthlyMsiCapture}
                  readOnly={isMonthlyMsiCapture}
                  className={`w-full rounded-2xl border-2 p-4 pl-10 font-black text-3xl transition-all placeholder:text-emerald-200 ${isMonthlyMsiCapture ? 'border-sky-100 bg-sky-50/60 text-slate-900 focus:border-sky-200' : 'border-emerald-50 bg-emerald-50/30 text-emerald-600 focus:border-emerald-500'} focus:ring-0`}
                  value={
                    isMonthlyMsiCapture
                      ? (installmentTotalAmountPreview > 0 ? installmentTotalAmountPreview.toFixed(2) : '')
                      : amount
                  }
                  onChange={(e) => {
                    if (!isMonthlyMsiCapture) {
                      setAmount(e.target.value)
                    }
                  }}
                  placeholder={isMonthlyMsiCapture ? 'Se calcula automáticamente' : '0.00'}
                />
              </div>
              {isMonthlyMsiCapture ? (
                <p className="mt-2 text-xs font-bold text-sky-700">
                  Estamos calculando el total con la mensualidad por el número de meses.
                </p>
              ) : null}
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
                <div className="col-span-2 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={20} className="mt-0.5 text-emerald-600" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Ingreso recibido</p>
                      <h2 className="mt-1 text-xl font-black text-slate-950">
                        Esto sí aumenta el saldo real de la cuenta destino.
                      </h2>
                      <p className="mt-1 text-sm font-bold text-slate-600">
                        Si venía de ingresos programados, registra aquí el movimiento real y después confirma/avanza el ingreso esperado en Ingresos.
                      </p>
                    </div>
                  </div>
                </div>

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

                <div className="col-span-2 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/70 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Sparkles size={18} className="text-emerald-600" />
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Asesor de compra</p>
                      </div>
                      <h2 className="mt-2 text-xl font-black text-slate-950">
                        {bestAdvisorCard ? `${bestAdvisorCard.cardName} parece la mejor opción` : 'Registra tarjetas para recomendar mejor opción'}
                      </h2>
                      <p className="mt-1 text-sm font-bold text-slate-600">
                        {bestAdvisorCard
                          ? `${bestAdvisorCard.financingDaysIfUsedToday} días estimados para pagar. ${bestAdvisorCard.reasons[0] || ''}`
                          : 'La recomendación considera corte, fecha de pago, uso de línea y disponible.'}
                      </p>
                    </div>
                    {bestAdvisorCard && relatedCreditCardId !== bestAdvisorCard.cardId ? (
                      <button
                        type="button"
                        onClick={() => handleCreditCardChange(bestAdvisorCard.cardId)}
                        className="w-fit rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-emerald-700"
                      >
                        Usar recomendada
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Corte</p>
                      <p className="mt-1 text-sm font-black text-slate-950">
                        {selectedAdvisorCard ? formatDate(selectedAdvisorCard.estimatedCutoffDate.toISOString()) : 'Selecciona tarjeta'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pago</p>
                      <p className="mt-1 text-sm font-black text-slate-950">
                        {selectedAdvisorCard ? formatDate(selectedAdvisorCard.estimatedPaymentDueDate.toISOString()) : 'Selecciona tarjeta'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Uso después</p>
                      <p className="mt-1 text-sm font-black text-slate-950">
                        {selectedCardAfterPurchase ? `${(selectedCardAfterPurchase.nextUtilization * 100).toFixed(1)}%` : 'Sin monto'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Disponible después</p>
                      <p className="mt-1 text-sm font-black text-slate-950">
                        {selectedCardAfterPurchase ? formatMoney(selectedCardAfterPurchase.availableAfter) : 'Sin monto'}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs font-bold text-slate-600">
                    Esta compra no reduce tu efectivo hoy, pero aumenta el saldo de tu tarjeta y tus compromisos futuros.
                  </p>
                </div>

                <div className="col-span-2">
                  <label className="flex items-start gap-3 rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-4">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      checked={isMsi}
                      onChange={(e) => {
                        setIsMsi(e.target.checked)
                        if (e.target.checked) {
                          setMsiTimingMode('new')
                        }
                      }}
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-900">Es compra a MSI</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Guarda la compra y crea el plan MSI automáticamente.
                      </p>
                      <p className="mt-1 text-xs font-bold text-sky-700">
                        El saldo usado de la tarjeta aumenta por el total; el presupuesto mensual se afecta por la mensualidad.
                      </p>
                    </div>
                  </label>
                </div>

                {isMsi ? (
                  <>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Tipo de MSI</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setMsiTimingMode('new')}
                          className={`rounded-2xl border-2 px-4 py-4 text-sm font-black transition-all ${msiTimingMode === 'new' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 bg-white text-slate-700 hover:border-slate-300'}`}
                        >
                          Compra nueva
                        </button>
                        <button
                          type="button"
                          onClick={() => setMsiTimingMode('historical')}
                          className={`rounded-2xl border-2 px-4 py-4 text-sm font-black transition-all ${msiTimingMode === 'historical' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 bg-white text-slate-700 hover:border-slate-300'}`}
                        >
                          MSI histórico
                        </button>
                      </div>
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        {msiTimingMode === 'new'
                          ? 'Usamos la fecha de compra, el corte y el límite de pago de la tarjeta.'
                          : 'Úsalo para una compra que ya aparece en tu estado de cuenta.'}
                      </p>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Capturar MSI por</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setMsiCaptureMode('total')
                            setInstallmentMonthlyAmount('')
                          }}
                          className={`rounded-2xl border-2 px-4 py-4 text-sm font-black transition-all ${msiCaptureMode === 'total' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 bg-white text-slate-700 hover:border-slate-300'}`}
                        >
                          Total de compra
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMsiCaptureMode('monthly')
                            setAmount('')
                          }}
                          className={`rounded-2xl border-2 px-4 py-4 text-sm font-black transition-all ${msiCaptureMode === 'monthly' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 bg-white text-slate-700 hover:border-slate-300'}`}
                        >
                          Solo mensualidad
                        </button>
                      </div>
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        {msiCaptureMode === 'monthly'
                          ? 'Escribe la mensualidad y los meses; el total se calcula solo.'
                          : 'Escribe el monto total de la compra. La mensualidad te ayuda a validarlo.'}
                      </p>
                    </div>

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
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                        {msiCaptureMode === 'monthly' ? 'Mensualidad base' : 'Mensualidad'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        readOnly={msiCaptureMode === 'total'}
                        className={`w-full rounded-2xl border-2 p-4 font-bold focus:ring-0 transition-all text-lg ${msiCaptureMode === 'total' ? 'border-sky-100 bg-sky-50/60 font-mono text-slate-900' : 'border-slate-100 text-slate-900 focus:border-slate-900'}`}
                        value={
                          msiCaptureMode === 'total'
                            ? (installmentMonthlyAmountPreview > 0 ? installmentMonthlyAmountPreview.toFixed(2) : '')
                            : installmentMonthlyAmount
                        }
                        onChange={(e) => {
                          if (msiCaptureMode === 'monthly') {
                            setInstallmentMonthlyAmount(e.target.value)
                          }
                        }}
                        placeholder={msiCaptureMode === 'total' ? 'Se calcula automáticamente' : '0.00'}
                      />
                      {msiCaptureMode === 'total' ? (
                        <p className="mt-1.5 text-xs text-sky-700 font-bold">
                          Se calcula dividiendo el monto total entre los meses.
                        </p>
                      ) : null}
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                        {msiCaptureMode === 'monthly' ? 'Total calculado' : 'Total de compra'}
                      </label>
                      {msiCaptureMode === 'monthly' ? (
                        <div className="w-full rounded-2xl border-2 border-sky-100 bg-sky-50/60 p-4 font-black text-slate-900 text-lg">
                          {installmentTotalAmountPreview.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                        </div>
                      ) : (
                        <div className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/60 p-4 font-bold text-slate-500 text-sm">
                          Estamos usando el monto de arriba como total de compra.
                        </div>
                      )}
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                        {msiTimingMode === 'new' ? 'Mensualidad inicial' : 'Próxima mensualidad'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                        readOnly={msiTimingMode === 'new'}
                        value={installmentCurrentNumber}
                        onChange={(e) => setInstallmentCurrentNumber(e.target.value)}
                        placeholder="1"
                      />
                      {msiTimingMode === 'historical' ? (
                        <p className="mt-1.5 text-xs text-slate-500 font-bold">
                          Captura la mensualidad que sigue según tu estado de cuenta.
                        </p>
                      ) : null}
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Día límite de pago</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        readOnly
                        className="w-full rounded-2xl border-2 border-sky-100 bg-sky-50/60 p-4 font-mono font-bold text-slate-900 focus:ring-0 transition-all text-lg"
                        value={installmentChargeDay}
                        onChange={() => undefined}
                        placeholder={selectedCreditCard ? String(selectedCreditCard.payment_due_day) : '15'}
                      />
                      <p className="mt-1.5 text-xs text-sky-700 font-bold">
                        Se toma automáticamente de la tarjeta.
                      </p>
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                        {msiTimingMode === 'new' ? 'Primera fecha límite de pago' : 'Fecha del próximo pago'}
                      </label>
                      <input
                        type="date"
                        className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                        readOnly={msiTimingMode === 'new'}
                        value={installmentStartDate}
                        onChange={(e) => setInstallmentStartDate(e.target.value)}
                      />
                      {msiTimingMode === 'new' && selectedCreditCard ? (
                        <p className="mt-1.5 text-xs text-sky-700 font-bold">
                          Corte día {selectedCreditCard.statement_cutoff_day}; pago límite día {selectedCreditCard.payment_due_day}.
                        </p>
                      ) : null}
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
                        <p className="mt-2 text-xs text-sky-700">
                          Saldo de tarjeta por total; presupuesto del mes por mensualidad.
                        </p>
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

                <div className="col-span-2 rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-5">
                  <div className="flex items-start gap-3">
                    <CardIcon size={20} className="mt-0.5 text-indigo-600" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-700">Pago de tarjeta</p>
                      <h2 className="mt-1 text-xl font-black text-slate-950">
                        Este pago baja tu efectivo y reduce saldo usado de la tarjeta.
                      </h2>
                      <p className="mt-1 text-sm font-bold text-slate-600">
                        Usa un monto sugerido o captura uno distinto arriba.
                      </p>
                    </div>
                  </div>
                  {suggestedPaymentOptions.length > 0 ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {suggestedPaymentOptions.map((option) => (
                        <button
                          type="button"
                          key={option.label}
                          onClick={() => setAmount(option.value.toFixed(2))}
                          className="rounded-2xl border border-white bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{option.label}</p>
                          <p className="mt-1 text-lg font-black text-slate-950">{formatMoney(option.value)}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-2xl bg-white p-4 text-sm font-bold text-slate-500">
                      Selecciona una tarjeta para ver montos sugeridos.
                    </p>
                  )}
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
                <div className="col-span-2 rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-5">
                  <div className="flex items-start gap-3">
                    <Info size={20} className="mt-0.5 text-amber-600" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Pago de deuda</p>
                      <h2 className="mt-1 text-xl font-black text-slate-950">
                        Este pago baja tu efectivo y reduce el adeudo asociado.
                      </h2>
                      <p className="mt-1 text-sm font-bold text-slate-600">
                        Si el pago salió de una cuenta externa, elige esa cuenta para no afectar tu efectivo personal.
                      </p>
                    </div>
                  </div>
                </div>

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

            <div className="col-span-2 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Antes de guardar</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Efectivo</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {transactionType === 'credit_card_purchase' || transactionType === 'credit_card_refund'
                      ? 'No baja hoy'
                      : affectsBalance
                        ? 'Sí afecta'
                        : 'No afecta'}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tarjeta/deuda</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {transactionType === 'credit_card_purchase'
                      ? 'Sube saldo usado'
                      : transactionType === 'credit_card_payment'
                        ? 'Baja saldo usado'
                        : transactionType === 'debt_payment'
                          ? 'Baja adeudo'
                          : 'Sin impacto directo'}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monto</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {parsedAmountForPreview > 0 ? formatMoney(parsedAmountForPreview) : 'Pendiente'}
                  </p>
                </div>
              </div>
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
