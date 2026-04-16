'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { calculateNextChargeDate, type RecurringFrequency } from '@/lib/recurring-charges'
import { syncRecurringReminders } from '@/lib/recurring-reminders'

type Category = {
  id: string
  name: string
}

type Account = {
  id: string
  name: string
  account_type: string
}

type CreditCard = {
  id: string
  name: string
}

export default function NuevoRecurrentePage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('')

  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [chargeDay, setChargeDay] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paymentMethodType, setPaymentMethodType] = useState<'account' | 'credit_card'>('credit_card')
  const [accountId, setAccountId] = useState('')
  const [creditCardId, setCreditCardId] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [createReminder, setCreateReminder] = useState(true)

  useEffect(() => {
    void initialize()
  }, [])

  const initialize = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      router.push('/')
      return
    }

    const [{ data: categoriesData }, { data: accountsData }, { data: cardsData }] =
      await Promise.all([
        supabase
          .from('categories')
          .select('id, name')
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
          .from('credit_cards')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
      ])

    setCategories((categoriesData as Category[]) ?? [])
    setAccounts((accountsData as Account[]) ?? [])
    setCards((cardsData as CreditCard[]) ?? [])
    setLoading(false)
  }

  const nextChargePreview = useMemo(() => {
    return calculateNextChargeDate(frequency, chargeDay ? Number(chargeDay) : null)
  }, [frequency, chargeDay])

  const fail = (text: string) => {
    setMessage(text)
    setMessageType('error')
    setSaving(false)
  }

  const validate = () => {
    if (!name.trim()) return fail('Ingresa el nombre del cargo.'), false
    if (!amount || Number(amount) <= 0) return fail('Ingresa un monto válido.'), false

    if (['monthly', 'quarterly', 'yearly'].includes(frequency)) {
      if (!chargeDay || Number(chargeDay) < 1 || Number(chargeDay) > 31) {
        return fail('Ingresa un día de cobro válido entre 1 y 31.'), false
      }
    }

    if (paymentMethodType === 'account' && !accountId) {
      return fail('Selecciona una cuenta.'), false
    }

    if (paymentMethodType === 'credit_card' && !creditCardId) {
      return fail('Selecciona una tarjeta.'), false
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

    if (!userId) {
      fail('No hay sesión activa.')
      return
    }

    const { data, error } = await supabase
      .from('recurring_charges')
      .insert({
        user_id: userId,
        name: name.trim(),
        description: description || null,
        amount: Number(amount),
        frequency,
        charge_day: chargeDay ? Number(chargeDay) : null,
        category_id: categoryId || null,
        payment_method_type: paymentMethodType,
        account_id: paymentMethodType === 'account' ? accountId : null,
        credit_card_id: paymentMethodType === 'credit_card' ? creditCardId : null,
        next_charge_date: nextChargePreview,
        is_active: isActive,
        create_reminder: createReminder,
      })
      .select('id')
      .single()

    if (error) {
      fail(error.message)
      return
    }

    // NEW: Sync reminder
    try {
      if (data?.id) {
        await syncRecurringReminders(supabase, userId, data.id)
      }
    } catch (syncErr: any) {
      console.error('Error syncing reminder detail:', {
        message: syncErr?.message || 'Error desconocido',
        error: syncErr
      })
    }


    setMessage('Cargo recurrente creado correctamente.')
    setMessageType('success')

    setTimeout(() => {
      router.push('/recurrentes')
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
                <span className="text-slate-200 font-medium">Nuevo</span>
              </nav>
              <h1 className="text-5xl font-extrabold tracking-tight">Nuevo Cargo</h1>
              <p className="text-slate-400 mt-3 text-lg">
                Registra tus suscripciones y pagos automáticos.
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
          <div className="mb-8 border-b border-slate-100 pb-6">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Detalles del Cargo</h2>
            <p className="text-slate-400 text-sm mt-1">Ingresa la información tal como aparece en tu comprobante.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-6">
              <Field label="Nombre del cargo">
                <input
                  autoFocus
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 placeholder:text-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                  placeholder="Ej. Netflix, Spotify, Gimnasio"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>

              <Field label="Descripción (opcional)">
                <input
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-medium text-slate-700 placeholder:text-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                  placeholder="Más detalles..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>

              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Monto">
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 pl-10 pr-5 py-4 font-black text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                </Field>

                <Field label="Frecuencia">
                  <select
                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all appearance-none"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                  >
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="monthly">Mensual</option>
                    <option value="quarterly">Trimestral</option>
                    <option value="yearly">Anual</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Día de cobro">
                  <input
                    type="number"
                    min="1"
                    max="31"
                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                    placeholder="1-31"
                    value={chargeDay}
                    onChange={(e) => setChargeDay(e.target.value)}
                  />
                </Field>

                <Field label="Próximo cobro (estimado)">
                  <div className="rounded-2xl border-2 border-slate-100 bg-slate-100 px-5 py-4 font-bold text-slate-500">
                    {nextChargePreview || '---'}
                  </div>
                </Field>
              </div>

              <Field label="Categoría">
                <select
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all appearance-none"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Sin categoría</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Método de pago">
                  <select
                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all appearance-none"
                    value={paymentMethodType}
                    onChange={(e) => setPaymentMethodType(e.target.value as 'account' | 'credit_card')}
                  >
                    <option value="credit_card">Tarjeta de crédito</option>
                    <option value="account">Cuenta de débito/efectivo</option>
                  </select>
                </Field>

                {paymentMethodType === 'account' && (
                  <Field label="Selecciona la Cuenta">
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
                )}

                {paymentMethodType === 'credit_card' && (
                  <Field label="Selecciona la Tarjeta">
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
              </div>

              <div className="flex flex-col gap-4 p-6 rounded-[2rem] border-2 border-slate-100 bg-slate-50/50 md:flex-row">
                <label className="flex flex-1 items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="peer hidden"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-emerald-500 transition-colors"></div>
                    <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5"></div>
                  </div>
                  <div>
                    <span className="block text-sm font-black text-slate-900 uppercase">Estado Activo</span>
                    <span className="block text-xs text-slate-400">El cargo se procesará</span>
                  </div>
                </label>

                <label className="flex flex-1 items-center gap-4 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="peer hidden"
                      checked={createReminder}
                      onChange={(e) => setCreateReminder(e.target.checked)}
                    />
                    <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-sky-500 transition-colors"></div>
                    <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5"></div>
                  </div>
                  <div>
                    <span className="block text-sm font-black text-slate-900 uppercase">Recordatorio</span>
                    <span className="block text-xs text-slate-400">Recibir notificaciones</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-[2rem] bg-slate-900 py-6 text-xl font-black text-white hover:bg-slate-800 transition-all active:scale-[0.98] shadow-xl disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Crear Cargo Recurrente'}
              </button>

              {message && (
                <div className={`mt-6 rounded-2xl p-4 text-center text-sm font-bold ${messageType === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                  }`}>
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
