'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowDownRight, ArrowUpRight, ListChecks, Pencil, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { formatDateTime, formatMoney, friendlyAccountType, friendlyTransactionType } from '@/lib/utils'

type Account = {
  id: string
  name: string
  institution: string | null
  account_type: string
  current_balance: number
  is_external?: boolean | null
  include_in_balance?: boolean | null
}

type TransactionRow = {
  id: string
  transaction_type: string
  amount: number
  description: string | null
  transaction_date: string
  source_account_id: string | null
  destination_account_id: string | null
  related_credit_card_id: string | null
  related_debt_id: string | null
  affects_balance: boolean | null
  status: string
}

type LinkedCreditCard = {
  id: string
  name: string
}

function accountAffectsBalance(account: Account) {
  return account.is_external !== true && account.include_in_balance !== false
}

function signedAccountImpact(tx: TransactionRow, account: Account, linkedCreditCardId?: string | null) {
  if ((tx.status || 'completed') !== 'completed' || tx.affects_balance === false) return 0

  const amount = Number(tx.amount || 0)

  if (account.account_type === 'credit_card') {
    const belongsToCard =
      tx.source_account_id === account.id ||
      (linkedCreditCardId ? tx.related_credit_card_id === linkedCreditCardId : false)

    if (!belongsToCard) return 0
    if (tx.transaction_type === 'credit_card_purchase') return amount
    if (tx.transaction_type === 'credit_card_payment') return -amount
    if (tx.transaction_type === 'credit_card_refund') return -amount
    return 0
  }

  if (tx.destination_account_id === account.id && ['income', 'transfer'].includes(tx.transaction_type)) return amount
  if (
    tx.source_account_id === account.id &&
    ['expense', 'transfer', 'credit_card_payment', 'debt_payment'].includes(tx.transaction_type)
  ) {
    return -amount
  }

  return 0
}

