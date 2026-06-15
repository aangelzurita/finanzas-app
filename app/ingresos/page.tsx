'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { KpiCard } from '@/components/ui/KpiCard'
import {
  buildIncomeScheduleEvents,
  getNextIncomeScheduleDateAfter,
  type IncomeSchedule,
  type IncomeScheduleConfidence,
  type IncomeScheduleFrequency,
  type IncomeScheduleVariability,
} from '@/lib/financial-calendar'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatMoney } from '@/lib/utils'

type Account = {
  id: string
  name: string
  account_type: string
}

type Category = {
  id: string
  name: string
  category_type: string
}

type IncomeForm = {
  name: string
  amount: string
  frequency: IncomeScheduleFrequency
  expected_day: string
  second_expected_day: string
  next_income_date: string
  account_id: string
  category_id: string
  variability: IncomeScheduleVariability
  confidence: IncomeScheduleConfidence
  starts_at: string
  ends_at: string
  notes: string
}

const emptyForm: IncomeForm = {
  name: '',
  amount: '',
  frequency: 'biweekly',
  expected_day: '',
  second_expected_day: '',
  next_income_date: new Date().toISOString().slice(0, 10),
  account_id: '',
  category_id: '',
  variability: 'fixed',
  confidence: 'expected',
  starts_at: '',
  ends_at: '',
  notes: '',
}

const frequencyLabels: Record<IncomeScheduleFrequency, string> = {
  one_time: 'Único',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  custom_days: 'Días del mes',
}

const variabilityLabels: Record<IncomeScheduleVariability, string> = {
  fixed: 'Fijo',
  variable: 'Variable',
  bonus: 'Bono',
}

