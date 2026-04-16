'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { InstallmentPlanForm } from '@/components/cards/InstallmentPlanForm'
import {
  calculateMonthlyInstallment,
  calculateRemainingInstallments,
  inferInstallmentStartDate,
} from '@/lib/credit-card-installments'

type Category = {
  id: string
  name: string
}

export default function NuevoMsiPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const cardId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('')
  const [categories, setCategories] = useState<Category[]>([])
  const [values, setValues] = useState({
    description: '',
    categoryId: '',
    totalAmount: '',
    totalMonths: '',
    currentInstallmentNumber: '1',
    chargeDay: '',
    startDate: '',
    notes: '',
    status: 'active' as const,
  })

  const initialize = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      router.push('/')
      return
    }

    const { data, error } = await supabase
      .from('categories')
      .select('id, name')
      .eq('category_type', 'expense')
      .eq('is_active', true)
      .order('name')

    if (error) {
      fail(error.message)
      setLoading(false)
      return
    }

    setCategories((data as Category[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId])

  const monthlyAmountPreview = useMemo(
    () => calculateMonthlyInstallment(Number(values.totalAmount), Number(values.totalMonths)),
    [values.totalAmount, values.totalMonths]
  )

  const remainingPreview = useMemo(
    () => calculateRemainingInstallments(Number(values.totalMonths), Number(values.currentInstallmentNumber)),
    [values.totalMonths, values.currentInstallmentNumber]
  )

  const fail = (text: string) => {
    setMessage(text)
    setMessageType('error')
    setSaving(false)
  }

  const onChange = (field: keyof typeof values, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  const validate = () => {
    if (!values.description.trim()) return fail('Ingresa una descripción para el MSI.'), false
    if (!values.categoryId) return fail('Selecciona una categoría para el MSI.'), false
    if (!values.totalAmount || Number(values.totalAmount) <= 0) return fail('Ingresa un monto total válido.'), false
    if (!values.totalMonths || Number(values.totalMonths) <= 0) return fail('Ingresa los meses totales.'), false

    const currentInstallment = Number(values.currentInstallmentNumber)
    const totalMonths = Number(values.totalMonths)
    if (!currentInstallment || currentInstallment < 1 || currentInstallment > totalMonths) {
      return fail('La mensualidad actual debe estar entre 1 y el total de meses.'), false
    }

    if (!values.chargeDay || Number(values.chargeDay) < 1 || Number(values.chargeDay) > 31) {
      return fail('Ingresa un día de cargo válido entre 1 y 31.'), false
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

    const totalAmount = Number(values.totalAmount)
    const totalMonths = Number(values.totalMonths)
    const currentInstallmentNumber = Number(values.currentInstallmentNumber)
    const chargeDay = Number(values.chargeDay)
    const startDate = values.startDate || inferInstallmentStartDate(currentInstallmentNumber, chargeDay)

    const { error } = await supabase
      .from('credit_card_installments')
      .insert({
        user_id: userId,
        credit_card_id: cardId,
        category_id: values.categoryId,
        description: values.description.trim(),
        total_amount: totalAmount,
        monthly_amount: calculateMonthlyInstallment(totalAmount, totalMonths),
        total_months: totalMonths,
        current_installment_number: currentInstallmentNumber,
        remaining_installments: calculateRemainingInstallments(totalMonths, currentInstallmentNumber),
        last_processed_installment_number: Math.max(0, currentInstallmentNumber - 1),
        charge_day: chargeDay,
        start_date: startDate,
        last_charge_date: null,
        notes: values.notes.trim() || null,
        status: 'active',
      })

    if (error) {
      fail(error.message)
      return
    }

    setMessage('MSI registrado correctamente.')
    setMessageType('success')

    setTimeout(() => {
      router.push(`/tarjetas/${cardId}`)
      router.refresh()
    }, 700)
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-12">
      {loading ? (
        <section className="min-h-screen flex items-center justify-center">
          <p className="text-slate-500 font-medium">Cargando formulario MSI...</p>
        </section>
      ) : (
        <>
          <section className="bg-slate-950 text-white">
            <div className="max-w-3xl mx-auto px-6 py-12">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                    <Link href="/" className="hover:text-white transition">Home</Link>
                    <span>/</span>
                    <Link href="/tarjetas" className="hover:text-white transition">Tarjetas</Link>
                    <span>/</span>
                    <span className="text-slate-200 font-medium">Nuevo MSI</span>
                  </nav>
                  <h1 className="text-5xl font-extrabold tracking-tight">Nuevo MSI</h1>
                  <p className="text-slate-400 mt-3 text-lg">
                    Registra una compra a meses ligada a esta tarjeta.
                  </p>
                </div>

                <Link
                  href={`/tarjetas/${cardId}`}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition-all active:scale-95 shadow-lg"
                >
                  Cerrar
                </Link>
              </div>
            </div>
          </section>

          <section className="max-w-3xl mx-auto px-6 -mt-8">
            <InstallmentPlanForm
              title="Plan MSI"
              subtitle="Captura el plan tal como aparece en el estado de cuenta."
              submitLabel="Guardar MSI"
              values={values}
              categories={categories}
              monthlyAmountPreview={monthlyAmountPreview}
              remainingInstallmentsPreview={remainingPreview}
              onChange={onChange}
              onSubmit={handleSubmit}
              saving={saving}
              message={message}
              messageType={messageType}
            />
          </section>
        </>
      )}
    </main>
  )
}
