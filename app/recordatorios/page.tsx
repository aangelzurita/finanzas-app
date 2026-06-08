'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatMoney } from '@/lib/utils'

type ReminderFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
type AlertKind = 'financial' | 'non_financial'

type Reminder = {
  id: string
  title: string
  reminder_type: string | null
  amount: number | null
  due_date: string
  frequency: ReminderFrequency | null
  status: string
  notes: string | null
  related_entity_type: string | null
}

type ReminderForm = {
  title: string
  dueDate: string
  amount: string
  notes: string
  alertKind: AlertKind
  frequency: '' | ReminderFrequency
}

const emptyForm: ReminderForm = {
  title: '',
  dueDate: '',
  amount: '',
  notes: '',
  alertKind: 'non_financial',
  frequency: '',
}

const frequencyLabels: Record<ReminderFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual',
}

function parseDateOnly(value: string) {
  return new Date(`${value}T12:00:00`)
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function todayKey() {
  const now = new Date()
  return dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
}

function addNextReminderDate(dueDate: string, frequency: ReminderFrequency) {
  const next = parseDateOnly(dueDate)

  if (frequency === 'weekly') next.setDate(next.getDate() + 7)
  if (frequency === 'biweekly') next.setDate(next.getDate() + 14)
  if (frequency === 'monthly') next.setMonth(next.getMonth() + 1)
  if (frequency === 'quarterly') next.setMonth(next.getMonth() + 3)
  if (frequency === 'yearly') next.setFullYear(next.getFullYear() + 1)

  return dateKey(next)
}

function isReminderStatusConstraintError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() || ''
  return error?.code === '23514' || message.includes('check constraint') || message.includes('violates')
}

function isReminderTypeConstraintError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() || ''
  return error?.code === '23514' || message.includes('reminder_type') || message.includes('check constraint')
}

function affectsFlow(reminder: Pick<Reminder, 'amount' | 'status' | 'reminder_type'>) {
  if ((reminder.status || 'pending') !== 'pending') return false
  if (reminder.reminder_type === 'non_financial') return false
  return Number(reminder.amount || 0) > 0
}

function statusLabel(status: string) {
  if (status === 'completed') return 'Completada'
  if (status === 'skipped') return 'Omitida'
  return 'Pendiente'
}

