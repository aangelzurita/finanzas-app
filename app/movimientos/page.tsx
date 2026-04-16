'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatMoney, formatDateTime, friendlyTransactionType } from '@/lib/utils'

type TransactionRow = {
  id: string
  transaction_type: string
  amount: number
  description: string | null
  transaction_date: string
  source_account_id: string | null
  destination_account_id: string | null
  category_id: string | null
  related_credit_card_id: string | null
  related_debt_id: string | null
  status: string
}

type Account = {
  id: string
  name: string
  account_type: string
}

export default function MovimientosPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [typeFilter, setTypeFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [message, setMessage] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    void initialize()
  }, [])

  const initialize = async () => {
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData.session) {
      window.location.href = '/'
      return
    }

    await loadData()
    setLoading(false)
  }

  const loadData = async () => {
    const [{ data: txData }, { data: accountsData }] = await Promise.all([
      supabase
        .from('transactions')
        .select(
          'id, transaction_type, amount, description, transaction_date, source_account_id, destination_account_id, category_id, related_credit_card_id, related_debt_id, status'
        )
        .order('transaction_date', { ascending: false }),
      supabase
        .from('accounts')
        .select('id, name, account_type')
        .eq('is_active', true)
        .order('name'),
    ])

    setTransactions((txData as TransactionRow[]) ?? [])
    setAccounts((accountsData as Account[]) ?? [])
  }

  const accountMap = useMemo(() => {
    const map = new Map<string, string>()
    accounts.forEach((account) => {
      map.set(account.id, account.name)
    })
    return map
  }, [accounts])

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesType =
        typeFilter === 'all' ? true : tx.transaction_type === typeFilter

      const matchesAccount =
        accountFilter === 'all'
          ? true
          : tx.source_account_id === accountFilter ||
          tx.destination_account_id === accountFilter

      const txDate = tx.transaction_date.slice(0, 10)
      const matchesFrom = dateFrom ? txDate >= dateFrom : true
      const matchesTo = dateTo ? txDate <= dateTo : true

      return matchesType && matchesAccount && matchesFrom && matchesTo
    })
  }, [transactions, typeFilter, accountFilter, dateFrom, dateTo])

  const accountLabel = (id: string | null) => {
    if (!id) return '—'
    return accountMap.get(id) || 'Cuenta'
  }

  const clearFilters = () => {
    setTypeFilter('all')
    setAccountFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      '¿Seguro que quieres eliminar este movimiento? Esta acción no se puede deshacer.'
    )
    if (!confirmed) return

    setDeletingId(id)
    setMessage('')

    const { error } = await supabase.from('transactions').delete().eq('id', id)

    if (error) {
      setMessage(`Error al eliminar: ${error.message}`)
      setDeletingId(null)
      return
    }

    setMessage('Movimiento eliminado correctamente.')
    await loadData()
    setDeletingId(null)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-600">Cargando movimientos...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <section className="bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-2">Finanzas App</p>
              <h1 className="text-4xl font-bold tracking-tight">Movimientos</h1>
              <p className="text-slate-300 mt-2">
                Consulta y administra tu actividad financiera
              </p>
            </div>

            <div className="flex gap-3">
              <Link
                href="/movimientos/nuevo"
                className="rounded-2xl bg-emerald-500 hover:bg-emerald-600 transition px-5 py-3 font-semibold text-white"
              >
                Nuevo movimiento
              </Link>

              <Link
                href="/"
                className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 font-semibold text-slate-200 hover:bg-slate-800 transition"
              >
                Volver al dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm mb-6">
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-5">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Tipo
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
                <option value="transfer">Transferencia</option>
                <option value="credit_card_purchase">Compra con TDC</option>
                <option value="credit_card_payment">Pago de TDC</option>
                <option value="debt_payment">Pago de deuda</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Cuenta
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
              >
                <option value="all">Todas</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Desde
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Hasta
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={clearFilters}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {message && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Historial</h2>
            <p className="text-sm text-slate-500">
              {filteredTransactions.length} movimientos
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px]">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-5 py-3 text-sm font-semibold text-slate-600">Fecha</th>
                  <th className="px-5 py-3 text-sm font-semibold text-slate-600">Descripción</th>
                  <th className="px-5 py-3 text-sm font-semibold text-slate-600">Tipo</th>
                  <th className="px-5 py-3 text-sm font-semibold text-slate-600">Origen</th>
                  <th className="px-5 py-3 text-sm font-semibold text-slate-600">Destino</th>
                  <th className="px-5 py-3 text-sm font-semibold text-slate-600">Monto</th>
                  <th className="px-5 py-3 text-sm font-semibold text-slate-600">Estatus</th>
                  <th className="px-5 py-3 text-sm font-semibold text-slate-600">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-slate-200">
                    <td className="px-5 py-4 text-sm text-slate-700 whitespace-nowrap">
                      {formatDateTime(tx.transaction_date)}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-900 font-medium">
                      {tx.description || 'Sin descripción'}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {friendlyTransactionType(tx.transaction_type)}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {accountLabel(tx.source_account_id)}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {accountLabel(tx.destination_account_id)}
                    </td>

                    <td className="px-5 py-4 text-sm font-semibold text-slate-900 whitespace-nowrap">
                      {formatMoney(Number(tx.amount || 0))}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                        {tx.status}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm whitespace-nowrap">
                      <div className="flex gap-2">
                        <Link
                          href={`/movimientos/${tx.id}/editar`}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                        >
                          Editar
                        </Link>

                        <button
                          onClick={() => handleDelete(tx.id)}
                          disabled={deletingId === tx.id}
                          className="rounded-lg border border-rose-300 px-3 py-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                        >
                          {deletingId === tx.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-slate-500">
                      No hay movimientos con esos filtros.
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