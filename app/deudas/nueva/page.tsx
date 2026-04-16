'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function NuevaDeudaPage() {
    const supabase = createClient()
    const router = useRouter()

    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    const [form, setForm] = useState({
        name: '',
        institution: '',
        total_amount: '',
        initial_balance: '',
        monthly_payment: '',
        interest_rate: '',
        start_date: new Date().toISOString().split('T')[0],
        notes: ''
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setMessage('')

        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData.session) return

        const payload = {
            user_id: sessionData.session.user.id,
            name: form.name,
            institution: form.institution || null,
            original_amount: Number(form.total_amount),
            total_amount: Number(form.total_amount),
            initial_balance: Number(form.initial_balance),
            current_balance: Number(form.initial_balance), // Al inicio, el saldo actual es el inicial
            monthly_payment: form.monthly_payment ? Number(form.monthly_payment) : null,
            interest_rate: form.interest_rate ? Number(form.interest_rate) : null,
            start_date: form.start_date,
            notes: form.notes || null,
            status: 'active'
        }

        const { error } = await supabase.from('debts').insert(payload)

        if (error) {
            setMessage(`Error: ${error.message}`)
            setSaving(false)
        } else {
            router.push('/deudas')
            router.refresh()
        }
    }

    return (
        <main className="min-h-screen bg-slate-100 pb-12">
            <section className="bg-slate-950 text-white">
                <div className="max-w-3xl mx-auto px-6 py-12">
                    <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                        <Link href="/" className="hover:text-white transition">Home</Link>
                        <span>/</span>
                        <Link href="/deudas" className="hover:text-white transition">Deudas</Link>
                        <span>/</span>
                        <span className="text-slate-200 font-medium">Nueva</span>
                    </nav>
                    <h1 className="text-5xl font-extrabold tracking-tight">Nuevo Préstamo</h1>
                    <p className="text-slate-400 mt-3 text-lg">Registra los detalles de tu nueva obligación financiera.</p>
                </div>
            </section>

            <section className="max-w-3xl mx-auto px-6 -mt-8">
                <form
                    onSubmit={handleSubmit}
                    className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-2xl space-y-8"
                >
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="col-span-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Nombre del Préstamo</label>
                            <input
                                required
                                name="name"
                                value={form.name}
                                onChange={handleChange}
                                placeholder="Ej. Crédito Automotriz, Hipoteca, etc."
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg placeholder:text-slate-300"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Institución / Acreedor</label>
                            <input
                                name="institution"
                                value={form.institution}
                                onChange={handleChange}
                                placeholder="Ej. BBVA, Particular"
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all placeholder:text-slate-300"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Fecha de Inicio</label>
                            <input
                                type="date"
                                required
                                name="start_date"
                                value={form.start_date}
                                onChange={handleChange}
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Monto Total Original</label>
                            <input
                                type="number"
                                required
                                name="total_amount"
                                value={form.total_amount}
                                onChange={handleChange}
                                placeholder="0.00"
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-xl"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-rose-400 uppercase tracking-[0.2em] mb-2">Saldo Pendiente Actual</label>
                            <input
                                type="number"
                                required
                                name="initial_balance"
                                value={form.initial_balance}
                                onChange={handleChange}
                                placeholder="0.00"
                                className="w-full rounded-2xl border-2 border-rose-50 p-4 font-bold text-rose-600 focus:border-rose-500 focus:ring-0 transition-all text-xl"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Mensualidad (Opcional)</label>
                            <input
                                type="number"
                                name="monthly_payment"
                                value={form.monthly_payment}
                                onChange={handleChange}
                                placeholder="Monto fijo al mes"
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg placeholder:text-slate-300"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Tasa de Interés (Opcional)</label>
                            <input
                                type="number"
                                step="0.01"
                                name="interest_rate"
                                value={form.interest_rate}
                                onChange={handleChange}
                                placeholder="Ej. 15.5%"
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg placeholder:text-slate-300"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Notas (Opcional)</label>
                        <textarea
                            name="notes"
                            value={form.notes}
                            onChange={handleChange}
                            rows={3}
                            placeholder="Detalles sobre el crédito..."
                            className="w-full rounded-2xl border-2 border-slate-100 p-4 font-medium text-slate-700 focus:border-slate-900 focus:ring-0 transition-all placeholder:text-slate-300"
                        />
                    </div>

                    <div className="flex flex-col gap-4 pt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full rounded-2xl bg-slate-900 py-5 text-lg font-black text-white hover:bg-slate-800 transition-all active:scale-[0.98] shadow-xl disabled:opacity-50"
                        >
                            {saving ? 'GUARDANDO...' : 'REGISTRAR DEUDA'}
                        </button>

                        <Link
                            href="/deudas"
                            className="w-full rounded-2xl border-2 border-slate-100 py-5 text-center font-bold text-slate-400 hover:text-slate-600 transition-all"
                        >
                            CANCELAR
                        </Link>
                    </div>

                    {message && (
                        <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-center">
                            <p className="text-rose-600 font-bold">{message}</p>
                        </div>
                    )}
                </form>
            </section>
        </main>
    )
}