const confidenceLabels: Record<IncomeScheduleConfidence, string> = {
  confirmed: 'Confirmado',
  expected: 'Esperado',
  tentative: 'Tentativo',
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function parseDateOnly(value: string) {
  return new Date(`${value}T12:00:00`)
}

function todayDateOnly() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function isPastIncomeDate(value: string) {
  return parseDateOnly(value) < todayDateOnly()
}

function toForm(schedule: IncomeSchedule): IncomeForm {
  return {
    name: schedule.name,
    amount: String(schedule.amount ?? ''),
    frequency: schedule.frequency,
    expected_day: schedule.expected_day ? String(schedule.expected_day) : '',
    second_expected_day: schedule.second_expected_day ? String(schedule.second_expected_day) : '',
    next_income_date: schedule.next_income_date,
    account_id: schedule.account_id || '',
    category_id: schedule.category_id || '',
    variability: schedule.variability,
    confidence: schedule.confidence,
    starts_at: schedule.starts_at || '',
    ends_at: schedule.ends_at || '',
    notes: schedule.notes || '',
  }
}

export default function IngresosPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [schedules, setSchedules] = useState<IncomeSchedule[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<IncomeForm>(emptyForm)

  const loadData = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      window.location.href = '/'
      return
    }

    const [
      { data: schedulesData, error: schedulesError },
      { data: accountsData, error: accountsError },
      { data: categoriesData, error: categoriesError },
    ] = await Promise.all([
      supabase
        .from('income_schedules')
        .select('*')
        .order('is_active', { ascending: false })
        .order('next_income_date', { ascending: true }),
      supabase
        .from('accounts')
        .select('id, name, account_type')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('categories')
        .select('id, name, category_type')
        .eq('is_active', true)
        .eq('category_type', 'income')
        .order('name'),
    ])

    if (schedulesError || accountsError || categoriesError) {
      setMessage(
        schedulesError?.message ||
        accountsError?.message ||
        categoriesError?.message ||
        'No se pudieron cargar los ingresos programados.'
      )
    }

    setSchedules((schedulesData as IncomeSchedule[]) ?? [])
    setAccounts((accountsData as Account[]) ?? [])
    setCategories((categoriesData as Category[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
  }, [loadData])

  const accountMap = useMemo(() => {
    const map = new Map<string, string>()
    accounts.forEach((account) => map.set(account.id, account.name))
    return map
  }, [accounts])

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach((category) => map.set(category.id, category.name))
    return map
  }, [categories])

  const futureEvents = useMemo(
    () =>
      buildIncomeScheduleEvents(schedules, {
        from: new Date(),
        to: addDays(new Date(), 60),
        maxEventsPerSchedule: 10,
      }),
    [schedules]
  )

  const nextThirtyDaysAmount = useMemo(() => {
    const limit = addDays(new Date(), 30)
    return futureEvents
      .filter((event) => new Date(`${event.date}T12:00:00`) <= limit)
      .reduce((acc, event) => acc + Number(event.amount || 0), 0)
  }, [futureEvents])

  const activeCount = schedules.filter((schedule) => schedule.is_active).length
  const nextEvent = futureEvents[0]

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
  }

  const validateForm = () => {
    if (!form.name.trim()) return 'Escribe un nombre para el ingreso.'
    if (Number(form.amount) <= 0) return 'El monto debe ser mayor a cero.'
    if (!form.next_income_date) return 'Define la próxima fecha esperada.'
    if (form.expected_day && (Number(form.expected_day) < 1 || Number(form.expected_day) > 31)) {
      return 'El primer día esperado debe estar entre 1 y 31.'
    }
    if (form.second_expected_day && (Number(form.second_expected_day) < 1 || Number(form.second_expected_day) > 31)) {
      return 'El segundo día esperado debe estar entre 1 y 31.'
    }
    if (form.frequency === 'custom_days' && !form.expected_day && !form.second_expected_day) {
      return 'Para días del mes, registra al menos un día esperado.'
    }
    if (form.starts_at && form.ends_at && form.ends_at < form.starts_at) {
      return 'La fecha final no puede ser anterior a la fecha inicial.'
    }
    return ''
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const validationError = validateForm()
    if (validationError) {
      setMessage(validationError)
      setSaving(false)
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) {
      setMessage('No hay sesión activa.')
      setSaving(false)
      return
    }

    const payload = {
      name: form.name.trim(),
      amount: Number(form.amount),
      frequency: form.frequency,
      expected_day: form.expected_day ? Number(form.expected_day) : null,
      second_expected_day: form.second_expected_day ? Number(form.second_expected_day) : null,
      next_income_date: form.next_income_date,
      account_id: form.account_id || null,
      category_id: form.category_id || null,
      variability: form.variability,
      confidence: form.confidence,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      notes: form.notes.trim() || null,
    }

    const query = editingId
      ? supabase.from('income_schedules').update(payload).eq('id', editingId)
      : supabase.from('income_schedules').insert({ ...payload, user_id: userId })

    const { error } = await query

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    resetForm()
    await loadData()
    setMessage(editingId ? 'Ingreso programado actualizado.' : 'Ingreso programado creado.')
    setSaving(false)
  }

  const handleEdit = (schedule: IncomeSchedule) => {
    setEditingId(schedule.id)
    setForm(toForm(schedule))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleToggle = async (schedule: IncomeSchedule) => {
    const { error } = await supabase
      .from('income_schedules')
      .update({ is_active: !schedule.is_active })
      .eq('id', schedule.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setSchedules((prev) =>
      prev.map((item) =>
        item.id === schedule.id ? { ...item, is_active: !item.is_active } : item
      )
    )
  }

  const handleMarkReceived = async (schedule: IncomeSchedule) => {
    setMessage('')
    const nextDate = getNextIncomeScheduleDateAfter(schedule, new Date())
    const payload = nextDate
      ? { next_income_date: nextDate, is_active: true }
      : { is_active: false }

    const { error } = await supabase
      .from('income_schedules')
      .update(payload)
      .eq('id', schedule.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setSchedules((prev) =>
      prev.map((item) =>
        item.id === schedule.id
          ? { ...item, ...payload }
          : item
      )
    )
    setMessage(
      nextDate
        ? `Ingreso "${schedule.name}" marcado como recibido. Próxima fecha: ${formatDate(nextDate)}.`
        : `Ingreso "${schedule.name}" marcado como recibido y desactivado.`
    )
  }

  const handleDelete = async (schedule: IncomeSchedule) => {
    const ok = window.confirm(`¿Eliminar el ingreso programado "${schedule.name}"? Esto no elimina movimientos reales.`)
    if (!ok) return

    const { error } = await supabase
      .from('income_schedules')
      .delete()
      .eq('id', schedule.id)

    if (error) {
      setMessage(error.message)
      return
    }

    if (editingId === schedule.id) resetForm()
    setSchedules((prev) => prev.filter((item) => item.id !== schedule.id))
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Cargando ingresos programados...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-12">
      <section className="bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                <Link href="/" className="hover:text-white transition">Home</Link>
                <span>/</span>
                <span className="text-slate-200 font-medium">Ingresos</span>
              </nav>
              <h1 className="text-5xl font-extrabold tracking-tight">Ingresos Programados</h1>
              <p className="text-slate-400 mt-3 text-lg max-w-2xl">
                Registra sueldos, bonos y entradas esperadas para anticipar tu flujo de efectivo.
              </p>
            </div>

            <Link
              href="/"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition shadow-lg active:scale-95"
            >
              Volver
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 -mt-8">
        {message && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <KpiCard title="Ingresos activos" value={String(activeCount)} valueClassName="text-emerald-600" />
          <KpiCard title="Esperado próximos 30 días" value={formatMoney(nextThirtyDaysAmount)} valueClassName="text-emerald-600" />
          <KpiCard
            title="Próximo ingreso"
            value={nextEvent ? formatDate(nextEvent.date) : '---'}
            subtitle={nextEvent ? formatMoney(nextEvent.amount) : 'Sin ingresos futuros activos'}
            valueClassName="text-slate-950"
          />
        </div>

        <div className="grid gap-8 xl:grid-cols-12">
          <form
            onSubmit={handleSubmit}
            className="xl:col-span-4 rounded-[2.5rem] border border-slate-200 bg-white p-6 shadow-xl space-y-5"
          >
            <div>
              <h2 className="text-2xl font-black text-slate-900">
                {editingId ? 'Editar ingreso' : 'Nuevo ingreso esperado'}
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Estos registros no modifican saldos ni crean movimientos.
              </p>
            </div>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Nombre</span>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Sueldo, bono, honorarios..."
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Monto</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Frecuencia</span>
                <select
                  name="frequency"
                  value={form.frequency}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                >
                  {Object.entries(frequencyLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Próxima fecha</span>
                <input
                  type="date"
                  name="next_income_date"
                  value={form.next_income_date}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Día esperado</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  name="expected_day"
                  value={form.expected_day}
                  onChange={handleChange}
                  placeholder="15"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Segundo día</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  name="second_expected_day"
                  value={form.second_expected_day}
                  onChange={handleChange}
                  placeholder="30"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Confianza</span>
                <select
                  name="confidence"
                  value={form.confidence}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                >
                  {Object.entries(confidenceLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Variabilidad</span>
                <select
                  name="variability"
                  value={form.variability}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                >
                  {Object.entries(variabilityLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Cuenta destino</span>
                <select
                  name="account_id"
                  value={form.account_id}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                >
                  <option value="">Sin cuenta</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Categoría</span>
              <select
                name="category_id"
                value={form.category_id}
                onChange={handleChange}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
              >
                <option value="">Sin categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Inicia</span>
                <input
                  type="date"
                  name="starts_at"
                  value={form.starts_at}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Termina</span>
                <input
                  type="date"
                  name="ends_at"
                  value={form.ends_at}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Notas</span>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-emerald-500 px-6 py-4 font-black text-white shadow-lg transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear ingreso'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-slate-200 bg-white px-6 py-4 font-black text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>

          <div className="xl:col-span-8 space-y-8">
            <div className="rounded-[2.5rem] border border-slate-200 bg-white shadow-xl overflow-hidden">
              <div className="border-b border-slate-100 px-8 py-6">
                <h2 className="text-2xl font-black text-slate-900">Listado de ingresos esperados</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Sirven para anticipar flujo futuro; no son movimientos confirmados.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px]">
                  <thead className="bg-slate-50/70">
                    <tr className="text-left">
                      <th className="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Ingreso</th>
                      <th className="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Monto</th>
                      <th className="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Frecuencia</th>
                      <th className="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Próxima fecha</th>
                      <th className="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Destino</th>
                      <th className="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Estado</th>
                      <th className="px-8 py-4 text-xs font-black uppercase tracking-widest text-slate-400"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {schedules.map((schedule) => (
                      <tr key={schedule.id} className="group hover:bg-slate-50/60">
                        <td className="px-8 py-5">
                          <p className="font-black text-slate-900">{schedule.name}</p>
                          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                            {variabilityLabels[schedule.variability]} · {confidenceLabels[schedule.confidence]}
                          </p>
                        </td>
                        <td className="px-8 py-5 font-black text-emerald-600">
                          {formatMoney(Number(schedule.amount || 0))}
                        </td>
                        <td className="px-8 py-5">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                            {frequencyLabels[schedule.frequency]}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-sm font-bold text-slate-700">
                          <div className="flex flex-col gap-2">
                            <span>{formatDate(schedule.next_income_date)}</span>
                            {schedule.is_active && isPastIncomeDate(schedule.next_income_date) && (
                              <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                                Fecha pasada
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <p className="text-sm font-bold text-slate-700">
                            {accountMap.get(schedule.account_id || '') || 'Sin cuenta'}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {categoryMap.get(schedule.category_id || '') || 'Sin categoría'}
                          </p>
                        </td>
                        <td className="px-8 py-5">
                          <button
                            type="button"
                            onClick={() => void handleToggle(schedule)}
                            className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${
                              schedule.is_active
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {schedule.is_active ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex flex-wrap justify-end gap-2">
                            {schedule.is_active && (
                              <button
                                type="button"
                                onClick={() => void handleMarkReceived(schedule)}
                                className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
                                title="No crea movimientos reales; solo avanza la próxima fecha esperada."
                              >
                                RECIBIDO
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleEdit(schedule)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-900 hover:text-white"
                            >
                              EDITAR
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(schedule)}
                              className="rounded-xl border border-rose-100 bg-white px-3 py-2 text-xs font-black text-rose-600 transition hover:bg-rose-600 hover:text-white"
                            >
                              BORRAR
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {schedules.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-8 py-16 text-center">
                          <p className="font-bold text-slate-500">Aún no hay ingresos programados.</p>
                          <p className="mt-1 text-sm text-slate-400">Registra tu sueldo, bonos u honorarios esperados.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-slate-200 bg-white p-6 shadow-xl">
              <h2 className="text-2xl font-black text-slate-900">Eventos próximos generados</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Vista preliminar de eventos de entrada para la futura proyección de flujo.
              </p>

              <div className="mt-5 divide-y divide-slate-100">
                {futureEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-4 py-4">
                    <div>
                      <p className="font-black text-slate-900">{event.title}</p>
                      <p className="text-sm font-medium text-slate-500">
                        {formatDate(event.date)} · {event.confidence === 'confirmed' ? 'Confirmado' : 'Estimado'}
                      </p>
                    </div>
                    <p className="font-black text-emerald-600">{formatMoney(event.amount)}</p>
                  </div>
                ))}

                {futureEvents.length === 0 && (
                  <div className="py-10 text-center text-slate-400 font-medium italic">
                    No hay eventos futuros activos en los próximos 60 días.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
