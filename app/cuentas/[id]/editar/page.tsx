'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

function isMissingExternalAccountColumn(error: { code?: string; message?: string } | null) {
    const message = error?.message?.toLowerCase() || ''
    return error?.code === 'PGRST204' || (message.includes('is_external') || message.includes('include_in_balance'))
}

type AccountTransaction = {
    amount: number | string | null
    transaction_type: string | null
    source_account_id: string | null
    destination_account_id: string | null
    affects_balance: boolean | null
    status: string | null
}

type CreditCardRow = {
    id: string
}

const INFLOW_TYPES = new Set(['income', 'transfer'])
const OUTFLOW_TYPES = new Set(['expense', 'transfer', 'credit_card_payment', 'debt_payment'])

export default function EditarCuentaPage() {
    const supabase = createClient()
    const router = useRouter()
    const params = useParams()
    const accountId = params.id as string

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [message, setMessage] = useState('')
    const [messageType, setMessageType] = useState<'error' | 'success' | ''>('')

    const [name, setName] = useState('')
    const [institution, setInstitution] = useState('')
    const [accountType, setAccountType] = useState('debit')
    const [currentBalance, setCurrentBalance] = useState('')
    const [isExternal, setIsExternal] = useState(false)

    useEffect(() => {
        void loadAccount()
    }, [accountId])

    const loadAccount = async () => {
        const { data, error } = await supabase
            .from('accounts')
            .select('*')
            .eq('id', accountId)
            .single()

        if (error || !data) {
            setMessage(error?.message || 'No se pudo cargar la cuenta.')
            setMessageType('error')
            setLoading(false)
            return
        }

        setName(data.name)
        setInstitution(data.institution || '')
        setAccountType(data.account_type)
        setCurrentBalance(String(data.current_balance))
        setIsExternal(data.is_external === true || data.include_in_balance === false)
        setLoading(false)
    }

    const fail = (text: string) => {
        setMessage(text)
        setMessageType('error')
        setSaving(false)
        setDeleting(false)
    }

    const loadAffectingTransactions = async () => {
        const pageSize = 1000
        let from = 0
        let allRows: AccountTransaction[] = []

        while (true) {
            const { data, error } = await supabase
                .from('transactions')
                .select('amount, transaction_type, source_account_id, destination_account_id, affects_balance, status')
                .or(`source_account_id.eq.${accountId},destination_account_id.eq.${accountId}`)
                .range(from, from + pageSize - 1)

            if (error) throw new Error(error.message)

            const rows = (data as AccountTransaction[] | null) ?? []
            allRows = allRows.concat(rows)

            if (rows.length < pageSize) break
            from += pageSize
        }

        return allRows.filter((tx) => (tx.status || 'completed') === 'completed' && tx.affects_balance !== false)
    }

    const calculateInitialBalanceForRealBalance = async (realCurrentBalance: number) => {
        const transactions = await loadAffectingTransactions()

        const totals = transactions.reduce(
            (acc, tx) => {
                const amount = Number(tx.amount || 0)
                const type = tx.transaction_type || ''

                if (tx.destination_account_id === accountId && INFLOW_TYPES.has(type)) {
                    acc.inflows += amount
                }

                if (tx.source_account_id === accountId && OUTFLOW_TYPES.has(type)) {
                    acc.outflows += amount
                }

                return acc
            },
            { inflows: 0, outflows: 0 }
        )

        return realCurrentBalance - totals.inflows + totals.outflows
    }

    const loadCreditCardForAccount = async () => {
        const { data, error } = await supabase
            .from('credit_cards')
            .select('id')
            .eq('account_id', accountId)
            .maybeSingle()

        if (error) throw new Error(error.message)
        return data as CreditCardRow | null
    }

    const calculateCreditCardInitialBalance = async (creditCardId: string, realCurrentBalance: number) => {
        const pageSize = 1000
        let from = 0
        let transactions: AccountTransaction[] = []

        while (true) {
            const { data, error } = await supabase
                .from('transactions')
                .select('amount, transaction_type, source_account_id, destination_account_id, affects_balance, status')
                .eq('related_credit_card_id', creditCardId)
                .range(from, from + pageSize - 1)

            if (error) throw new Error(error.message)

            const rows = (data as AccountTransaction[] | null) ?? []
            transactions = transactions.concat(rows)

            if (rows.length < pageSize) break
            from += pageSize
        }

        const movementNet = transactions
            .filter((tx) => (tx.status || 'completed') === 'completed' && tx.affects_balance !== false)
            .reduce((acc, tx) => {
                const amount = Number(tx.amount || 0)

                if (tx.transaction_type === 'credit_card_purchase') return acc + amount
                if (tx.transaction_type === 'credit_card_payment') return acc - amount
                if (tx.transaction_type === 'credit_card_refund') return acc - amount

                return acc
            }, 0)

        return Number((realCurrentBalance - movementNet).toFixed(2))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setMessage('')
        setMessageType('')

        if (!name.trim()) return fail('Ingresa el nombre de la cuenta.')
        if (currentBalance === '') return fail('Ingresa el saldo.')

        const realCurrentBalance = Number(currentBalance)
        if (!Number.isFinite(realCurrentBalance)) return fail('Ingresa un saldo válido.')

        let adjustedInitialBalance = realCurrentBalance
        let linkedCreditCardId: string | null = null

        try {
            if (accountType === 'credit_card') {
                const linkedCard = await loadCreditCardForAccount()
                linkedCreditCardId = linkedCard?.id || null
                adjustedInitialBalance = linkedCreditCardId
                    ? await calculateCreditCardInitialBalance(linkedCreditCardId, realCurrentBalance)
                    : realCurrentBalance
            } else {
                adjustedInitialBalance = await calculateInitialBalanceForRealBalance(realCurrentBalance)
            }
        } catch (error) {
            fail(error instanceof Error ? error.message : 'No se pudo calcular el saldo base de la cuenta.')
            return
        }

        const payload: Record<string, unknown> = {
            name: name.trim(),
            institution: institution.trim() || null,
            account_type: accountType,
            initial_balance: adjustedInitialBalance,
            current_balance: realCurrentBalance,
            is_external: isExternal,
            include_in_balance: !isExternal,
        }

        let { error } = await supabase
            .from('accounts')
            .update(payload)
            .eq('id', accountId)

        if (error && isMissingExternalAccountColumn(error)) {
            delete payload.is_external
            delete payload.include_in_balance
            const retry = await supabase.from('accounts').update(payload).eq('id', accountId)
            error = retry.error
        }

        if (error) {
            fail(error.message)
            return
        }

        const { error: recalculationError } = linkedCreditCardId
            ? await supabase.rpc('recalculate_credit_card_balance', { p_credit_card_id: linkedCreditCardId })
            : await supabase.rpc('recalculate_account_balance', { p_account_id: accountId })

        if (recalculationError) {
            fail(`La cuenta se guardó, pero no se pudo recalcular el saldo: ${recalculationError.message}`)
            return
        }

        setMessage('Cuenta actualizada correctamente.')
        setMessageType('success')

        setTimeout(() => {
            router.push('/cuentas')
            router.refresh()
        }, 700)
    }

    const handleDelete = async () => {
        if (!confirm('¿Estás seguro de que quieres archivar esta cuenta? Se mantendrá el historial de movimientos pero ya no aparecerá en tus listas activas.')) return

        setDeleting(true)
        const { error } = await supabase
            .from('accounts')
            .update({ is_active: false })
            .eq('id', accountId)

        if (error) {
            fail(error.message)
            return
        }

        setMessage('Cuenta archivada correctamente.')
        setMessageType('success')

        setTimeout(() => {
            router.push('/cuentas')
            router.refresh()
        }, 700)
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                    <p className="text-slate-600 font-medium">Cargando cuenta...</p>
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
                                <Link href="/cuentas" className="hover:text-white transition">Cuentas</Link>
                                <span>/</span>
                                <span className="text-slate-200 font-medium">Editar</span>
                            </nav>
                            <h1 className="text-5xl font-extrabold tracking-tight">Editar Cuenta</h1>
                            <p className="text-slate-400 mt-3 text-lg">
                                Modifica los detalles de tu cuenta o elimínala si ya no la usas.
                            </p>
                        </div>

                        <Link
                            href="/cuentas"
                            className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition-all active:scale-95 shadow-lg"
                        >
                            Cerrar
                        </Link>
                    </div>
                </div>
            </section>

            <section className="max-w-3xl mx-auto px-6 -mt-8">
                <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl">
                    <div className="mb-8 border-b border-slate-100 pb-6 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Detalles de la Cuenta</h2>
                            <p className="text-slate-400 text-sm mt-1">Actualiza la información de tu cuenta.</p>
                        </div>

                        <button
                            onClick={handleDelete}
                            disabled={deleting || saving}
                            className="rounded-2xl border-2 border-rose-50 px-4 py-2 text-rose-600 font-bold hover:bg-rose-50 transition-all active:scale-95"
                        >
                            {deleting ? 'Borrando...' : 'Eliminar'}
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-6">
                            <Field label="Nombre de la cuenta">
                                <input
                                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 placeholder:text-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                                    placeholder="Ej. Nómina Bancomer, Ahorro Personal"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </Field>

                            <Field label="Institución / Banco">
                                <input
                                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-medium text-slate-700 placeholder:text-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                                    placeholder="Ej. BBVA, Santander, Efectivo"
                                    value={institution}
                                    onChange={(e) => setInstitution(e.target.value)}
                                />
                            </Field>

                            <div className="grid gap-6 md:grid-cols-2">
                                <Field label="Tipo de Cuenta">
                                    <select
                                        className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all appearance-none"
                                        value={accountType}
                                        onChange={(e) => setAccountType(e.target.value)}
                                    >
                                        <option value="debit">Débito</option>
                                        <option value="cash">Efectivo</option>
                                        <option value="savings">Ahorro / Fondos</option>
                                        <option value="investment">Inversión</option>
                                        <option value="credit_card">Tarjeta de Crédito</option>
                                    </select>
                                </Field>

                                <Field label="Saldo real actual">
                                    <div className="relative">
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 pl-10 pr-5 py-4 font-black text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                                            placeholder="0.00"
                                            value={currentBalance}
                                            onChange={(e) => setCurrentBalance(e.target.value)}
                                        />
                                    </div>
                                    <p className="text-xs font-bold text-slate-400">
                                        Usa el saldo real que ves en tu banco. La app ajustará la base de la cuenta para que los próximos movimientos no descuadren el saldo.
                                    </p>
                                </Field>
                            </div>

                            <label className="flex cursor-pointer items-start gap-4 rounded-[2rem] border-2 border-slate-100 bg-slate-50/50 p-5">
                                <div className="relative mt-1">
                                    <input
                                        type="checkbox"
                                        className="peer hidden"
                                        checked={isExternal}
                                        onChange={(e) => setIsExternal(e.target.checked)}
                                    />
                                    <div className="h-6 w-11 rounded-full bg-slate-200 transition-colors peer-checked:bg-sky-500"></div>
                                    <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5"></div>
                                </div>
                                <div>
                                    <span className="block text-sm font-black uppercase text-slate-900">Cuenta externa / no propia</span>
                                    <span className="block text-xs font-bold text-slate-400">
                                        Se puede usar como referencia, pero no suma al saldo personal ni a la proyección.
                                    </span>
                                </div>
                            </label>
                        </div>

                        <div className="pt-6">
                            <button
                                type="submit"
                                disabled={saving || deleting}
                                className="w-full rounded-[2rem] bg-slate-900 py-6 text-xl font-black text-white hover:bg-slate-800 transition-all active:scale-[0.98] shadow-xl disabled:opacity-50"
                            >
                                {saving ? 'Guardando...' : 'Guardar Cambios'}
                            </button>

                            {message && (
                                <div className={`mt-6 rounded-2xl p-4 text-center text-sm font-bold ${messageType === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                    }`}>
                                    {message}
                                </div>
                            )}
                        </div>
                    </form>
                </div>
            </section>
        </main>
    )
}

function Field({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    return (
        <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
            {children}
        </div>
    )
}
