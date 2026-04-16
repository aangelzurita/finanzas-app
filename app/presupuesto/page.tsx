'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatMoney } from '@/lib/utils'
import { KpiCard } from '@/components/ui/KpiCard'
import { MiniStat } from '@/components/ui/MiniStat'

type BudgetRow = {
  id: string
  category_id: string
  period_month: number
  period_year: number
  budget_amount: number
}

type Category = {
  id: string
  name: string
}

type Transaction = {
  id: string
  category_id: string | null
  amount: number
  transaction_date: string
  affects_budget: boolean
  status: string
}

export default function PresupuestoPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('')
  const [saving, setSaving] = useState(false)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null)

  const today = new Date()
  const currentMonth = today.getMonth() + 1
  const currentYear = today.getFullYear()

  useEffect(() => {
    void initialize()
  }, [])

  const initialize = async () => {
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData.session) {
      window.location.href = '/'
      return
    }

    const [
      { data: budgetsData, error: budgetsError },
      { data: categoriesData, error: categoriesError },
      { data: txData, error: txError },
    ] = await Promise.all([
      supabase
        .from('budgets')
        .select('id, category_id, period_month, period_year, budget_amount')
        .eq('period_month', currentMonth)
        .eq('period_year', currentYear),
      supabase
        .from('categories')
        .select('id, name')
        .eq('category_type', 'expense')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('transactions')
        .select('id, category_id, amount, transaction_date, affects_budget, status')
        .eq('status', 'completed')
        .eq('affects_budget', true),
    ])

    if (budgetsError || categoriesError || txError) {
      setMessage(
        budgetsError?.message ||
        categoriesError?.message ||
        txError?.message ||
        'Error al cargar datos'
      )
      setMessageType('error')
    }

    setBudgets((budgetsData as BudgetRow[]) ?? [])
    setCategories((categoriesData as Category[]) ?? [])
    setTransactions((txData as Transaction[]) ?? [])
    setLoading(false)
  }

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCategoryId || !budgetAmount) return

    setSaving(true)
    setMessage('')

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user?.id

    if (!userId) {
      setMessage('No hay sesión activa.')
      setMessageType('error')
      setSaving(false)
      return
    }

    if (editingBudgetId) {
      const { error } = await supabase
        .from('budgets')
        .update({ budget_amount: Number(budgetAmount) })
        .eq('id', editingBudgetId)

      if (error) {
        setMessage(error.message)
        setMessageType('error')
      } else {
        setMessage('Presupuesto actualizado.')
        setMessageType('success')
        setShowForm(false)
        void initialize()
      }
    } else {
      // Check if already exists (shouldn't happen with filtered categories in select, but good to be safe)
      const { error } = await supabase
        .from('budgets')
        .insert({
          user_id: userId,
          category_id: selectedCategoryId,
          budget_amount: Number(budgetAmount),
          period_month: currentMonth,
          period_year: currentYear
        })

      if (error) {
        setMessage(error.message)
        setMessageType('error')
      } else {
        setMessage('Presupuesto creado.')
        setMessageType('success')
        setShowForm(false)
        void initialize()
      }
    }
    setSaving(false)
  }

  const handleDeleteBudget = async (id: string) => {
    if (!confirm('¿Eliminar este presupuesto?')) return
    setSaving(true)
    const { error } = await supabase.from('budgets').delete().eq('id', id)
    if (error) {
      setMessage(error.message)
      setMessageType('error')
    } else {
      void initialize()
    }
    setSaving(false)
  }

  const startEdit = (budget: any) => {
    setEditingBudgetId(budget.id)
    setSelectedCategoryId(budget.categoryId)
    setBudgetAmount(String(budget.budgetAmount))
    setShowForm(true)
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingBudgetId(null)
    setSelectedCategoryId('')
    setBudgetAmount('')
  }

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach((category) => {
      map.set(category.id, category.name)
    })
    return map
  }, [categories])

  const rows = useMemo(() => {
    return budgets.map((budget) => {
      const spent = transactions
        .filter((tx) => {
          if (!tx.category_id) return false
          if (tx.category_id !== budget.category_id) return false

          const txDate = new Date(tx.transaction_date)
          const txMonth = txDate.getMonth() + 1
          const txYear = txDate.getFullYear()

          return txMonth === budget.period_month && txYear === budget.period_year
        })
        .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)

      const remaining = Number(budget.budget_amount || 0) - spent
      const progress = budget.budget_amount > 0 ? (spent / budget.budget_amount) * 100 : 0

      return {
        id: budget.id,
        categoryId: budget.category_id,
        categoryName: categoryMap.get(budget.category_id) || 'Categoría',
        budgetAmount: Number(budget.budget_amount || 0),
        spent,
        remaining,
        progress,
      }
    })
  }, [budgets, transactions, categoryMap])

  const availableCategories = useMemo(() => {
    const usedIds = new Set(budgets.map(b => b.category_id))
    return categories.filter(c => !usedIds.has(c.id) || c.id === selectedCategoryId)
  }, [categories, budgets, selectedCategoryId])

  const totalBudget = rows.reduce((acc, row) => acc + row.budgetAmount, 0)
  const totalSpent = rows.reduce((acc, row) => acc + row.spent, 0)
  const totalRemaining = totalBudget - totalSpent

  const monthName = new Date(currentYear, currentMonth - 1, 1).toLocaleDateString('es-MX', {
    month: 'long',
    year: 'numeric',
  })

  const progressBarColor = (progress: number) => {
    if (progress < 70) return 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
    if (progress < 100) return 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
    return 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Cargando presupuesto...</p>
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
                <span className="text-slate-200 font-medium">Presupuesto</span>
              </nav>
              <h1 className="text-5xl font-extrabold tracking-tight italic uppercase">Budget Control</h1>
              <p className="text-slate-400 mt-2 text-lg capitalize">{monthName}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(!showForm)}
                className="rounded-2xl bg-emerald-500 hover:bg-emerald-600 transition-all px-6 py-4 font-bold text-white shadow-lg active:scale-95"
              >
                {showForm ? 'Ver listado' : 'Definir límite'}
              </button>
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
          <KpiCard title="Presupuesto Total" value={formatMoney(totalBudget)} valueClassName="text-slate-900" />
          <KpiCard title="Gastado Real" value={formatMoney(totalSpent)} valueClassName="text-rose-600" />
          <KpiCard
            title="Sobrante / Déficit"
            value={formatMoney(totalRemaining)}
            valueClassName={totalRemaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}
          />
        </div>

        {message && (
          <div className={`mb-6 rounded-2xl border p-4 text-sm font-bold shadow-sm ${messageType === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}>
            {message}
          </div>
        )}

        {showForm && (
          <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-6">
              {editingBudgetId ? 'Ajustar Presupuesto' : 'Definir Nuevo Límite'}
            </h2>
            <form onSubmit={handleSaveBudget} className="flex flex-col gap-6 md:flex-row md:items-end">
              <div className="flex-1">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Categoría</label>
                <select
                  disabled={!!editingBudgetId}
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all appearance-none disabled:opacity-50"
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                >
                  <option value="">Selecciona categoría</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Monto Mensual</label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 pl-10 pr-5 py-4 font-black text-slate-900 placeholder:text-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                    placeholder="0.00"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl bg-slate-900 px-8 py-4 font-bold text-white shadow-lg hover:bg-black transition active:scale-95 whitespace-nowrap disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-slate-200 px-6 py-4 font-bold text-slate-400 hover:bg-slate-50 transition active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="rounded-[2.5rem] border border-slate-100 bg-white shadow-xl overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
            <h2 className="text-2xl font-extrabold text-slate-900">Desglose por Categoría</h2>
            <span className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-black text-white uppercase tracking-wider shadow-md">
              Periodo: {monthName}
            </span>
          </div>

          <div className="divide-y divide-slate-50">
            {rows.map((row) => (
              <div key={row.id} className="p-8 group hover:bg-slate-50/30 transition-all">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${progressBarColor(row.progress)}`} />
                        <p className="text-lg font-black text-slate-900 uppercase tracking-tight">{row.categoryName}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-sm font-black ${row.progress > 90 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {row.progress.toFixed(0)}%
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(row)} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDeleteBudget(row.id)} className="p-2 text-slate-300 hover:text-rose-600 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-50">
                      <div
                        className={`h-full transition-all duration-1000 ease-out ${progressBarColor(row.progress)}`}
                        style={{ width: `${Math.min(row.progress, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 lg:w-[480px]">
                    <MiniStat label="Límite" value={formatMoney(row.budgetAmount)} />
                    <MiniStat label="Gastado" value={formatMoney(row.spent)} />
                    <MiniStat
                      label={row.remaining >= 0 ? 'Disponible' : 'Excedido'}
                      value={formatMoney(row.remaining)}
                      valueClassName={row.remaining >= 0 ? 'text-emerald-600' : 'text-rose-600 font-black'}
                    />
                  </div>
                </div>
              </div>
            ))}

            {rows.length === 0 && (
              <div className="py-24 text-center">
                <div className="text-6xl mb-6 opacity-20">📊</div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">No has definido presupuestos</h3>
                <p className="text-slate-400 max-w-sm mx-auto">Comienza definiendo límites mensuales por categoría para tomar el control de tus gastos.</p>
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-8 rounded-2xl bg-slate-900 px-8 py-4 font-bold text-white shadow-lg hover:bg-black transition active:scale-95"
                >
                  Definir mi primer límite
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
