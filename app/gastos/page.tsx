'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Brain, CalendarDays, ListChecks, PlusCircle, Tags } from 'lucide-react'
import { MainNavigation } from '@/components/ui/MainNavigation'
import { MiniStat } from '@/components/ui/MiniStat'
import { createClient } from '@/lib/supabase-browser'
import { formatMoney } from '@/lib/utils'
import {
  buildBudgetRows,
  type Budget,
  type BudgetProgress,
  type Category,
  type Transaction,
} from '@/lib/dashboard'
import { type CreditCardInstallment } from '@/lib/credit-card-installments'
import { isBudgetAffectingTransaction } from '@/lib/budget-rules'
import { getAppDate } from '@/lib/app-date'
import type { RecurringCharge } from '@/lib/recurring-charges'
import {
  buildBudgetInsights,
  buildCategoryChartDataForPeriod,
  buildCustomPeriod,
  buildMonthPeriod,
  buildRollingPeriod,
  summarizeMonthSeries,
  sumInstallmentSpendByCategory,
} from '@/lib/budget-insights'

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
  const appDate = useMemo(() => getAppDate(), [])
  const current = useMemo(() => monthRange(appDate), [appDate])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [periodMode, setPeriodMode] = useState<'current' | 'previous' | 'last3' | 'last6' | 'custom'>('current')
  const [customStart, setCustomStart] = useState(current.start.toISOString().slice(0, 10))
  const [customEnd, setCustomEnd] = useState(current.end.toISOString().slice(0, 10))
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [installments, setInstallments] = useState<CreditCardInstallment[]>([])
  const [recurring, setRecurring] = useState<RecurringCharge[]>([])

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
        { data: recurringData, error: recurringError },
      ] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .gte('transaction_date', buildMonthPeriod(appDate, -12).start.toISOString())
          .lte('transaction_date', buildMonthPeriod(appDate, 1).end.toISOString()),
        supabase.from('categories').select('*').eq('is_active', true),
        supabase
          .from('budgets')
          .select('id, category_id, period_month, period_year, budget_amount'),
        supabase.from('credit_card_installments').select('*').neq('status', 'canceled'),
        supabase.from('recurring_charges').select('*').eq('is_active', true),
      ])

      const firstError = [txError, categoriesError, budgetsError, installmentError, recurringError].find(Boolean)
      if (firstError) setMessage(firstError.message)

      setTransactions((txData as Transaction[]) ?? [])
      setCategories((categoriesData as Category[]) ?? [])
      setBudgets((budgetsData as Budget[]) ?? [])
      setInstallments((installmentData as CreditCardInstallment[]) ?? [])
      setRecurring((recurringData as RecurringCharge[]) ?? [])
      setLoading(false)
    }

    void loadData()
  }, [appDate, supabase])

  const selectedPeriod = useMemo(() => {
    if (periodMode === 'previous') return buildMonthPeriod(appDate, -1)
    if (periodMode === 'last3') return buildRollingPeriod(appDate, 3)
    if (periodMode === 'last6') return buildRollingPeriod(appDate, 6)
    if (periodMode === 'custom') return buildCustomPeriod(customStart, customEnd) || buildMonthPeriod(appDate)
    return buildMonthPeriod(appDate)
  }, [periodMode, appDate, customStart, customEnd])

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((tx) => {
        const date = new Date(tx.transaction_date)
        return date >= selectedPeriod.start && date <= selectedPeriod.end
      }),
    [transactions, selectedPeriod]
  )

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const msiPurchaseIds = useMemo(
    () => new Set(installments.map((plan) => plan.purchase_transaction_id).filter(Boolean) as string[]),
    [installments]
  )
  const installmentBudgetAmounts = useMemo(() => {
    return sumInstallmentSpendByCategory(installments, selectedPeriod)
  }, [installments, selectedPeriod])
  const selectedBudgets = useMemo(
    () => budgets.filter((budget) => budget.period_month === selectedPeriod.month && budget.period_year === selectedPeriod.year),
    [budgets, selectedPeriod.month, selectedPeriod.year]
  )
  const budgetRows = useMemo<BudgetProgress[]>(
    () => buildBudgetRows(selectedBudgets, filteredTransactions, categoryMap, installmentBudgetAmounts, msiPurchaseIds),
    [selectedBudgets, filteredTransactions, categoryMap, installmentBudgetAmounts, msiPurchaseIds]
  )
  const categoryData = useMemo(
    () => buildCategoryChartDataForPeriod(transactions, categories, installments, selectedPeriod, msiPurchaseIds),
    [transactions, categories, installments, selectedPeriod, msiPurchaseIds]
  )
  const generatedExpense = useMemo(
    () =>
      filteredTransactions
        .filter((tx) => isBudgetAffectingTransaction(tx, msiPurchaseIds))
        .reduce((acc, tx) => acc + Number(tx.amount || 0), 0) +
      Array.from(installmentBudgetAmounts.values()).reduce((acc, value) => acc + value, 0),
    [filteredTransactions, installmentBudgetAmounts, msiPurchaseIds]
  )
  const totalBudget = useMemo(() => budgetRows.reduce((acc, row) => acc + Number(row.budgetAmount || 0), 0), [budgetRows])
  const totalSpent = useMemo(() => budgetRows.reduce((acc, row) => acc + Number(row.spent || 0), 0), [budgetRows])
  const exceeded = useMemo(() => budgetRows.filter((row) => row.remaining < 0), [budgetRows])
  const uncategorized = useMemo(
    () =>
      filteredTransactions
        .filter((tx) => isBudgetAffectingTransaction(tx, msiPurchaseIds))
        .filter((tx) => !tx.category_id)
        .reduce((acc, tx) => acc + Number(tx.amount || 0), 0),
    [filteredTransactions, msiPurchaseIds]
  )
  const realExpense = useMemo(
    () =>
      filteredTransactions
        .filter((tx) => isBudgetAffectingTransaction(tx, msiPurchaseIds))
        .reduce((acc, tx) => acc + Number(tx.amount || 0), 0),
    [filteredTransactions, msiPurchaseIds]
  )
  const msiExpense = useMemo(
    () => Array.from(installmentBudgetAmounts.values()).reduce((acc, value) => acc + value, 0),
    [installmentBudgetAmounts]
  )
  const budgetInsights = useMemo(
    () =>
      buildBudgetInsights({
        transactions,
        categories,
        budgets,
        installments,
        recurring,
        referenceDate: appDate,
        currentPeriod: selectedPeriod,
        msiPurchaseIds,
      }),
    [transactions, categories, budgets, installments, recurring, appDate, selectedPeriod, msiPurchaseIds]
  )
  const monthSeries = useMemo(
    () => summarizeMonthSeries(transactions, installments, appDate, msiPurchaseIds, 6),
    [transactions, installments, appDate, msiPurchaseIds]
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
            Gasto real por periodo, mensualidades MSI, presupuesto sugerido y categorías que necesitan atención.
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

        <div className="mb-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Periodo de análisis</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{selectedPeriod.label}</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Separa gasto real, MSI del periodo y compromisos recurrentes para no mezclar flujo con presupuesto.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] lg:min-w-[620px]">
              <select
                value={periodMode}
                onChange={(event) => setPeriodMode(event.target.value as typeof periodMode)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900 outline-none transition focus:border-slate-900"
              >
                <option value="current">Este mes</option>
                <option value="previous">Mes anterior</option>
                <option value="last3">Últimos 3 meses</option>
                <option value="last6">Últimos 6 meses</option>
                <option value="custom">Rango personalizado</option>
              </select>
              <input
                type="date"
                value={customStart}
                disabled={periodMode !== 'custom'}
                onChange={(event) => setCustomStart(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900 outline-none transition focus:border-slate-900 disabled:opacity-40"
              />
              <input
                type="date"
                value={customEnd}
                disabled={periodMode !== 'custom'}
                onChange={(event) => setCustomEnd(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900 outline-none transition focus:border-slate-900 disabled:opacity-40"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MiniStat label="Gasto generado" value={formatMoney(generatedExpense)} valueClassName="text-rose-600" />
          <MiniStat label="Gasto real" value={formatMoney(realExpense)} />
          <MiniStat label="MSI del periodo" value={formatMoney(msiExpense)} valueClassName={msiExpense > 0 ? 'text-sky-600' : 'text-slate-950'} />
          <MiniStat label="Presupuesto" value={formatMoney(totalBudget)} />
          <MiniStat label="Gastado presupuestal" value={formatMoney(totalSpent)} valueClassName={totalSpent <= totalBudget ? 'text-slate-950' : 'text-rose-600'} />
          <MiniStat label="Sin categoría" value={formatMoney(uncategorized)} valueClassName={uncategorized > 0 ? 'text-amber-600' : 'text-slate-950'} />
        </div>

        <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Histórico</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Gasto por mes</h2>
            </div>
            <CalendarDays className="text-slate-400" />
          </div>
          <div className="grid gap-3 md:grid-cols-6">
            {monthSeries.map((month) => {
              const max = Math.max(...monthSeries.map((item) => item.total), 1)
              const width = Math.min(100, Math.max(month.total > 0 ? 8 : 0, (month.total / max) * 100))

              return (
                <div key={month.key} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">{month.label}</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{formatMoney(month.total)}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">Real {formatMoney(month.real)} · MSI {formatMoney(month.msi)}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-slate-950" style={{ width: `${width}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

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

        <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Presupuesto inteligente</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Sugerencias para el siguiente mes</h2>
              <p className="mt-2 max-w-3xl text-sm font-bold text-slate-500">
                Calculado con promedios de 3 y 6 meses, tendencia reciente, mensualidades MSI futuras y recurrentes categorizados. Es una recomendación, no modifica tu presupuesto.
              </p>
            </div>
            <Brain className="text-emerald-500" />
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-100">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="text-xs font-black uppercase tracking-widest text-slate-400">
                  <th className="px-5 py-4">Categoría</th>
                  <th className="px-5 py-4">Periodo actual</th>
                  <th className="px-5 py-4">Prom. 3m</th>
                  <th className="px-5 py-4">Prom. 6m</th>
                  <th className="px-5 py-4">MSI futuro</th>
                  <th className="px-5 py-4">Recurrente</th>
                  <th className="px-5 py-4">Actual</th>
                  <th className="px-5 py-4">Sugerido</th>
                  <th className="px-5 py-4">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {budgetInsights.slice(0, 12).map((row) => (
                  <tr key={row.categoryId} className="bg-white">
                    <td className="px-5 py-4 font-black text-slate-950">
                      {row.categoryName}
                      <span className={`ml-2 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                        row.trend === 'up'
                          ? 'bg-rose-50 text-rose-600'
                          : row.trend === 'down'
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-slate-100 text-slate-500'
                      }`}>
                        {row.trend === 'up' ? 'Sube' : row.trend === 'down' ? 'Baja' : 'Estable'}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-600">
                      {formatMoney(row.currentSpend)}
                      {row.installmentSpend > 0 && (
                        <span className="mt-1 block text-xs text-sky-600">MSI {formatMoney(row.installmentSpend)}</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-600">{formatMoney(row.average3Months)}</td>
                    <td className="px-5 py-4 font-bold text-slate-600">{formatMoney(row.average6Months)}</td>
                    <td className="px-5 py-4 font-bold text-sky-600">{formatMoney(row.futureInstallmentSpend)}</td>
                    <td className="px-5 py-4 font-bold text-violet-600">{formatMoney(row.recurringProjected)}</td>
                    <td className="px-5 py-4 font-bold text-slate-600">{formatMoney(row.currentBudget)}</td>
                    <td className="px-5 py-4 font-black text-emerald-600">{formatMoney(row.suggestedBudget)}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${
                        row.status === 'over'
                          ? 'bg-rose-100 text-rose-700'
                          : row.status === 'tight'
                            ? 'bg-amber-100 text-amber-700'
                            : row.status === 'unbudgeted'
                              ? 'bg-sky-100 text-sky-700'
                              : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {row.status === 'over' ? 'Excedido' : row.status === 'tight' ? 'Apretado' : row.status === 'unbudgeted' ? 'Sin presupuesto' : 'Ok'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {budgetInsights.length === 0 && <EmptyText text="Aún no hay suficiente información para sugerir presupuesto." />}
          </div>
        </section>
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