export default function RecordatoriosPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loadingAction, setLoadingAction] = useState(false)
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ReminderForm>(emptyForm)

  useEffect(() => {
    void loadReminders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadReminders = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .order('due_date', { ascending: true })

    if (error) {
      setMessage(error.message)
    } else {
      setReminders((data as Reminder[]) ?? [])
    }
    setLoading(false)
  }

  const updateForm = (field: keyof ReminderForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
  }

  const buildPayload = (userId?: string) => {
    const amountNumber = form.amount ? Number(form.amount) : 0
    const reminderType = form.alertKind === 'financial' ? 'custom' : 'non_financial'

    return {
      ...(userId ? { user_id: userId } : {}),
      title: form.title.trim(),
      due_date: form.dueDate,
      amount: amountNumber > 0 ? amountNumber : null,
      notes: form.notes.trim() || null,
      reminder_type: reminderType,
      frequency: form.frequency || null,
      status: 'pending',
    }
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim() || !form.dueDate) {
      setMessage('Ingresa titulo y fecha.')
      return
    }

    setLoadingAction(true)
    setMessage('')

    const payload = buildPayload()
    let error: { code?: string; message?: string } | null = null

    if (editingId) {
      const result = await supabase.from('reminders').update(payload).eq('id', editingId)
      error = result.error
    } else {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id

      if (!userId) {
        setMessage('No hay sesion activa.')
        setLoadingAction(false)
        return
      }

      const result = await supabase.from('reminders').insert(buildPayload(userId))
      error = result.error
    }

    if (error && isReminderTypeConstraintError(error) && form.alertKind === 'non_financial') {
      const fallbackPayload = { ...payload, reminder_type: 'custom', amount: null }
      const retry = editingId
        ? await supabase.from('reminders').update(fallbackPayload).eq('id', editingId)
        : await supabase.from('reminders').insert({
            ...fallbackPayload,
            user_id: (await supabase.auth.getSession()).data.session?.user?.id,
          })

      error = retry.error
    }

    if (error) {
      setMessage(error.message || 'No se pudo guardar la alerta.')
    } else {
      resetForm()
      void loadReminders()
    }

    setLoadingAction(false)
  }

  const startEdit = (reminder: Reminder) => {
    setEditingId(reminder.id)
    setForm({
      title: reminder.title,
      dueDate: reminder.due_date,
      amount: reminder.amount ? String(reminder.amount) : '',
      notes: reminder.notes || '',
      alertKind: affectsFlow(reminder) ? 'financial' : 'non_financial',
      frequency: reminder.frequency || '',
    })
    setMessage('')
  }

  const setReminderStatus = async (reminder: Reminder, status: 'pending' | 'completed' | 'skipped') => {
    setLoadingAction(true)
    setMessage('')

    const updatePayload = reminder.frequency && status !== 'pending'
      ? { status: 'pending', due_date: addNextReminderDate(reminder.due_date, reminder.frequency) }
      : { status }

    let { error } = await supabase
      .from('reminders')
      .update(updatePayload)
      .eq('id', reminder.id)

    if (error && status === 'skipped' && isReminderStatusConstraintError(error)) {
      const retry = await supabase
        .from('reminders')
        .update({ status: 'completed' })
        .eq('id', reminder.id)

      error = retry.error
    }

    if (error) setMessage(error.message)
    else void loadReminders()
    setLoadingAction(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que quieres eliminar esta alerta?')) return
    setLoadingAction(true)
    const { error } = await supabase.from('reminders').delete().eq('id', id)
    if (error) setMessage(error.message)
    else void loadReminders()
    setLoadingAction(false)
  }

  const grouped = useMemo(() => {
    const today = todayKey()
    const closedStatuses = new Set(['completed', 'skipped'])

    return {
      overdue: reminders.filter((reminder) => !closedStatuses.has(reminder.status) && reminder.due_date < today),
      today: reminders.filter((reminder) => !closedStatuses.has(reminder.status) && reminder.due_date === today),
      upcoming: reminders.filter((reminder) => !closedStatuses.has(reminder.status) && reminder.due_date > today),
      closed: reminders.filter((reminder) => closedStatuses.has(reminder.status)),
    }
  }, [reminders])

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Cargando alertas...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-12">
      <section className="bg-slate-950 text-white">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                <Link href="/" className="hover:text-white transition">Home</Link>
                <span>/</span>
                <span className="text-slate-200 font-medium">Alertas</span>
              </nav>
              <h1 className="text-5xl font-extrabold tracking-tight">Alertas y pendientes</h1>
              <p className="text-slate-400 mt-2 text-lg">
                Separa pagos que afectan flujo de recordatorios personales que solo necesitas tener visibles.
              </p>
            </div>

            <Link
              href="/"
              className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition-all active:scale-95 shadow-lg"
            >
              Volver
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 -mt-8 space-y-8">
        <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl">
          <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
                {editingId ? 'Editar alerta' : 'Nueva alerta'}
              </h2>
              <p className="text-sm font-medium text-slate-400">
                Si no tiene monto, no afecta caja ni proyeccion.
              </p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-200"
              >
                CANCELAR EDICION
              </button>
            )}
          </div>

          <form onSubmit={handleSave} className="grid gap-5 md:grid-cols-6 md:items-end">
            <label className="md:col-span-3">
              <span className="ml-1 block text-xs font-black uppercase tracking-widest text-slate-400">Titulo</span>
              <input
                className="mt-2 w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 placeholder:text-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                placeholder="Ej. Pagar servicio, renovar licencia, llamar al banco"
                value={form.title}
                onChange={(e) => updateForm('title', e.target.value)}
              />
            </label>

            <label className="md:col-span-1">
              <span className="ml-1 block text-xs font-black uppercase tracking-widest text-slate-400">Fecha</span>
              <input
                type="date"
                className="mt-2 w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                value={form.dueDate}
                onChange={(e) => updateForm('dueDate', e.target.value)}
              />
            </label>

            <label className="md:col-span-1">
              <span className="ml-1 block text-xs font-black uppercase tracking-widest text-slate-400">Tipo</span>
              <select
                className="mt-2 w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                value={form.alertKind}
                onChange={(e) => updateForm('alertKind', e.target.value)}
              >
                <option value="non_financial">Solo recordatorio</option>
                <option value="financial">Financiera</option>
              </select>
            </label>

            <label className="md:col-span-1">
              <span className="ml-1 block text-xs font-black uppercase tracking-widest text-slate-400">Monto</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-2 w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => updateForm('amount', e.target.value)}
              />
            </label>

            <label className="md:col-span-2">
              <span className="ml-1 block text-xs font-black uppercase tracking-widest text-slate-400">Frecuencia</span>
              <select
                className="mt-2 w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                value={form.frequency}
                onChange={(e) => updateForm('frequency', e.target.value)}
              >
                <option value="">Una sola vez</option>
                {Object.entries(frequencyLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="md:col-span-3">
              <span className="ml-1 block text-xs font-black uppercase tracking-widest text-slate-400">Notas</span>
              <input
                className="mt-2 w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-medium text-slate-600 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                placeholder="Detalles adicionales"
                value={form.notes}
                onChange={(e) => updateForm('notes', e.target.value)}
              />
            </label>

            <button
              type="submit"
              disabled={loadingAction}
              className="rounded-2xl bg-slate-900 px-8 py-4 font-bold text-white shadow-lg hover:bg-black transition active:scale-95 disabled:opacity-50 md:col-span-1"
            >
              {loadingAction ? '...' : editingId ? 'Guardar' : 'Crear'}
            </button>
          </form>

          {message && (
            <p className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
              {message}
            </p>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-4">
          <SummaryCard title="Vencidas" value={grouped.overdue.length} tone="rose" />
          <SummaryCard title="Hoy" value={grouped.today.length} tone="amber" />
          <SummaryCard title="Proximas" value={grouped.upcoming.length} tone="sky" />
          <SummaryCard title="Cerradas" value={grouped.closed.length} tone="slate" />
        </div>

        <ReminderSection title="Pendientes de hoy" reminders={grouped.today} emptyText="No hay alertas para hoy.">
          {(reminder) => (
            <ReminderItem
              reminder={reminder}
              onComplete={() => setReminderStatus(reminder, 'completed')}
              onSkip={() => setReminderStatus(reminder, 'skipped')}
              onEdit={() => startEdit(reminder)}
              onDelete={() => handleDelete(reminder.id)}
            />
          )}
        </ReminderSection>

        <ReminderSection title="Vencidos" reminders={grouped.overdue} emptyText="No hay alertas vencidas.">
          {(reminder) => (
            <ReminderItem
              reminder={reminder}
              onComplete={() => setReminderStatus(reminder, 'completed')}
              onSkip={() => setReminderStatus(reminder, 'skipped')}
              onEdit={() => startEdit(reminder)}
              onDelete={() => handleDelete(reminder.id)}
            />
          )}
        </ReminderSection>

        <ReminderSection title="Proximos" reminders={grouped.upcoming} emptyText="No hay proximas alertas.">
          {(reminder) => (
            <ReminderItem
              reminder={reminder}
              onComplete={() => setReminderStatus(reminder, 'completed')}
              onSkip={() => setReminderStatus(reminder, 'skipped')}
              onEdit={() => startEdit(reminder)}
              onDelete={() => handleDelete(reminder.id)}
            />
          )}
        </ReminderSection>

        <ReminderSection title="Completados / omitidos" reminders={grouped.closed} emptyText="Aun no hay alertas cerradas.">
          {(reminder) => (
            <ReminderItem
              reminder={reminder}
              onComplete={() => setReminderStatus(reminder, 'pending')}
              onSkip={() => setReminderStatus(reminder, 'skipped')}
              onEdit={() => startEdit(reminder)}
              onDelete={() => handleDelete(reminder.id)}
              closed
            />
          )}
        </ReminderSection>
      </section>
    </main>
  )
}

function SummaryCard({ title, value, tone }: { title: string; value: number; tone: 'rose' | 'amber' | 'sky' | 'slate' }) {
  const toneClass = {
    rose: 'text-rose-600',
    amber: 'text-amber-600',
    sky: 'text-sky-600',
    slate: 'text-slate-600',
  }[tone]

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-400">{title}</p>
      <p className={`mt-2 text-4xl font-black ${toneClass}`}>{value}</p>
    </div>
  )
}

function ReminderSection({
  title,
  reminders,
  emptyText,
  children,
}: {
  title: string
  reminders: Reminder[]
  emptyText: string
  children: (reminder: Reminder) => React.ReactNode
}) {
  return (
    <div className="rounded-[2.5rem] border border-slate-100 bg-white shadow-xl overflow-hidden">
      <div className="border-b border-slate-50 px-8 py-6">
        <h2 className="text-2xl font-extrabold text-slate-900">{title}</h2>
      </div>
      <div className="divide-y divide-slate-50">
        {reminders.map((reminder) => children(reminder))}
        {reminders.length === 0 && (
          <div className="px-8 py-12 text-center">
            <p className="font-bold text-slate-400">{emptyText}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ReminderItem({
  reminder,
  onComplete,
  onSkip,
  onEdit,
  onDelete,
  closed = false,
}: {
  reminder: Reminder
  onComplete: () => void
  onSkip: () => void
  onEdit: () => void
  onDelete: () => void
  closed?: boolean
}) {
  const flowImpact = affectsFlow(reminder)

  return (
    <div className={`px-8 py-6 ${closed ? 'opacity-70' : ''}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-lg font-black tracking-tight ${closed ? 'line-through text-slate-400' : 'text-slate-950'}`}>
              {reminder.title}
            </p>
            <span className={`rounded-full px-3 py-0.5 text-[10px] font-black uppercase tracking-widest ${
              reminder.status === 'pending'
                ? 'bg-amber-50 text-amber-700'
                : reminder.status === 'skipped'
                  ? 'bg-slate-100 text-slate-500'
                  : 'bg-emerald-50 text-emerald-700'
            }`}>
              {statusLabel(reminder.status)}
            </span>
            <span className={`rounded-full px-3 py-0.5 text-[10px] font-black uppercase tracking-widest ${
              flowImpact ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'
            }`}>
              {flowImpact ? 'Afecta flujo' : 'Solo recordatorio'}
            </span>
            {reminder.frequency && (
              <span className="rounded-full bg-violet-50 px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-violet-700">
                {frequencyLabels[reminder.frequency]}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-bold text-slate-500">
            {formatDate(reminder.due_date)}
            {reminder.amount ? ` · ${formatMoney(reminder.amount)}` : ''}
          </p>
          {reminder.notes && (
            <p className="mt-1 text-xs font-medium text-slate-400">{reminder.notes}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!closed ? (
            <>
              <button
                onClick={onComplete}
                className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition-all hover:bg-emerald-500 hover:text-white active:scale-95"
              >
                COMPLETAR
              </button>
              <button
                onClick={onSkip}
                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 transition-all hover:bg-slate-700 hover:text-white active:scale-95"
              >
                OMITIR
              </button>
            </>
          ) : (
            <button
              onClick={onComplete}
              className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 transition-all hover:bg-amber-500 hover:text-white active:scale-95"
            >
              REABRIR
            </button>
          )}
          <button
            onClick={onEdit}
            className="rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-xs font-black text-slate-700 transition-all hover:bg-slate-900 hover:text-white active:scale-95"
          >
            EDITAR
          </button>
          <button
            onClick={onDelete}
            className="rounded-xl border-2 border-rose-50 bg-white px-3 py-2 text-xs font-black text-rose-600 transition-all hover:bg-rose-600 hover:text-white active:scale-95"
          >
            BORRAR
          </button>
        </div>
      </div>
    </div>
  )
}
