'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { validateDebtAmounts } from '@/lib/debt-validation'

import { formatMoney, formatDateTime, friendlyTransactionType } from '@/lib/utils'

type Account = {
    id: string
    name: string
    account_type: string
    is_external?: boolean | null
    include_in_balance?: boolean | null
}

type Transaction = {
    id: string
    transaction_date: string
    amount: number
    description: string | null
    transaction_type: string
}

const paymentFrequencyLabels = {
    one_time: 'Unica vez',
    weekly: 'Semanal',
    biweekly: 'Quincenal',
    monthly: 'Mensual',
    quarterly: 'Trimestral',
    yearly: 'Anual',
}

function isMissingDebtScheduleColumn(error: { code?: string; message?: string } | null) {
    const message = error?.message?.toLowerCase() || ''
    return error?.code === 'PGRST204' ||
        message.includes('next_payment_date') ||
        message.includes('payment_frequency') ||
        message.includes('payment_account_id')
}

export default function EditarDeudaPage() {
    const supabase = createClient()
    const router = useRouter()
    const params = useParams()
    const debtId = params.id as string

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [messageType, setMessageType] = useState<'error' | 'success' | ''>('')
    const [history, setHistory] = useState<Transaction[]>([])
    const [accounts, setAccounts] = useState<Account[]>([])

    const [form, setForm] = useState({
        name: '',
        institution: '',
        total_amount: '',
        current_balance: '',
        monthly_payment: '',
        next_payment_date: '',
        payment_frequency: 'monthly',
        payment_account_id: '',
        interest_rate: '',
        status: '',
        notes: ''
    })

    useEffect(() => {
        void loadData()
    }, [debtId])

    const loadData = async () => {
        setLoading(true)
        const [debtRes, historyRes, accountsRes] = await Promise.all([
            supabase.from('debts').select('*').eq('id', debtId).single(),
            supabase.from('transactions').select('*').eq('related_debt_id', debtId).order('transaction_date', { ascending: false }),
            supabase.from('accounts').select('*').eq('is_active', true).neq('account_type', 'credit_card').order('name')
        ])

        if (debtRes.error || !debtRes.data) {
            setMessage(debtRes.error?.message || 'No se encontró la deuda.')
            setMessageType('error')
        } else {
            const data = debtRes.data
            setForm({
                name: data.name,
                institution: data.institution || '',
                total_amount: String(data.total_amount),
                current_balance: String(data.current_balance),
                monthly_payment: String(data.monthly_payment || ''),
                next_payment_date: data.next_payment_date || '',
                payment_frequency: data.payment_frequency || 'monthly',
                payment_account_id: data.payment_account_id || '',
                interest_rate: String(data.interest_rate || ''),
                status: data.status,
                notes: data.notes || ''
            })
            setHistory((historyRes.data as Transaction[]) ?? [])
            setAccounts((accountsRes.data as Account[]) ?? [])
        }
        setLoading(false)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setMessage('')
        setMessageType('')

        const totalAmount = Number(form.total_amount)
        const currentBalance = Number(form.current_balance)
        const monthlyPayment = form.monthly_payment ? Number(form.monthly_payment) : null
        const validationError = validateDebtAmounts({
            totalAmount,
            currentBalance,
            monthlyPayment,
        })

        if (validationError) {
            setMessage(validationError)
            setMessageType('error')
            setSaving(false)
            return
        }

        const payload: Record<string, unknown> = {
            name: form.name,
            institution: form.institution || null,
            total_amount: totalAmount,
            current_balance: currentBalance,
            monthly_payment: monthlyPayment,
            next_payment_date: form.next_payment_date || null,
            payment_frequency: form.payment_frequency,
            payment_account_id: form.payment_account_id || null,
            interest_rate: form.interest_rate ? Number(form.interest_rate) : null,
            status: form.status,
            notes: form.notes || null,
            updated_at: new Date().toISOString()
        }

        let { error } = await supabase
            .from('debts')
            .update(payload)
            .eq('id', debtId)

        if (error && isMissingDebtScheduleColumn(error)) {
            delete payload.next_payment_date
            delete payload.payment_frequency
            delete payload.payment_account_id
            const retry = await supabase.from('debts').update(payload).eq('id', debtId)
            error = retry.error
        }

        if (error) {
            setMessage(`Error: ${error.message}`)
            setMessageType('error')
            setSaving(false)
        } else {
            router.push('/deudas')
            router.refresh()
        }
    }

    const handleArchive = async () => {
        if (!confirm('¿Estás seguro de que quieres archivar esta deuda? Ya no aparecerá en tus listas activas.')) return

        setSaving(true)
        const { error } = await supabase
            .from('debts')
            .update({ status: 'canceled', updated_at: new Date().toISOString() })
            .eq('id', debtId)

        if (error) {
            setMessage(`Error: ${error.message}`)
            setMessageType('error')
            setSaving(false)
        } else {
            router.push('/deudas')
            router.refresh()
        }
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                    <p className="text-slate-600 font-medium">Cargando detalles...</p>
                </div>
            </main>
        )
    }

    const total = Number(form.total_amount || 0)
    const current = Number(form.current_balance || 0)
    const paid = Math.max(0, total - current)
    const progress = total > 0 ? (paid / total) * 100 : 0

    return (
        <main className="min-h-screen bg-slate-100 pb-20">
            <section className="bg-slate-950 text-white">
                <div className="max-w-3xl mx-auto px-6 py-12">
                    <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                        <Link href="/" className="hover:text-white transition">Home</Link>
                        <span>/</span>
                        <Link href="/deudas" className="hover:text-white transition">Deudas</Link>
                        <span>/</span>
                        <span className="text-slate-200 font-medium">Editar</span>
                    </nav>
                    <h1 className="text-5xl font-extrabold tracking-tight uppercase tracking-tighter">Gestionar Deuda</h1>
                    <p className="text-slate-400 mt-3 text-lg">Actualiza el saldo o marca la deuda como liquidada.</p>
                </div>
            </section>

            <section className="max-w-3xl mx-auto px-6 -mt-8 space-y-8">
                {/* Resumen de Progreso Visual */}
                <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-xl">
                    <div className="flex justify-between items-end mb-4">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estado de Pago</p>
                            <p className="text-4xl font-black text-slate-900 tracking-tighter">{progress.toFixed(1)}%</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Restante</p>
                            <p className="text-2xl font-black text-rose-600 tracking-tighter">{formatMoney(current)}</p>
                        </div>
                    </div>
                    <div className="h-6 w-full bg-slate-100 rounded-full overflow-hidden p-1 border border-slate-50">
                        <div className="h-full bg-slate-950 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
                    </div>
                </div>

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
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Estatus Actual</label>
                            <select
                                name="status"
                                value={form.status}
                                onChange={handleChange}
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all"
                            >
                                <option value="active">Activa / En curso</option>
                                <option value="paid">Liquidada / Pagada</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Institución</label>
                            <input
                                name="institution"
                                value={form.institution}
                                onChange={handleChange}
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Monto Original</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                required
                                name="total_amount"
                                value={form.total_amount}
                                onChange={handleChange}
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-xl"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-rose-400 uppercase tracking-[0.2em] mb-2">Saldo Pendiente Real</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                name="current_balance"
                                value={form.current_balance}
                                onChange={handleChange}
                                className="w-full rounded-2xl border-2 border-rose-50 p-4 font-bold text-rose-600 focus:border-rose-500 focus:ring-0 transition-all text-xl shadow-inner"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Mensualidad (Opcional)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                name="monthly_payment"
                                value={form.monthly_payment}
                                onChange={handleChange}
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Próxima fecha de pago</label>
                            <input
                                type="date"
                                name="next_payment_date"
                                value={form.next_payment_date}
                                onChange={handleChange}
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Frecuencia de pago</label>
                            <select
                                name="payment_frequency"
                                value={form.payment_frequency}
                                onChange={handleChange}
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all"
                            >
                                {Object.entries(paymentFrequencyLabels).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Cuenta de pago habitual</label>
                            <select
                                name="payment_account_id"
                                value={form.payment_account_id}
                                onChange={handleChange}
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all"
                            >
                                <option value="">Sin cuenta vinculada</option>
                                {accounts.map((account) => (
                                    <option key={account.id} value={account.id}>
                                        {account.name}{account.is_external === true || account.include_in_balance === false ? ' · externa' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Tasa Anual (Opcional)</label>
                            <input
                                type="number"
                                step="0.01"
                                name="interest_rate"
                                value={form.interest_rate}
                                onChange={handleChange}
                                className="w-full rounded-2xl border-2 border-slate-100 p-4 font-bold text-slate-900 focus:border-slate-900 focus:ring-0 transition-all text-lg"
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
                            className="w-full rounded-2xl border-2 border-slate-100 p-4 font-medium text-slate-700 focus:border-slate-900 focus:ring-0 transition-all"
                        />
                    </div>

                    <div className="flex flex-col gap-4 pt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full rounded-2xl bg-slate-900 py-5 text-lg font-black text-white hover:bg-slate-800 transition-all active:scale-[0.98] shadow-xl disabled:opacity-50"
                        >
                            {saving ? 'ACTUALIZANDO...' : 'GUARDAR CAMBIOS'}
                        </button>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={handleArchive}
                                className="rounded-2xl border-2 border-rose-100 py-4 font-bold text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-all"
                            >
                                ARCHIVAR
                            </button>
                            <Link
                                href="/deudas"
                                className="rounded-2xl border-2 border-slate-100 py-4 text-center font-bold text-slate-400 hover:text-slate-600 transition-all flex items-center justify-center"
                            >
                                CANCELAR
                            </Link>
                        </div>
                    </div>

                    {message && (
                        <div className={`rounded-2xl border p-4 text-center ${messageType === 'error' ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
                            <p className={`font-bold ${messageType === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>{message}</p>
                        </div>
                    )}
                </form>

                {/* Historial de Pagos Section */}
                <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-xl overflow-hidden">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase mb-6">Historial de Pagos</h2>

                    {history.length > 0 ? (
                        <div className="overflow-x-auto -mx-8 px-8">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left border-b border-slate-100">
                                        <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                                        <th className="py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                                        <th className="py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((tx) => (
                                        <tr key={tx.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                                            <td className="py-4 text-sm font-medium text-slate-500">{formatDateTime(tx.transaction_date)}</td>
                                            <td className="py-4 text-sm font-bold text-slate-900">{tx.description || friendlyTransactionType(tx.transaction_type)}</td>
                                            <td className="py-4 text-right text-sm font-black text-emerald-600">{formatMoney(tx.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="py-10 text-center">
                            <p className="text-slate-400 font-medium italic">Aún no hay pagos registrados para esta deuda.</p>
                            <Link href="/movimientos/nuevo" className="mt-4 inline-block text-[10px] font-black text-slate-900 uppercase tracking-widest hover:underline">
                                Registrar un pago ahora
                            </Link>
                        </div>
                    )}
                </div>
            </section>
        </main>
    )
}
