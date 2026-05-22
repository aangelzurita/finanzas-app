'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { InstallmentPlanForm } from '@/components/cards/InstallmentPlanForm'
import {
  calculateTotalAmount,
  calculateMonthlyInstallment,
  calculateRemainingInstallments,
  inferInstallmentStartDate,
} from '@/lib/credit-card-installments'

type Category = {
  id: string
  name: string
}

export default function EditarMsiPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const cardId = params.id as string
  const installmentId = params.installmentId as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('')
  const [lastProcessedInstallmentNumber, setLastProcessedInstallmentNumber] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [values, setValues] = useState({
    description: '',
    categoryId: '',
    totalAmount: '',
    monthlyAmount: '',
    totalMonths: '',
    currentInstallmentNumber: '1',
    chargeDay: '',
    startDate: '',
    notes: '',
    status: 'active' as 'active' | 'completed' | 'canceled',
  })

  const initialize = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      router.push('/')
      return
    }

    const [{ data, error }, { data: categoriesData, error: categoriesError }] = await Promise.all([
      supabase
      .from('credit_card_installments')
      .select('*')
      .eq('id', installmentId)
      .single(),
      supabase
      .from('categories')
      .select('id, name')
      .eq('category_type', 'expense')
      .eq('is_active', true)
      .order('name'),
    ])

    if (categoriesError) {
      setMessage(categoriesError.message)
      setMessageType('error')
      setLoading(false)
      return
    }

    setCategories((categoriesData as Category[]) ?? [])

    if (error || !data) {
      setMessage(error?.message || 'No se pudo cargar el MSI.')
      setMessageType('error')
      setLoading(false)
      return
    }

    setValues({
      description: data.description ?? '',
      categoryId: data.category_id ?? '',
      totalAmount: String(data.total_amount ?? ''),
      monthlyAmount: String(data.monthly_amount ?? ''),
      totalMonths: String(data.total_months ?? ''),
      currentInstallmentNumber: String(data.current_installment_number ?? '1'),
      chargeDay: String(data.charge_day ?? ''),
      startDate: data.start_date ?? '',
      notes: data.notes ?? '',
      status: data.status ?? 'active',
    })
    setLastProcessedInstallmentNumber(Number(data.last_processed_installment_number ?? Math.max(0, Number(data.current_installment_number ?? 1) - 1)))

    setLoading(false)
  }

  useEffect(() => {
    void initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installmentId])

  const monthlyAmountPreview = useMemo(() => {
    const monthlyAmount = Number(values.monthlyAmount)
    if (monthlyAmount > 0) return monthlyAmount
    return calculateMonthlyInstallment(Number(values.totalAmount), Number(values.totalMonths))
  }, [values.monthlyAmount, values.totalAmount, values.totalMonths])

  const totalAmountPreview = useMemo(() => {
    const totalAmount = Number(values.totalAmount)
    if (totalAmount > 0) return totalAmount
    return calculateTotalAmount(Number(values.monthlyAmount), Number(values.totalMonths))
  }, [values.totalAmount, values.monthlyAmount, values.totalMonths])

  const remainingPreview = useMemo(
    () => calculateRemainingInstallments(Number(values.totalMonths), Number(values.currentInstallmentNumber)),
    [values.totalMonths, values.currentInstallmentNumber]
  )

  const onChange = (field: keyof typeof values, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  const fail = (text: string) => {
    setMessage(text)
    setMessageType('error')
    setSaving(false)
  }

  const validate = () => {
    if (!values.description.trim()) return fail('Ingresa una descripción para el MSI.'), false
    if (!values.categoryId) return fail('Selecciona una categoría para el MSI.'), false
    if (!values.totalMonths || Number(values.totalMonths) <= 0) return fail('Ingresa los meses totales.'), false
    if (totalAmountPreview <= 0) return fail('Ingresa un monto total o una mensualidad válida.'), false
    if (monthlyAmountPreview <= 0) return fail('Ingresa una mensualidad o un monto total válido.'), false

    if (Number(values.totalAmount) > 0 && Number(values.monthlyAmount) > 0) {
      const expectedTotal = calculateTotalAmount(Number(values.monthlyAmount), Number(values.totalMonths))
      if (Math.abs(expectedTotal - Number(values.totalAmount)) > 0.01) {
        return fail('El monto total no coincide con la mensualidad y el número de meses.'), false
      }
    }

    const currentInstallment = Number(values.currentInstallmentNumber)
    const totalMonths = Number(values.totalMonths)
    if (!currentInstallment || currentInstallment < 1 || currentInstallment > totalMonths) {
      return fail('La próxima mensualidad debe estar entre 1 y el total de meses.'), false
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

    const totalAmount = totalAmountPreview
    const totalMonths = Number(values.totalMonths)
    const currentInstallmentNumber = Number(values.currentInstallmentNumber)
    const chargeDay = Number(values.chargeDay)
    const startDate = values.startDate || inferInstallmentStartDate(currentInstallmentNumber, chargeDay)
    const nextLastProcessedInstallmentNumber =
      values.status === 'completed'
        ? totalMonths
        : values.status === 'canceled'
          ? lastProcessedInstallmentNumber
          : Math.max(lastProcessedInstallmentNumber, Math.max(0, currentInstallmentNumber - 1))

    const { error } = await supabase
      .from('credit_card_installments')
      .update({
        description: values.description.trim(),
        category_id: values.categoryId,
        total_amount: totalAmount,
        monthly_amount: monthlyAmountPreview,
        total_months: totalMonths,
        current_installment_number: currentInstallmentNumber,
        remaining_installments: Math.max(0, totalMonths - nextLastProcessedInstallmentNumber),
        last_processed_installment_number: nextLastProcessedInstallmentNumber,
        charge_day: chargeDay,
        start_date: startDate,
        notes: values.notes.trim() || null,
        status: values.status,
      })
      .eq('id', installmentId)

    if (error) {
      fail(error.message)
      return
    }

    setMessage('MSI actualizado correctamente.')
    setMessageType('success')

    setTimeout(() => {
      router.push(`/tarjetas/${cardId}`)
      router.refresh()
    }, 700)
  }

  const handleDelete = async () => {
    if (!confirm('¿Seguro que quieres eliminar este MSI? Esta acción no se puede deshacer.')) return

    setDeleting(true)
    setMessage('')
    setMessageType('')

    const { error } = await supabase
      .from('credit_card_installments')
      .delete()
      .eq('id', installmentId)

    if (error) {
      setMessage(error.message)
      setMessageType('error')
      setDeleting(false)
      return
    }

    setMessage('MSI eliminado correctamente.')
    setMessageType('success')

    setTimeout(() => {
      router.push(`/tarjetas/${cardId}`)
      router.refresh()
    }, 500)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Cargando MSI...</p>
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
                <Link href="/tarjetas" className="hover:text-white transition">Tarjetas</Link>
                <span>/</span>
                <span className="text-slate-200 font-medium">Editar MSI</span>
              </nav>
              <h1 className="text-5xl font-extrabold tracking-tight">Editar MSI</h1>
              <p className="text-slate-400 mt-3 text-lg">
                Ajusta el avance y el estado del plan ligado a esta tarjeta.
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
          title="Editar plan MSI"
          subtitle="Mantén alineado el avance mensual con el estado real de la compra."
          submitLabel="Guardar cambios"
          values={values}
          categories={categories}
          monthlyAmountPreview={monthlyAmountPreview}
          totalAmountPreview={totalAmountPreview}
          remainingInstallmentsPreview={remainingPreview}
          onChange={onChange}
          onSubmit={handleSubmit}
          saving={saving}
          message={message}
          messageType={messageType}
          allowStatus
        />

        <div className="mt-4 rounded-[2rem] border border-rose-100 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-slate-900">Eliminar MSI</p>
          <p className="mt-1 text-sm text-slate-500">
            Úsalo para limpiar planes duplicados o compras a MSI que ya no deben aparecer en pendientes.
          </p>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || saving}
            className="mt-4 w-full rounded-2xl bg-rose-600 py-4 text-sm font-black text-white transition-all hover:bg-rose-700 disabled:opacity-50"
          >
            {deleting ? 'ELIMINANDO MSI...' : 'ELIMINAR MSI'}
          </button>
        </div>
      </section>
    </main>
  )
}