export default function CuentaDetallePage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const accountId = params.id as string

  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [linkedCreditCard, setLinkedCreditCard] = useState<LinkedCreditCard | null>(null)

  const loadData = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData.session) {
      router.push('/')
      return
    }

    const { data: accountData, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .single()

    if (accountError || !accountData) {
      setMessage(accountError?.message || 'No se pudo cargar la cuenta.')
      setLoading(false)
      return
    }

    let cardData: LinkedCreditCard | null = null
    if ((accountData as Account).account_type === 'credit_card') {
      const { data: foundCard, error: cardError } = await supabase
        .from('credit_cards')
        .select('id, name')
        .eq('account_id', accountId)
        .maybeSingle()

      if (cardError) {
        setMessage(cardError.message)
      }

      cardData = (foundCard as LinkedCreditCard | null) ?? null
    }

    const accountMovementFilter = cardData?.id
      ? `source_account_id.eq.${accountId},destination_account_id.eq.${accountId},related_credit_card_id.eq.${cardData.id}`
      : `source_account_id.eq.${accountId},destination_account_id.eq.${accountId}`

    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('id, transaction_type, amount, description, transaction_date, source_account_id, destination_account_id, related_credit_card_id, related_debt_id, affects_balance, status')
      .or(accountMovementFilter)
      .order('transaction_date', { ascending: false })

    if (txError) {
      setMessage(txError.message)
      setLoading(false)
      return
    }

    setAccount(accountData as Account)
    setLinkedCreditCard(cardData)
    setTransactions((txData as TransactionRow[]) ?? [])
    setLoading(false)
  }, [accountId, router, supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
  }, [loadData])

  const movementSummary = useMemo(() => {
    if (!account) {
      return {
        inflows: 0,
        outflows: 0,
        noImpact: 0,
      }
    }

    return transactions.reduce(
      (acc, tx) => {
        const impact = signedAccountImpact(tx, account, linkedCreditCard?.id)
        if (impact > 0) acc.inflows += impact
        if (impact < 0) acc.outflows += Math.abs(impact)
        if (tx.affects_balance === false) acc.noImpact += Number(tx.amount || 0)
        return acc
      },
      { inflows: 0, outflows: 0, noImpact: 0 }
    )
  }, [account, linkedCreditCard, transactions])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm font-black uppercase tracking-widest text-slate-500">Cargando movimientos de cuenta...</p>
      </main>
    )
  }

  if (!account) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-sm">
          <p className="font-bold text-rose-600">{message || 'No se encontró la cuenta.'}</p>
          <Link href="/cuentas" className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black uppercase tracking-widest text-white">
            Volver a cuentas
          </Link>
        </div>
      </main>
    )
  }

  const accountReturnTo = encodeURIComponent(`/cuentas/${account.id}`)

  return (
    <main className="min-h-screen bg-[#eef3f8] pb-28 md:pb-12">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <nav className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Link href="/cuentas" className="flex items-center gap-1 transition hover:text-slate-950">
              <ArrowLeft size={14} /> Cuentas
            </Link>
            <span>/</span>
            <span className="text-slate-900">{account.name}</span>
          </nav>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Historial de cuenta</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">{account.name}</h1>
              <p className="mt-3 text-lg font-semibold text-slate-500">
                {friendlyAccountType(account.account_type)} · {account.institution || 'Sin institución'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href={`/movimientos/nuevo?type=expense&account=${account.id}&returnTo=${accountReturnTo}`} className="rounded-2xl bg-rose-500 px-5 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-rose-600">
                Registrar gasto
              </Link>
              <Link href={`/movimientos/nuevo?type=income&account=${account.id}&returnTo=${accountReturnTo}`} className="rounded-2xl bg-emerald-500 px-5 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-emerald-600">
                Registrar ingreso
              </Link>
              {account.account_type !== 'credit_card' && (
                <Link href={`/movimientos/nuevo?type=credit_card_payment&account=${account.id}&returnTo=${accountReturnTo}`} className="rounded-2xl bg-sky-500 px-5 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-sky-600">
                  Pagar TDC
                </Link>
              )}
              <Link href={`/cuentas/${account.id}/editar`} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black uppercase tracking-widest text-slate-700 shadow-sm transition hover:bg-slate-50">
                Editar saldo
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-8">
        {message && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {message}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Saldo actual</p>
            <p className={`mt-2 text-3xl font-black ${Number(account.current_balance || 0) >= 0 ? 'text-slate-950' : 'text-rose-600'}`}>
              {formatMoney(Number(account.current_balance || 0))}
            </p>
            {!accountAffectsBalance(account) && (
              <p className="mt-2 text-xs font-black uppercase tracking-widest text-sky-600">No afecta balance personal</p>
            )}
          </div>
          <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Entradas registradas</p>
            <p className="mt-2 text-3xl font-black text-emerald-700">{formatMoney(movementSummary.inflows)}</p>
          </div>
          <div className="rounded-[1.5rem] border border-rose-100 bg-rose-50 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-rose-700">Salidas registradas</p>
            <p className="mt-2 text-3xl font-black text-rose-700">{formatMoney(movementSummary.outflows)}</p>
          </div>
          <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-amber-700">Sin impacto</p>
            <p className="mt-2 text-3xl font-black text-amber-700">{formatMoney(movementSummary.noImpact)}</p>
          </div>
        </div>

        <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Auditoría</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Movimientos de esta cuenta</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Úsalo para comparar contra tu app bancaria y registrar cargos o ingresos faltantes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/movimientos?account=${account.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-700 transition hover:bg-slate-100">
                <ListChecks size={16} /> Ver con filtros
              </Link>
              <Link href={`/movimientos/nuevo?account=${account.id}&returnTo=${accountReturnTo}`} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-slate-800">
                <PlusCircle size={16} /> Nuevo movimiento
              </Link>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-400">Fecha</th>
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-400">Concepto</th>
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-400">Tipo</th>
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-400">Impacto</th>
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Monto</th>
                  <th className="px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-400">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => {
                  const impact = signedAccountImpact(tx, account, linkedCreditCard?.id)
                  const isInflow = impact > 0
                  const isOutflow = impact < 0

                  return (
                    <tr key={tx.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-4 text-sm font-semibold text-slate-600">{formatDateTime(tx.transaction_date)}</td>
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-950">{tx.description || 'Sin descripción'}</p>
                        {tx.affects_balance === false && (
                          <p className="mt-1 text-xs font-black uppercase tracking-widest text-amber-600">Ya incluido en saldo</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-600">{friendlyTransactionType(tx.transaction_type)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${
                          isInflow
                            ? 'bg-emerald-50 text-emerald-700'
                            : isOutflow
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-500'
                        }`}>
                          {isInflow && <ArrowUpRight size={14} />}
                          {isOutflow && <ArrowDownRight size={14} />}
                          {isInflow ? 'Entrada' : isOutflow ? 'Salida' : 'Sin impacto'}
                        </span>
                      </td>
                      <td className={`px-5 py-4 text-right font-black ${isInflow ? 'text-emerald-600' : isOutflow ? 'text-rose-600' : 'text-slate-700'}`}>
                        {isInflow ? '+' : isOutflow ? '-' : ''}{formatMoney(Number(tx.amount || 0))}
                      </td>
                      <td className="px-5 py-4">
                        <Link href={`/movimientos/${tx.id}/editar`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-950 hover:text-white">
                          <Pencil size={14} /> Editar
                        </Link>
                      </td>
                    </tr>
                  )
                })}

                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-14 text-center">
                      <p className="text-lg font-black text-slate-950">Todavía no hay movimientos en esta cuenta.</p>
                      <p className="mt-2 text-sm font-bold text-slate-500">
                        Registra los cargos o ingresos que falten para poder cuadrarla contra tu banco.
                      </p>
                      <Link href={`/movimientos/nuevo?account=${account.id}&returnTo=${accountReturnTo}`} className="mt-5 inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white">
                        Registrar primer movimiento
                      </Link>
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
