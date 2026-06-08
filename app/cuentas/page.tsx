'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatMoney, friendlyAccountType } from '@/lib/utils'
import { KpiCard } from '@/components/ui/KpiCard'

type Account = {
    id: string
    name: string
    institution: string | null
    account_type: string
    current_balance: number
    is_external?: boolean | null
    include_in_balance?: boolean | null
}

function accountAffectsBalance(account: Account) {
    return account.is_external !== true && account.include_in_balance !== false
}

export default function CuentasPage() {
    const supabase = createClient()

    const [loading, setLoading] = useState(true)
    const [accounts, setAccounts] = useState<Account[]>([])
    const [message, setMessage] = useState('')

    useEffect(() => {
        void loadAccounts()
    }, [])

    const loadAccounts = async () => {
        setLoading(true)
        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData.session) {
            window.location.href = '/'
            return
        }

        const { data, error } = await supabase
            .from('accounts')
            .select('*')
            .eq('is_active', true)
            .order('name')

        if (error) {
            setMessage(error.message)
        } else {
            setAccounts((data as Account[]) ?? [])
        }
        setLoading(false)
    }

    const totals = {
        disponible: accounts
            .filter(accountAffectsBalance)
            .filter(a => ['cash', 'debit', 'savings'].includes(a.account_type))
            .reduce((acc, a) => acc + Number(a.current_balance || 0), 0),
        deuda: accounts
            .filter(accountAffectsBalance)
            .filter(a => a.account_type === 'credit_card')
            .reduce((acc, a) => acc + Number(a.current_balance || 0), 0),
        inversion: accounts
            .filter(accountAffectsBalance)
            .filter(a => a.account_type === 'investment')
            .reduce((acc, a) => acc + Number(a.current_balance || 0), 0),
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                    <p className="text-slate-600 font-medium">Cargando cuentas...</p>
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
                                <span className="text-slate-200 font-medium">Cuentas</span>
                            </nav>
                            <h1 className="text-5xl font-extrabold tracking-tight">Mis Cuentas</h1>
                            <p className="text-slate-400 mt-3 text-lg">
                                Gestiona tus activos, deudas e inversiones desde un solo lugar.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                href="/cuentas/nueva"
                                className="rounded-2xl bg-emerald-500 hover:bg-emerald-600 transition-all px-6 py-4 font-bold text-white shadow-lg active:scale-95"
                            >
                                Nueva cuenta
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
                    <KpiCard title="Activos Disponibles" value={formatMoney(totals.disponible)} valueClassName="text-emerald-600" />
                    <KpiCard title="Deuda (Créditos)" value={formatMoney(totals.deuda)} valueClassName="text-rose-600" />
                    <KpiCard title="Inversión total" value={formatMoney(totals.inversion)} valueClassName="text-sky-600" />
                </div>

                {message && (
                    <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
                        {message}
                    </div>
                )}

                <div className="rounded-[2.5rem] border border-slate-100 bg-white shadow-xl overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-white">
                        <h2 className="text-2xl font-extrabold text-slate-900">Listado de Cuentas</h2>
                        <span className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-bold text-slate-600">
                            {accounts.length} registradas
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px]">
                            <thead className="bg-slate-50/50">
                                <tr className="text-left">
                                    <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cuenta</th>
                                    <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Tipo</th>
                                    <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Institución</th>
                                    <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Saldo Actual</th>
                                    <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Acciones</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-50">
                                {accounts.map((account) => (
                                    <tr key={account.id} className="hover:bg-slate-50/30 transition-colors group">
                                        <td className="px-8 py-5">
                                            <p className="text-sm font-bold text-slate-900">{account.name}</p>
                                            {!accountAffectsBalance(account) && (
                                                <span className="mt-1 inline-flex rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-sky-700">
                                                    Externa
                                                </span>
                                            )}
                                        </td>

                                        <td className="px-8 py-5">
                                            <span className="text-sm font-medium text-slate-600">
                                                {friendlyAccountType(account.account_type)}
                                            </span>
                                        </td>

                                        <td className="px-8 py-5">
                                            <p className="text-sm text-slate-500 font-medium">{account.institution || '---'}</p>
                                        </td>

                                        <td className="px-8 py-5 text-right font-black text-slate-900">
                                            {formatMoney(Number(account.current_balance || 0))}
                                            {!accountAffectsBalance(account) && (
                                                <p className="mt-1 text-xs font-bold text-slate-400">No afecta saldo</p>
                                            )}
                                        </td>

                                        <td className="px-8 py-5">
                                            <div className="flex items-center justify-center gap-2">
                                                <Link
                                                    href={`/cuentas/${account.id}/editar`}
                                                    className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all active:scale-95"
                                                    title="Editar cuenta"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}

                                {accounts.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-20 text-center">
                                            <div className="text-4xl mb-3 opacity-20">💰</div>
                                            <p className="text-slate-400 font-medium italic">No hay cuentas registradas.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </main>
    )
}
