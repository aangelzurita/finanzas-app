'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatMoney } from '@/lib/utils'

type Reminder = {
    id: string
    title: string
    reminder_type: string
    amount: number | null
    due_date: string
    status: string
    notes: string | null
    related_entity_type: string | null
}

export default function RecordatoriosPage() {
    const supabase = createClient()

    const [loading, setLoading] = useState(true)
    const [reminders, setReminders] = useState<Reminder[]>([])
    const [loadingAction, setLoadingAction] = useState(false)
    const [message, setMessage] = useState('')

    // Form state
    const [title, setTitle] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [amount, setAmount] = useState('')
    const [notes, setNotes] = useState('')

    useEffect(() => {
        void loadReminders()
    }, [])

    const loadReminders = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('reminders')
            .select('*')
            .order('status', { ascending: false }) // pending first? or maybe by date
            .order('due_date', { ascending: true })

        if (error) {
            setMessage(error.message)
        } else {
            setReminders((data as Reminder[]) ?? [])
        }
        setLoading(false)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim() || !dueDate) return

        setLoadingAction(true)
        setMessage('')

        const { data: sessionData } = await supabase.auth.getSession()
        const userId = sessionData.session?.user?.id

        if (!userId) {
            setMessage('No hay sesión activa.')
            setLoadingAction(false)
            return
        }

        const { error } = await supabase
            .from('reminders')
            .insert({
                user_id: userId,
                title: title.trim(),
                due_date: dueDate,
                amount: amount ? Number(amount) : null,
                notes: notes.trim() || null,
                reminder_type: 'custom',
                status: 'pending'
            })

        if (error) {
            setMessage(error.message)
        } else {
            setTitle('')
            setDueDate('')
            setAmount('')
            setNotes('')
            void loadReminders()
        }
        setLoadingAction(false)
    }

    const setReminderStatus = async (reminder: Reminder, status: 'pending' | 'completed' | 'skipped') => {
        setLoadingAction(true)
        const { error } = await supabase
          .from('reminders')
          .update({ status })
          .eq('id', reminder.id)

        if (error) setMessage(error.message)
        else void loadReminders()
        setLoadingAction(false)
    }

    const statusLabel = (status: string) => {
        if (status === 'completed') return 'Pagado'
        if (status === 'skipped') return 'Omitido'
        return 'Pendiente'
    }

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que quieres eliminar este recordatorio?')) return
        setLoadingAction(true)
        const { error } = await supabase.from('reminders').delete().eq('id', id)
        if (error) setMessage(error.message)
        else void loadReminders()
        setLoadingAction(false)
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                    <p className="text-slate-600 font-medium">Cargando recordatorios...</p>
                </div>
            </main>
        )
    }

    return (
        <main className="min-h-screen bg-slate-100 pb-12">
            <section className="bg-slate-950 text-white">
                <div className="max-w-5xl mx-auto px-6 py-12">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                                <Link href="/" className="hover:text-white transition">Home</Link>
                                <span>/</span>
                                <span className="text-slate-200 font-medium">Recordatorios</span>
                            </nav>
                            <h1 className="text-5xl font-extrabold tracking-tight italic uppercase">Alerts & Reminders</h1>
                            <p className="text-slate-400 mt-2 text-lg">
                                Mantente al día con tus pagos y fechas importantes.
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

            <section className="max-w-5xl mx-auto px-6 -mt-8">
                <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl mb-8">
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-6">
                        Nuevo Recordatorio
                    </h2>

                    <form onSubmit={handleSave} className="grid gap-6 md:grid-cols-4 items-end">
                        <div className="md:col-span-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Título</label>
                            <input
                                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 placeholder:text-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                                placeholder="Ej. Pagar servicios, Renovación..."
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Fecha</label>
                            <input
                                type="date"
                                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={loadingAction}
                                className="w-full rounded-2xl bg-slate-900 px-8 py-4 font-bold text-white shadow-lg hover:bg-black transition active:scale-95 whitespace-nowrap disabled:opacity-50"
                            >
                                {loadingAction ? '...' : 'Crear'}
                            </button>
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Monto (Opcional)</label>
                            <input
                                type="number"
                                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Notas</label>
                            <input
                                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-medium text-slate-600 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                                placeholder="Detalles adicionales..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>
                    </form>

                    {message && (
                        <p className="mt-4 text-sm font-bold text-rose-600">{message}</p>
                    )}
                </div>

                <div className="rounded-[2.5rem] border border-slate-100 bg-white shadow-xl overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
                        <h2 className="text-2xl font-extrabold text-slate-900">Historial de Alertas</h2>
                    </div>

                    <div className="divide-y divide-slate-50">
                        {reminders.map((rem) => (
                            <div key={rem.id} className={`px-8 py-6 flex flex-col md:flex-row md:items-center justify-between hover:bg-slate-50/50 transition-colors ${rem.status !== 'pending' ? 'opacity-60' : ''}`}>
                                <div className="flex items-start gap-4 flex-1">
                                    <button
                                        onClick={() => setReminderStatus(rem, rem.status === 'pending' ? 'completed' : 'pending')}
                                        className={`mt-1 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${rem.status !== 'pending' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-transparent'
                                            }`}
                                        title={rem.status === 'pending' ? 'Marcar pagado' : 'Volver a pendiente'}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </button>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <p className={`text-lg font-black tracking-tight ${rem.status !== 'pending' ? 'line-through text-slate-400' : 'text-slate-950'}`}>
                                                {rem.title}
                                            </p>
                                            <span className={`rounded-full px-3 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                                                rem.status === 'pending'
                                                    ? 'bg-amber-50 text-amber-700'
                                                    : rem.status === 'skipped'
                                                        ? 'bg-slate-100 text-slate-500'
                                                        : 'bg-emerald-50 text-emerald-700'
                                            }`}>
                                                {statusLabel(rem.status)}
                                            </span>
                                            {rem.related_entity_type && (
                                                <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    {rem.related_entity_type === 'credit_card' ? 'TDC' : 'Recurrente'}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm font-bold text-slate-500 mt-1">
                                            {formatDate(rem.due_date)} {rem.amount ? `· ${formatMoney(rem.amount)}` : ''}
                                        </p>
                                        {rem.notes && (
                                            <p className="text-xs text-slate-400 mt-1 italic">{rem.notes}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0">
                                    {rem.status === 'pending' && (
                                        <>
                                            <button
                                                onClick={() => setReminderStatus(rem, 'completed')}
                                                className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition-all hover:bg-emerald-500 hover:text-white active:scale-95"
                                            >
                                                PAGADO
                                            </button>
                                            <button
                                                onClick={() => setReminderStatus(rem, 'skipped')}
                                                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 transition-all hover:bg-slate-700 hover:text-white active:scale-95"
                                            >
                                                OMITIR
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={() => handleDelete(rem.id)}
                                        className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                        title="Eliminar"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}

                        {reminders.length === 0 && (
                            <div className="py-24 text-center">
                                <div className="text-6xl mb-6 opacity-20">🔔</div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">Sin recordatorios pendientes</h3>
                                <p className="text-slate-400 max-w-sm mx-auto">Agrega tareas o fechas de pago para que aparezcan aquí y en tu dashboard principal.</p>
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </main>
    )
}
