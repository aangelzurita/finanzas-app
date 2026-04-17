'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { CardForm } from '@/components/cards/CardForm'
import { syncCardReminders } from '@/lib/card-reminders'
import { validateCard, parseCardData } from '@/lib/card-utils'

export default function EditarTarjetaPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const cardId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('')

  const [accountId, setAccountId] = useState('')

  const [formValues, setFormValues] = useState({
    name: '',
    bank: '',
    creditLimit: '',
    currentBalance: '',
    statementCutoffDay: '',
    paymentDueDay: '',
    minimumPayment: '',
    noInterestPayment: '',
    annualInterestRate: '',
  })

  useEffect(() => {
    void initialize()
  }, [cardId])

  const handleFieldChange = (field: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }))
  }

  const fail = (text: string) => {
    setMessage(text)
    setMessageType('error')
    setSaving(false)
  }

  const initialize = async () => {
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData.session) {
      router.push('/')
      return
    }

    const { data, error } = await supabase
      .from('credit_cards')
      .select(`
        id,
        account_id,
        name,
        bank,
        statement_cutoff_day,
        payment_due_day,
        annual_interest_rate,
        minimum_payment,
        no_interest_payment,
        credit_limit,
        current_balance
      `)
      .eq('id', cardId)
      .single()

    if (error || !data) {
      setMessage(error?.message || 'No se pudo cargar la tarjeta.')
      setMessageType('error')
      setLoading(false)
      return
    }

    setAccountId(data.account_id)
    setFormValues({
      name: data.name ?? '',
      bank: data.bank ?? '',
      creditLimit: String(data.credit_limit ?? ''),
      currentBalance: String(data.current_balance ?? ''),
      statementCutoffDay: String(data.statement_cutoff_day ?? ''),
      paymentDueDay: String(data.payment_due_day ?? ''),
      minimumPayment: String(data.minimum_payment ?? ''),
      noInterestPayment: String(data.no_interest_payment ?? ''),
      annualInterestRate: String(data.annual_interest_rate ?? ''),
    })

    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setMessageType('')

    const validation = validateCard(formValues)
    if (!validation.ok) return fail(validation.error!)

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user?.id

    if (!userId) return fail('No hay sesión activa.')

    const parsedData = parseCardData(formValues)

    const { error: accountError } = await supabase
      .from('accounts')
      .update({
        name: parsedData.name,
        institution: parsedData.bank,
        initial_balance: parsedData.current_balance,
        current_balance: parsedData.current_balance,
      })
      .eq('id', accountId)

    if (accountError) {
      fail(`Error al actualizar cuenta: ${accountError.message}`)
      return
    }

    const { data: cardData, error: cardError } = await supabase
      .from('credit_cards')
      .update(parsedData)
      .eq('id', cardId)
      .select('id, name, statement_cutoff_day, payment_due_day')
      .single()

    if (cardError || !cardData) {
      fail(`Error al actualizar tarjeta: ${cardError?.message || 'No se pudo actualizar la tarjeta'}`)
      return
    }

    try {
      await syncCardReminders(supabase, userId, [
        {
          id: cardData.id,
          name: cardData.name,
          statement_cutoff_day: cardData.statement_cutoff_day,
          payment_due_day: cardData.payment_due_day,
        },
      ])
    } catch (reminderError: any) {
      fail(`La tarjeta se actualizó, pero no se pudieron sincronizar los recordatorios: ${reminderError?.message || 'Error desconocido'}`)
      return
    }

    setMessage('Tarjeta actualizada correctamente.')
    setMessageType('success')

    setTimeout(() => {
      router.push('/tarjetas')
      router.refresh()
    }, 700)
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
                <span className="text-slate-200 font-medium">Editar</span>
              </nav>

              <h1 className="text-5xl font-extrabold tracking-tight">Editar Tarjeta</h1>

              <p className="text-slate-400 mt-3 text-lg max-w-2xl">
                Actualiza la información de tu tarjeta y mantén tus recordatorios sincronizados.
              </p>
            </div>

            <Link
              href="/tarjetas"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition-all active:scale-95 shadow-lg"
            >
              Cerrar
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 -mt-8 pb-12">
        <CardForm
          title="Editar Tarjeta"
          subtitle="Modifica los datos tal como aparecen en tu estado de cuenta."
          submitLabel="Guardar cambios"
          values={formValues}
          onChange={handleFieldChange}
          onSave={handleSubmit}
          saving={saving}
          message={message}
          messageType={messageType}
        />
      </section>
    </main>
  )
}
