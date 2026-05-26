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
import {
  calculateFirstInstallmentPaymentDate,
  calculateMonthlyInstallment,
  calculateTotalAmount,
  createInstallmentPlan,
  type CreditCardInstallment,
  validateInstallmentDraft,
} from '@/lib/credit-card-installments'

type CreditCard = {
  id: string
  account_id: string
  name: string
  bank: string | null
  statement_cutoff_day: number
  payment_due_day: number
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

type MovementType = 'credit_card_purchase' | 'credit_card_payment' | 'credit_card_refund'

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
  const [installments, setInstallments] = useState<CreditCardInstallment[]>([])

  const [movementType, setMovementType] = useState<MovementType>(initialType)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [transactionDate, setTransactionDate] = useState('')
  const [sourceAccountId, setSourceAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [affectsBalance, setAffectsBalance] = useState(true)
  const [isMsi, setIsMsi] = useState(false)
  const [msiTimingMode, setMsiTimingMode] = useState<'new' | 'historical'>('new')
  const [msiCaptureMode, setMsiCaptureMode] = useState<'total' | 'monthly'>('total')
  const [installmentDescription, setInstallmentDescription] = useState('')
  const [installmentMonthlyAmount, setInstallmentMonthlyAmount] = useState('')
  const [installmentTotalMonths, setInstallmentTotalMonths] = useState('')
  const [installmentCurrentNumber, setInstallmentCurrentNumber] = useState('1')
  const [installmentChargeDay, setInstallmentChargeDay] = useState('')
  const [installmentStartDate, setInstallmentStartDate] = useState('')
  const [installmentNotes, setInstallmentNotes] = useState('')
  const [relatedInstallmentId, setRelatedInstallmentId] = useState('')
  const [cancelRemainingInstallments, setCancelRemainingInstallments] = useState(true)

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
      { data: installmentData, error: installmentError },
    ] = await Promise.all([
      supabase
        .from('credit_cards')
        .select('id, account_id, name, bank, statement_cutoff_day, payment_due_day')
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
      supabase
        .from('credit_card_installments')
        .select('*')
        .eq('credit_card_id', cardId)
        .eq('status', 'active')
        .order('charge_day'),
    ])

    if (cardError || categoriesError || accountsError || installmentError || !cardData) {
      setMessage(
        cardError?.message ||
        categoriesError?.message ||
        accountsError?.message ||
        installmentError?.message ||
        'No se pudo cargar la información'
      )
      setMessageType('error')
      setLoading(false)
      return
    }

    setCard(cardData as CreditCard)
    setCategories((categoriesData as Category[]) ?? [])
    setAccounts((accountsData as Account[]) ?? [])
    setInstallments((installmentData as CreditCardInstallment[]) ?? [])
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
    movementType === 'credit_card_purchase' && isMsi && msiCaptureMode === 'monthly'

  const firstMsiPaymentDate = useMemo(() => {
    if (!card || !transactionDate) return ''
    return calculateFirstInstallmentPaymentDate(transactionDate, {
      statementCutoffDay: card.statement_cutoff_day,
      paymentDueDay: card.payment_due_day,
    })
  }, [card, transactionDate])

  useEffect(() => {
    if (!card || movementType !== 'credit_card_purchase' || !isMsi) return

    setInstallmentChargeDay(String(card.payment_due_day))

    if (msiTimingMode === 'new') {
      setInstallmentCurrentNumber('1')
      setInstallmentStartDate(firstMsiPaymentDate)
    }
  }, [card, firstMsiPaymentDate, isMsi, movementType, msiTimingMode])

  const validate = () => {
    const parsedAmount =
      isMsi && movementType === 'credit_card_purchase'
        ? installmentTotalAmountPreview
        : Number(amount)

    if (!parsedAmount || parsedAmount <= 0) {
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

      if (isMsi) {
        const installmentValidation = validateInstallmentDraft({
          categoryId,
          totalAmount: installmentTotalAmountPreview,
          monthlyAmount: installmentMonthlyAmountPreview,
          totalMonths: Number(installmentTotalMonths),
          currentInstallmentNumber: Number(installmentCurrentNumber),
          chargeDay: Number(installmentChargeDay),
        })

        if (installmentValidation) {
          fail(installmentValidation)
          return false
        }

        if (msiCaptureMode === 'total' && Number(amount) > 0 && Number(installmentMonthlyAmount) > 0) {
          const expectedTotal = calculateTotalAmount(Number(installmentMonthlyAmount), Number(installmentTotalMonths))
          if (Math.abs(expectedTotal - Number(amount)) > 0.01) {
            fail('El monto total no coincide con la mensualidad y el número de meses del MSI.')
            return false
          }
        }
      }
    }

    if (movementType === 'credit_card_payment') {
      if (!sourceAccountId) {
        fail('Selecciona la cuenta desde la que pagas.')
        return false
      }
    }

    if (movementType === 'credit_card_refund') {
      if (cancelRemainingInstallments && !relatedInstallmentId) {
        fail('Selecciona el MSI que quieres cancelar con el reembolso.')
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
      amount: isMsi && movementType === 'credit_card_purchase' ? installmentTotalAmountPreview : Number(amount),
      source_account_id: movementType === 'credit_card_payment' ? sourceAccountId : card.account_id,
      destination_account_id: null,
      related_credit_card_id: card.id,
      related_debt_id: null,
      affects_balance: affectsBalance,
    })

    const payload: Record<string, unknown> = {
      user_id: userId,
      transaction_type: movementType,
      amount: preparedTx.amount,
      transaction_date: new Date(transactionDate).toISOString(),
      description: description || null,
      related_credit_card_id: card.id,
      status: 'completed',
      affects_balance: affectsBalance,
      affects_budget: movementType === 'credit_card_purchase',
      source_account_id: null,
      destination_account_id: null,
      category_id: null,
      related_debt_id: null,
      related_installment_id: null,
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

    if (movementType === 'credit_card_refund') {
      payload.related_installment_id = relatedInstallmentId || null
    }

    const { data: insertedTx, error } = await supabase
      .from('transactions')
      .insert(payload)
      .select('id, transaction_type, amount, source_account_id, destination_account_id, related_credit_card_id, related_debt_id, related_installment_id, affects_balance, applied_to_minimum_payment, applied_to_no_interest_payment')
      .single()

    if (error || !insertedTx) {
      fail(`Error: ${error?.message || 'No se pudo guardar el movimiento.'}`)
      return
    }

    try {
      await applyTransactionMetadata(supabase, insertedTx as TransactionLedgerEntry)

      if (movementType === 'credit_card_purchase' && isMsi) {
        await createInstallmentPlan(supabase, {
          userId,
          creditCardId: card.id,
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

      if (movementType === 'credit_card_refund' && cancelRemainingInstallments && relatedInstallmentId) {
        const { error: cancelError } = await supabase
          .from('credit_card_installments')
          .update({
            status: 'canceled',
            remaining_installments: 0,
            last_charge_date: new Date(transactionDate).toISOString().slice(0, 10),
          })
          .eq('id', relatedInstallmentId)

        if (cancelError) {
          throw new Error(cancelError.message)
        }
      }
    } catch (impactError) {
      await supabase.from('transactions').delete().eq('id', insertedTx.id)
      fail(impactError instanceof Error ? impactError.message : 'No se pudo aplicar el movimiento.')
      return
    }

    setMessage(
      movementType === 'credit_card_purchase'
        ? 'Compra registrada correctamente.'
        : movementType === 'credit_card_payment'
          ? 'Pago registrado correctamente.'
          : 'Reembolso registrado correctamente.'
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
                {movementType === 'credit_card_purchase'
                  ? 'Registrar compra'
                  : movementType === 'credit_card_payment'
                    ? 'Registrar pago'
                    : 'Registrar reembolso'}
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
                  onChange={(e) => {
                    setMovementType(e.target.value as MovementType)
                    setIsMsi(false)
                    setMsiTimingMode('new')
                    setMsiCaptureMode('total')
                  }}
                >
                  <option value="credit_card_purchase">Compra con TDC</option>
                  <option value="credit_card_payment">Pago de TDC</option>
                  <option value="credit_card_refund">Reembolso TDC</option>
                </select>
              </FormField>

              <FormField label="Monto">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required={!isMonthlyMsiCapture}
                    readOnly={isMonthlyMsiCapture}
                    className={`form-input pl-8 font-mono font-bold ${isMonthlyMsiCapture ? 'border-sky-100 bg-sky-50/60 text-slate-900' : movementType === 'credit_card_payment' ? 'text-emerald-600' : 'text-slate-900'}`}
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
                  <p className="mt-1.5 text-xs text-sky-700 font-medium">
                    Estamos calculando el total con la mensualidad por el número de meses.
                  </p>
                ) : null}
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
              <>
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
                  </div>
                </label>

                {isMsi ? (
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <FormField label="Tipo de MSI">
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
                        <p className="mt-2 text-xs font-medium text-slate-500">
                          {msiTimingMode === 'new'
                            ? 'Usamos la fecha de compra, el corte y el límite de pago de la tarjeta.'
                            : 'Úsalo para una compra que ya aparece en tu estado de cuenta.'}
                        </p>
                      </FormField>
                    </div>

                    <div className="md:col-span-2">
                      <FormField label="Capturar MSI por">
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
                        <p className="mt-2 text-xs font-medium text-slate-500">
                          {msiCaptureMode === 'monthly'
                            ? 'Escribe la mensualidad y los meses; el total se calcula solo.'
                            : 'Escribe el monto total de la compra. La mensualidad te ayuda a validarlo.'}
                        </p>
                      </FormField>
                    </div>

                    <FormField label="Meses totales">
                      <input
                        type="number"
                        min="1"
                        className="form-input"
                        value={installmentTotalMonths}
                        onChange={(e) => setInstallmentTotalMonths(e.target.value)}
                        placeholder="12"
                      />
                    </FormField>

                    <FormField label={msiCaptureMode === 'monthly' ? 'Mensualidad base' : 'Mensualidad'}>
                      <input
                        type="number"
                        step="0.01"
                        readOnly={msiCaptureMode === 'total'}
                        className={`form-input ${msiCaptureMode === 'total' ? 'border-sky-100 bg-sky-50/60 font-mono font-bold text-slate-900' : ''}`}
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
                        <p className="mt-1.5 text-xs text-sky-700 font-medium">
                          Se calcula dividiendo el monto total entre los meses.
                        </p>
                      ) : null}
                    </FormField>

                    <FormField label={msiCaptureMode === 'monthly' ? 'Total calculado' : 'Total de compra'}>
                      {msiCaptureMode === 'monthly' ? (
                        <div className="rounded-2xl border-2 border-sky-100 bg-sky-50/60 p-4 text-sm font-black text-slate-900">
                          {installmentTotalAmountPreview.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border-2 border-slate-100 bg-slate-50/60 p-4 text-sm font-bold text-slate-500">
                          Estamos usando el monto de arriba como total de compra.
                        </div>
                      )}
                    </FormField>

                    <FormField label={msiTimingMode === 'new' ? 'Mensualidad inicial' : 'Próxima mensualidad'}>
                      <input
                        type="number"
                        min="1"
                        className="form-input"
                        readOnly={msiTimingMode === 'new'}
                        value={installmentCurrentNumber}
                        onChange={(e) => setInstallmentCurrentNumber(e.target.value)}
                        placeholder="1"
                      />
                      {msiTimingMode === 'historical' ? (
                        <p className="mt-1.5 text-xs text-slate-500 font-medium">
                          Captura la mensualidad que sigue según tu estado de cuenta, por ejemplo 3 si va en 3/12.
                        </p>
                      ) : null}
                    </FormField>

                    <FormField label="Día límite de pago">
                      <input
                        type="number"
                        min="1"
                        max="31"
                        readOnly
                        className="form-input border-sky-100 bg-sky-50/60 font-mono font-bold text-slate-900"
                        value={installmentChargeDay}
                        onChange={() => undefined}
                        placeholder={card ? String(card.payment_due_day) : '15'}
                      />
                      <p className="mt-1.5 text-xs text-sky-700 font-medium">
                        Se toma automáticamente de la tarjeta.
                      </p>
                    </FormField>

                    <FormField label={msiTimingMode === 'new' ? 'Primera fecha límite de pago' : 'Fecha del próximo pago'}>
                      <input
                        type="date"
                        className="form-input"
                        readOnly={msiTimingMode === 'new'}
                        value={installmentStartDate}
                        onChange={(e) => setInstallmentStartDate(e.target.value)}
                      />
                      {msiTimingMode === 'new' && card ? (
                        <p className="mt-1.5 text-xs text-sky-700 font-medium">
                          Corte día {card.statement_cutoff_day}; pago límite día {card.payment_due_day}.
                        </p>
                      ) : null}
                    </FormField>

                    <FormField label="Descripción MSI">
                      <input
                        type="text"
                        className="form-input"
                        value={installmentDescription}
                        onChange={(e) => setInstallmentDescription(e.target.value)}
                        placeholder="Si la dejas vacía, usamos la descripción de la compra"
                      />
                    </FormField>

                    <div className="md:col-span-2 rounded-2xl border-2 border-sky-100 bg-sky-50/60 p-4 text-sm font-bold text-slate-700">
                      Total calculado: {installmentTotalAmountPreview.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} · Mensualidad: {installmentMonthlyAmountPreview.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                    </div>

                    <FormField label="Notas MSI">
                      <input
                        type="text"
                        className="form-input"
                        value={installmentNotes}
                        onChange={(e) => setInstallmentNotes(e.target.value)}
                        placeholder="Promoción, referencia o detalle del plan"
                      />
                    </FormField>
                  </div>
                ) : null}
              </>
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

            {movementType === 'credit_card_refund' && (
              <>
                <FormField label="MSI relacionado (opcional)" helper="Úsalo si el reembolso corresponde a una compra MSI">
                  <select
                    className="form-input"
                    value={relatedInstallmentId}
                    onChange={(e) => setRelatedInstallmentId(e.target.value)}
                  >
                    <option value="">Sin MSI relacionado</option>
                    {installments.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.description} ({plan.current_installment_number}/{plan.total_months})
                      </option>
                    ))}
                  </select>
                </FormField>

                <label className="flex items-start gap-3 rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-4">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    checked={cancelRemainingInstallments}
                    onChange={(e) => setCancelRemainingInstallments(e.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-900">Cancelar mensualidades restantes del MSI</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Actívalo cuando el comercio devolvió por completo la compra y ya no deben seguir corriendo mensualidades.
                    </p>
                  </div>
                </label>
              </>
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

            <label className="flex items-start gap-3 rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-4">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                checked={affectsBalance}
                onChange={(e) => setAffectsBalance(e.target.checked)}
              />
              <div>
                <p className="text-sm font-bold text-slate-900">Impactar saldo y pendientes de la tarjeta</p>
                <p className="mt-1 text-xs text-slate-500">
                  Desactívalo para capturar compras, pagos o reembolsos históricos que ya venían reflejados en el saldo usado,
                  pago mínimo o para no generar intereses.
                </p>
              </div>
            </label>
          </div>

          <div className="mt-12 flex flex-col gap-4">
            <button
              type="submit"
              disabled={saving}
              className={`w-full rounded-2xl py-4 font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 ${movementType === 'credit_card_payment' ? 'bg-sky-600 hover:bg-sky-700 text-white' : movementType === 'credit_card_refund' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-slate-900 hover:bg-black text-white'
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
