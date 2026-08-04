'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, ListChecks, PlusCircle, Tags } from 'lucide-react'
import { MainNavigation } from '@/components/ui/MainNavigation'
import { MiniStat } from '@/components/ui/MiniStat'
import { createClient } from '@/lib/supabase-browser'
import { formatMoney } from '@/lib/utils'
import {
  buildBudgetRows,
  buildCategoryChartData,
  type Budget,
  type BudgetProgress,
  type Category,
  type Transaction,
} from '@/lib/dashboard'
import {
  getPendingInstallmentAmount,
  type CreditCardInstallment,
} from '@/lib/credit-card-installments'
import { isBudgetAffectingTransaction } from '@/lib/budget-rules'

function monthRange(value = new Date()) {
  const start = new Date(value.getFullYear(), value.getMonth(), 1)
  const end = new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999)
  return {
    start,
    end,
    month: value.getMonth() + 1,
    year: value.getFullYear(),
  }
}

export default function GastosPage() {
  const supabase = createClient()
  const current = useMemo(() => monthRange(), [])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [installments, setInstallments] = useState<CreditCardInstallment[]>([])

  useEffect(() => {
    const loadData = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/'
        return
      }

      const [
        { data: txData, error: txError },
        { data: categoriesData, error: categoriesError },
        { data: budgetsData, error: budgetsError },
        { data: installmentData, error: installmentError },
      ] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .gte('transaction_date', current.start.toISOString())
          .lte('transaction_date', current.end.toISOString()),
        supabase.from('categories').select('*').eq('is_active', true),
        supabase
          .from('budgets')
          .select('id, category_id, period_month, period_year, budget_amount')
          .eq('period_month', current.month)
          .eq('period_year', current.year),
        supabase.from('credit_card_installments').select('*').neq('status', 'canceled'),
      ])

      const firstError = [txError, categoriesError, budgetsError, installmentError].find(Boolean)
      if (firstError) setMessage(firstError.message)

      setTransactions((txData as Transaction[]) ?? [])
      setCategories((categoriesData as Category[]) ?? [])
      setBudgets((budgetsData as Budget[]) ?? [])
      setInstallments((installmentData as CreditCardInstallment[]) ?? [])
      setLoading(false)
    }

    void loadData()
  }, [current, supabase])

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const msiPurchaseIds = useMemo(
    () => new Set(installments.map((plan) => plan.purchase_transaction_id).filter(Boolean) as string[]),
    [installments]
  )
  const installmentBudgetAmounts = useMemo(() => {
    const amounts = new Map<string, number>()
    installments
      .filter((plan) => plan.status === 'active')
      .forEach((plan) => {
        if (!plan.category_id) return
        amounts.set(plan.category_id, Number(amounts.get(plan.category_id) || 0) + getPendingInstallmentAmount(plan, current.end))
      })
    return amounts
  }, [installments, current.end])
  const budgetRows = useMemo<BudgetProgress[]>(
    () => buildBudgetRows(budgets, transactions, categoryMap, installmentBudgetAmounts, msiPurchaseIds),
    [budgets, transactions, categoryMap, installmentBudgetAmounts, msiPurchaseIds]
  )
  const categoryData = useMemo(
    () => buildCategoryChartData(transactions, categories, installmentBudgetAmounts, msiPurchaseIds),
    [transactions, categories, installmentBudgetAmounts, msiPurchaseIds]
  )
  const generatedExpense = useMemo(
    () =>
      transactions
        .filter((tx) => isBudgetAffectingTransaction(tx, msiPurchaseIds))
        .reduce((acc, tx) => acc + Number(tx.amount || 0), 0) +
      Array.from(installmentBudgetAmounts.values()).reduce((acc, value) => acc + value, 0),
    [transactions, installmentBudgetAmounts, msiPurchaseIds]
  )
  const totalBudget = useMemo(() => budgetRows.reduce((acc, row) => acc + Number(row.budgetAmount || 0), 0), [budgetRows])
  const totalSpent = useMemo(() => budgetRows.reduce((acc, row) => acc + Number(row.spent || 0), 0), [budgetRows])
  const exceeded = useMemo(() => budgetRows.filter((row) => row.remaining < 0), [budgetRows])
  const uncategorized = useMemo(
    () =>
      transactions
        .filter((tx) => isBudgetAffectingTransaction(tx, msiPurchaseIds))
        .filter((tx) => !tx.category_id)
        .reduce((acc, tx) => acc + Number(tx.amount || 0), 0),
    [transactions, msiPurchaseIds]
  )

  if (loading) {
    return (
      <main className="finance-shell flex min-h-screen items-center justify-center">
        <p className="text-sm font-black uppercase tracking-widest text-slate-500">Analizando gastos...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] pb-28 md:pb-12">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-600">Gastos</p>
          <h1 className="mt-3 text-5xl font-black tracking-tight text-slate-950">Dónde se va el dinero</h1>
          <p className="mt-3 max-w-2xl text-lg font-semibold text-slate-500">
            Gasto generado, presupuesto, categorías excedidas y fugas del mes actual.
          </p>
        </div>
      </section>

      <section className="relative z-20 mx-auto max-w-7xl px-6 -mt-8">
        <MainNavigation />

        {message && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {message}
          </div>
        )}

        <div className="mb-6 grid gap-3 md:grid-cols-4">
          {[
            { label: 'Registrar gasto', href: '/movimientos/nuevo?type=expense', icon: PlusCircle },
            { label: 'Movimientos', href: '/movimientos', icon: ListChecks },
            { label: 'Presupuesto', href: '/presupuesto', icon: BarChart3 },
            { label: 'Categorías', href: '/categorias', icon: Tags },
          ].map((item) => {
            const Icon = item.icon

            return (
              <Link key={item.label} href={item.href} className="rounded-2xl border border-slate-200 bg-white p-4 font-black text-slate-950 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                <Icon size={20} className="mb-3 text-slate-400" />
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <MiniStat label="Gasto generado" value={formatMoney(generatedExpense)} valueClassName="text-rose-600" />
          <MiniStat label="Presupuesto" value={formatMoney(totalBudget)} />
          <MiniStat label="Gastado presupuestal" value={formatMoney(totalSpent)} valueClassName={totalSpent <= totalBudget ? 'text-slate-950' : 'text-rose-600'} />
          <MiniStat label="Sin categoría" value={formatMoney(uncategorized)} valueClassName={uncategorized > 0 ? 'text-amber-600' : 'text-slate-950'} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="finance-card-strong rounded-[2rem] p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Presupuesto</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Categorías bajo presión</h2>
              </div>
              <BarChart3 className="text-slate-400" />
            </div>
            <div className="space-y-4">
              {(budgetRows.length > 0 ? budgetRows : []).sort((a, b) => b.progress - a.progress).slice(0, 8).map((row) => (
                <div key={row.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-slate-950">{row.categoryName}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {formatMoney(row.spent)} de {formatMoney(row.budgetAmount)}
                      </p>
                    </div>
                    <p className={`font-black ${row.remaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {row.remaining >= 0 ? formatMoney(row.remaining) : `-${formatMoney(Math.abs(row.remaining))}`}
                    </p>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${row.progress < 70 ? 'bg-emerald-500' : row.progress < 100 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${Math.min(row.progress, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {budgetRows.length === 0 && <EmptyText text="No hay presupuestos definidos para este mes." />}
            </div>
          </section>

          <div className="space-y-6">
            <section className={`rounded-[2rem] border p-6 shadow-sm ${exceeded.length > 0 ? 'border-rose-100 bg-rose-50/70' : 'border-emerald-100 bg-emerald-50/70'}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Atención</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    {exceeded.length > 0 ? `${exceeded.length} categoría(s) excedida(s)` : 'Sin categorías excedidas'}
                  </h2>
                </div>
                <AlertTriangle className={exceeded.length > 0 ? 'text-rose-500' : 'text-emerald-500'} />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-600">
                {exceeded[0]
                  ? `${exceeded[0].categoryName} excedió su presupuesto por ${formatMoney(Math.abs(exceeded[0].remaining))}.`
                  : 'Tu gasto presupuestal está dentro de los límites registrados.'}
              </p>
            </section>

            <section className="finance-card rounded-[2rem] p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Fugas</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">Top categorías</h2>
                </div>
                <Tags className="text-slate-400" />
              </div>
              <div className="space-y-3">
                {categoryData.slice(0, 6).map((item, index) => {
                  const max = categoryData[0]?.value || 1
                  const width = Math.min(100, Math.max(6, (item.value / max) * 100))
                  return (
                    <div key={`${item.name}-${index}`}>
                      <div className="mb-1 flex items-center justify-between text-sm font-black text-slate-600">
                        <span>{item.name}</span>
                        <span>{formatMoney(item.value)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-slate-950" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  )
                })}
                {categoryData.length === 0 && <EmptyText text="No hay gasto categorizado este mes." />}
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <Link href="/presupuesto" className="finance-hover finance-card rounded-[1.5rem] p-5 font-black text-slate-950">Editar presupuesto</Link>
              <Link href="/categorias" className="finance-hover finance-card rounded-[1.5rem] p-5 font-black text-slate-950">Administrar categorías</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function EmptyText({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-400">
      {text}
    </div>
  )
}
