'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatMoney } from '@/lib/utils'
import { KpiCard } from '@/components/ui/KpiCard'

type Debt = {
    id: string
    name: string
    institution: string | null
    total_amount: number
    current_balance: number
    monthly_payment: number | null
    status: string
}

export default function DeudasPage() {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [debts, setDebts] = useState<Debt[]>([])
    const [message, setMessage] = useState('')

    useEffect(() => {
        void loadDebts()
    }, [])

    const loadDebts = async () => {
        setLoading(true)
        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData.session) {
            window.location.href = '/'
            return
        }

        const { data, error } = await supabase
            .from('debts')
            .select('*')
            .neq('status', 'canceled')
            .order('created_at', { ascending: false })

        if (error) {
            setMessage(error.message)
        } else {
            setDebts((data as Debt[]) ?? [])
        }
        setLoading(false)
    }

    const totals = {
        total: debts.reduce((acc, d) => acc + Number(d.current_balance), 0),
        mensual: debts.reduce((acc, d) => acc + Number(d.monthly_payment || 0), 0),
        cantidad: debts.length
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                    <p className="text-slate-600 font-medium">Cargando deudas...</p>
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
                                <span className="text-slate-200 font-medium">Deudas</span>
                            </nav>
                            <h1 className="text-5xl font-extrabold tracking-tight">Mis Deudas</h1>
                            <p className="text-slate-400 mt-3 text-lg">
                                Rastrea tus préstamos detalladamente y observa tu progreso hacia la libertad financiera.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                href="/deudas/nueva"
                                className="rounded-2xl bg-emerald-500 hover:bg-emerald-600 transition-all px-6 py-4 font-bold text-white shadow-lg active:scale-95"
                            >
                                Nueva deuda
                            </Link>
                            <Link
                                href="/"
                                className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition shadow-lg active:scale-95"
                            >
                                Volver
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section className="max-w-7xl mx-auto px-6 -mt-8">
                <div className="grid gap-6 md:grid-cols-3 mb-8">
                    <KpiCard title="Deuda Total" value={formatMoney(totals.total)} valueClassName="text-rose-600" />
                    <KpiCard title="Compromiso Mensual" value={formatMoney(totals.mensual)} valueClassName="text-slate-900" />
                    <KpiCard title="Deudas Activas" value={String(totals.cantidad)} />
                </div>

                {message && (
                    <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 shadow-sm">
                        {message}
                    </div>
                )}

                <div className="grid gap-6">
                    {debts.map((debt) => {
                        const total = Number(debt.total_amount || 0)
                        const current = Number(debt.current_balance || 0)
                        const paid = Math.max(0, total - current)
                        const progress = total > 0 ? Math.min(100, (paid / total) * 100) : 0

                        return (
                            <div key={debt.id} className="rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-xl hover:shadow-2xl transition-all group">
                                <div className="flex flex-col lg:flex-row lg:items-center gap-8">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">{debt.name}</h3>
                                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${debt.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                {debt.status === 'paid' ? 'Liquidada' : 'En curso'}
                                            </span>
                                        </div>
                                        <p className="text-slate-400 font-medium mb-6">{debt.institution || 'Préstamo Personal'}</p>

                                        <div className="space-y-4">
                                            <div className="flex justify-between text-sm font-bold uppercase tracking-widest mb-1">
                                                <span className="text-slate-400">Progreso de pago</span>
                                                <span className="text-slate-900">{progress.toFixed(1)}%</span>
                                            </div>
                                            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-100 p-0.5">
                                                <div
                                                    className="h-full bg-slate-900 rounded-full transition-all duration-1000"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-sm mt-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagado</span>
                                                    <span className="font-bold text-emerald-600">{formatMoney(paid)}</span>
                                                </div>
                                                <div className="flex flex-col text-right">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pendiente</span>
                                                    <span className="font-bold text-rose-600">{formatMoney(debt.current_balance)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="lg:w-48 flex flex-col gap-3">
                                        <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Mensualidad</p>
                                            <p className="text-xl font-black text-slate-900">{formatMoney(Number(debt.monthly_payment || 0))}</p>
                                        </div>
                                        <Link
                                            href={`/deudas/${debt.id}/editar`}
                                            className="w-full rounded-2xl border-2 border-slate-100 bg-white py-3 text-center text-sm font-black text-slate-900 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all active:scale-95 shadow-sm"
                                        >
                                            DETALLES
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        )
                    })}

                    {debts.length === 0 && (
                        <div className="rounded-[2.5rem] border-2 border-dashed border-slate-200 py-20 text-center bg-white/50">
                            <div className="text-5xl mb-4 grayscale opacity-30">🏦</div>
                            <h3 className="text-xl font-bold text-slate-400 italic">No tienes deudas registradas</h3>
                            <Link href="/deudas/nueva" className="mt-4 inline-block text-emerald-600 font-black uppercase tracking-widest hover:underline">
                                Registrar mi primer préstamo
                            </Link>
                        </div>
                    )}
                </div>
            </section>
        </main>
    )
}
