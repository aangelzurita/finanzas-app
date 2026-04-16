'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { CardForm } from '@/components/cards/CardForm'
import { syncCardReminders } from '@/lib/card-reminders'
import { validateCard, parseCardData } from '@/lib/card-utils'

export default function NuevaTarjetaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('')

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

  const handleFieldChange = (field: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }))
  }

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

    const validation = validateCard(formValues)
    if (!validation.ok) return fail(validation.error!)

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user?.id

    if (!userId) return fail('No hay sesión activa.')

    const parsedData = parseCardData(formValues)

    const { data: accountData, error: accountError } = await supabase
      .from('accounts')
      .insert({
        user_id: userId,
        name: parsedData.name,
        account_type: 'credit_card',
        institution: parsedData.bank,
        initial_balance: 0,
        current_balance: parsedData.current_balance,
        currency_code: 'MXN',
        is_active: true,
        notes: 'Cuenta generada automáticamente para tarjeta de crédito',
      })
      .select('id')
      .single()

    if (accountError || !accountData) {
      fail(`Error al crear cuenta: ${accountError?.message || 'No se pudo crear la cuenta'}`)
      return
    }

    const { data: cardData, error: cardError } = await supabase
      .from('credit_cards')
      .insert({
        ...parsedData,
        user_id: userId,
        account_id: accountData.id,
        is_active: true,
        notes: null,
      })
      .select('id, name, statement_cutoff_day, payment_due_day')
      .single()

    if (cardError || !cardData) {
      await supabase.from('accounts').delete().eq('id', accountData.id)
      fail(`Error al crear tarjeta: ${cardError?.message || 'No se pudo crear la tarjeta'}`)
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
      fail(`La tarjeta se creó, pero no se pudieron sincronizar los recordatorios: ${reminderError?.message || 'Error desconocido'}`)
      return
    }

    setMessage('Tarjeta creada correctamente.')
    setMessageType('success')

    setTimeout(() => {
      router.push('/tarjetas')
      router.refresh()
    }, 700)
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
                <span className="text-slate-200 font-medium">Nueva</span>
              </nav>

              <h1 className="text-5xl font-extrabold tracking-tight">Nueva Tarjeta</h1>

              <p className="text-slate-400 mt-3 text-lg max-w-2xl">
                Registra tu nueva tarjeta de crédito para empezar a optimizar tus finanzas.
              </p>
            </div>

            <Link
              href="/tarjetas"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition shadow-lg active:scale-[0.98]"
            >
              Cerrar
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 -mt-8 pb-12">
        <CardForm
          title="Registro de Tarjeta"
          subtitle="Completa los datos tal como aparecen en tu estado de cuenta."
          submitLabel="Guardar tarjeta"
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