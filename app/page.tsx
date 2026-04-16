'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {
  formatMoney,
  formatDate,
  friendlyTransactionType
} from '@/lib/utils'
import {
  buildBudgetRows,
  buildCategoryChartData,
  buildConsolidatedCommitments,
  buildDashboardMetrics,
  buildUpcomingCardPayments,
  daysUntilDate,
  type Account,
  type Budget,
  type BudgetProgress,
  type Category,
  type CommitmentItem,
  type CreditCard,
  type Debt,
  type Reminder,
  type Transaction,
} from '@/lib/dashboard'
import { KpiCard } from '@/components/ui/KpiCard'
import { Panel } from '@/components/ui/Panel'
import {
  getPendingInstallmentAmount,
  isInstallmentDueThisMonth,
  syncInstallmentPlans,
  type CreditCardInstallment,
} from '@/lib/credit-card-installments'
import { getPendingRecurringAmount, type RecurringCharge } from '@/lib/recurring-charges'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts'
import {
  ArrowUpRight,
  ArrowDownRight,
  CreditCard as CardIcon,
  Calendar,
  Wallet,
  ArrowRight
} from 'lucide-react'
import Link from 'next/link'

type InstallmentPlan = CreditCardInstallment

export default function Home() {
  const supabase = createClient()

  const [session, setSession] = useState<{ user: { email?: string | null } } | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [recurring, setRecurring] = useState<RecurringCharge[]>([])
  const [installments, setInstallments] = useState<InstallmentPlan[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [chartsReady, setChartsReady] = useState(false)
  const [loadError, setLoadError] = useState('')

  const loadDashboard = useCallback(async () => {
    setLoadError('')
    setLoading(true)
    try {
      const today = new Date()
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const currentMonth = today.getMonth() + 1
      const currentYear = today.getFullYear()

      const [
        { data: accountsData, error: accountsError },
        { data: recentTxData, error: recentTxError },
        { data: monthTxData, error: monthTxError },
        { data: remindersData, error: remindersError },
        { data: categoriesData, error: categoriesError },
        { data: recurringData, error: recurringError },
        { data: installmentData, error: installmentError },
        { data: debtsData, error: debtsError },
        { data: budgetsData, error: budgetsError },
        { data: creditCardsData, error: creditCardsError }
      ] = await Promise.all([
        supabase.from('accounts').select('*').eq('is_active', true).order('name'),
        supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(5),
        supabase.from('transactions').select('*').gte('transaction_date', startOfMonth.toISOString()),
        supabase.from('reminders').select('*').eq('status', 'pending').order('due_date', { ascending: true }).limit(5),
        supabase.from('categories').select('*'),
        supabase.from('recurring_charges').select('*').eq('is_active', true),
        supabase.from('credit_card_installments').select('*').neq('status', 'canceled'),
        supabase.from('debts').select('*').neq('status', 'canceled'),
        supabase
          .from('budgets')
          .select('id, category_id, period_month, period_year, budget_amount')
          .eq('period_month', currentMonth)
          .eq('period_year', currentYear),
        supabase
          .from('credit_cards')
          .select('id, name, payment_due_day, statement_cutoff_day, minimum_payment, no_interest_payment')
          .eq('is_active', true)
          .order('name')
      ])

      const firstError = [
        accountsError,
        recentTxError,
        monthTxError,
        remindersError,
        categoriesError,
        recurringError,
        installmentError,
        debtsError,
        budgetsError,
        creditCardsError,
      ].find(Boolean)

      if (firstError) {
        throw firstError
      }

      setAccounts((accountsData as Account[]) ?? [])
      setRecentTransactions((recentTxData as Transaction[]) ?? [])
      setMonthTransactions((monthTxData as Transaction[]) ?? [])
      setReminders((remindersData as Reminder[]) ?? [])
      setCategories((categoriesData as Category[]) ?? [])
      setRecurring((recurringData as RecurringCharge[]) ?? [])
      setInstallments(
        await syncInstallmentPlans(supabase, ((installmentData as InstallmentPlan[]) ?? [])).catch(
          () => ((installmentData as InstallmentPlan[]) ?? [])
        )
      )
      setDebts((debtsData as Debt[]) ?? [])
      setBudgets((budgetsData as Budget[]) ?? [])
      setCreditCards((creditCardsData as CreditCard[]) ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar el dashboard.'
      setLoadError(message)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const initialize = useCallback(async () => {
    setLoading(true)
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      setSession(null)
      setLoading(false)
      return
    }

    setSession(sessionData.session)
    await loadDashboard()
  }, [loadDashboard, supabase])

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    setChartsReady(true)
  }, [])

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  )

  const budgetRows = useMemo<BudgetProgress[]>(
    () => buildBudgetRows(budgets, monthTransactions, categoryMap),
    [budgets, monthTransactions, categoryMap]
  )

  const metrics = useMemo(
    () =>
      buildDashboardMetrics(
        accounts,
        monthTransactions,
        recurring,
        debts,
        installments,
        budgetRows,
        getPendingRecurringAmount,
        getPendingInstallmentAmount
      ),
    [accounts, monthTransactions, recurring, debts, installments, budgetRows]
  )

  const monthInstallmentPlans = useMemo(
    () => installments.filter((plan) => isInstallmentDueThisMonth(plan)).slice(0, 5),
    [installments]
  )

  const dueRecurringCharges = useMemo(
    () => recurring.filter((charge) => getPendingRecurringAmount(charge) > 0).slice(0, 5),
    [recurring]
  )

  const upcomingCardPayments = useMemo(() => buildUpcomingCardPayments(creditCards), [creditCards])

  const consolidatedCommitments = useMemo<CommitmentItem[]>(
    () =>
      buildConsolidatedCommitments(
        reminders,
        monthInstallmentPlans,
        dueRecurringCharges,
        upcomingCardPayments,
        getPendingRecurringAmount
      ),
    [reminders, monthInstallmentPlans, dueRecurringCharges, upcomingCardPayments]
  )

  const budgetHighlights = useMemo(
    () => budgetRows.filter((row) => row.progress >= 60).slice(0, 5),
    [budgetRows]
  )

  const toneClasses: Record<CommitmentItem['tone'], string> = {
    slate: 'text-slate-900',
    sky: 'text-sky-600',
    violet: 'text-violet-600',
    rose: 'text-rose-600',
    amber: 'text-amber-600',
  }

  // Chart Data: Income vs Expense
  const flowChartData = [
    { name: 'Ingresos', value: metrics.totalIncome, color: '#10b981' },
    { name: 'Gastos', value: metrics.totalExpense, color: '#f43f5e' }
  ]

  const categoryChartData = useMemo(
    () => buildCategoryChartData(monthTransactions, categories),
    [monthTransactions, categories]
  )

  const logout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-950 rounded-full animate-spin" />
          <p className="text-slate-900 font-black uppercase tracking-tighter">Analizando Finanzas...</p>
        </div>
      </main>
    )
  }

  if (!session) return <LoginScreen />

  return (
    <main className="min-h-screen bg-slate-50 pb-12">
      {/* Header Premium */}
      <section className="bg-slate-950 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-48 -mt-48" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -ml-48 -mb-48" />

        <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-emerald-400 font-black uppercase tracking-[0.2em] text-xs mb-3">Resumen Inteligente</p>
              <h1 className="text-5xl font-black tracking-tighter">Dashboard <span className="text-slate-500">Financiero</span></h1>
              <p className="text-slate-400 mt-2 text-lg font-medium opacity-80">{session.user.email}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/movimientos/nuevo" className="rounded-2xl bg-white px-6 py-4 font-black text-slate-950 hover:bg-slate-200 transition shadow-xl flex items-center gap-2">
                <ArrowUpRight size={20} /> Nuevo Movimiento
              </Link>
              <button onClick={logout} className="rounded-2xl border border-slate-800 bg-slate-900/50 px-6 py-4 font-bold text-slate-300 hover:bg-slate-800 transition">
                Salir
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 -mt-8 relative z-20">
        {/* KPIs Principales */}
        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <KpiCard title="Efectivo Disponible" value={formatMoney(metrics.disponible)} valueClassName="text-slate-950" />
          <KpiCard title="Disponible tras pendientes" value={formatMoney(metrics.flow)} valueClassName={metrics.flow >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
          <KpiCard title="Deuda Total" value={formatMoney(metrics.deuda)} valueClassName="text-rose-600" />
          <KpiCard title="MSI pendientes" value={formatMoney(metrics.monthInstallments)} valueClassName="text-sky-600" />
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <KpiCard title="Presupuesto del mes" value={formatMoney(metrics.totalBudget)} valueClassName="text-slate-950" />
          <KpiCard title="Gastado contra presupuesto" value={formatMoney(metrics.totalBudgetSpent)} valueClassName="text-rose-600" />
          <KpiCard
            title="Margen presupuestal"
            value={formatMoney(metrics.totalBudgetRemaining)}
            subtitle={metrics.overBudgetCount > 0 ? `${metrics.overBudgetCount} categoría(s) excedida(s)` : 'Sin categorías excedidas'}
            valueClassName={metrics.totalBudgetRemaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}
          />
        </div>

        {loadError && (
          <div className="mb-8 rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm font-bold text-rose-700 shadow-sm">
            {loadError}
          </div>
        )}

        {/* Gráficas Inteligentes */}
        <div className="grid gap-6 lg:grid-cols-12 mb-8">
          <div className="lg:col-span-8">
            <Panel title="Flujo de Caja" subtitle="Ingresos y gasto real registrado del mes actual">
              <div className="min-w-0 h-80 w-full pt-4">
                {chartsReady ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={flowChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontWeight: 'bold' }} />
                      <YAxis hide />
                      <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="value" radius={[12, 12, 12, 12]} barSize={60}>
                        {flowChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-3xl border border-slate-100 bg-slate-50 text-sm font-medium text-slate-400">
                    Cargando gráfico...
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <div className="lg:col-span-4">
            <Panel title="Distribución" subtitle="Principales gastos por categoría">
              <div className="min-w-0 h-80 w-full flex flex-col items-center">
                {chartsReady ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {categoryChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#0f172a', '#334155', '#475569', '#64748b', '#94a3b8'][index % 5]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[200px] w-full items-center justify-center rounded-3xl border border-slate-100 bg-slate-50 text-sm font-medium text-slate-400">
                    Cargando gráfico...
                  </div>
                )}
                <div className="w-full space-y-2 mt-4">
                  {categoryChartData.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-500 uppercase tracking-tighter">{item.name}</span>
                      <span className="text-slate-950">{formatMoney(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <Panel title="MSI pendientes" subtitle="Mensualidades activas que ya toca procesar">
            {monthInstallmentPlans.length === 0 ? (
              <div className="py-10 text-center text-slate-400 font-medium italic">
                No hay MSI pendientes por procesar.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {monthInstallmentPlans.map((plan) => (
                  <div key={plan.id} className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-bold text-slate-900">{plan.description}</p>
                      <p className="text-sm text-slate-500">
                        {plan.current_installment_number}/{plan.total_months} · Día {plan.charge_day}
                      </p>
                    </div>
                    <p className="font-black text-sky-600">{formatMoney(Number(plan.monthly_amount || 0))}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Recurrentes pendientes" subtitle="Cargos automáticos vencidos o listos para procesar">
            {dueRecurringCharges.length === 0 ? (
              <div className="py-10 text-center text-slate-400 font-medium italic">
                No hay recurrentes pendientes por procesar.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {dueRecurringCharges.map((charge) => (
                  <div key={charge.id} className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-bold text-slate-900">{charge.name}</p>
                      <p className="text-sm text-slate-500">
                        {charge.next_charge_date ? formatDate(charge.next_charge_date) : 'Sin fecha'} · {charge.payment_method_type === 'credit_card' ? 'Tarjeta' : 'Cuenta'}
                      </p>
                    </div>
                    <p className="font-black text-violet-600">{formatMoney(getPendingRecurringAmount(charge))}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <Panel title="Compromisos próximos" subtitle="Vista consolidada de vencimientos, pagos y cargos pendientes">
            {consolidatedCommitments.length === 0 ? (
              <div className="py-10 text-center text-slate-400 font-medium italic">
                No hay compromisos próximos registrados.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {consolidatedCommitments.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-bold text-slate-900">{item.title}</p>
                      <p className="text-sm text-slate-500">
                        {formatDate(item.dueDate)} · {item.meta}
                      </p>
                    </div>
                    <p className={`font-black ${toneClasses[item.tone]}`}>{formatMoney(item.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Próximos pagos TDC" subtitle="Tarjetas que requieren atención este ciclo">
            {upcomingCardPayments.length === 0 ? (
              <div className="py-10 text-center text-slate-400 font-medium italic">
                No hay tarjetas con pago pendiente por ahora.
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingCardPayments.map((card) => {
                  const paymentDays = daysUntilDate(card.dueDate)
                  const cutoffDays = daysUntilDate(card.cutoffDate)
                  const noInterestAmount = Number(card.no_interest_payment || 0)
                  const minimumAmount = Number(card.minimum_payment || 0)

                  return (
                    <div key={card.id} className="rounded-2xl border border-slate-100 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-bold text-slate-900">{card.name}</p>
                          <p className="text-sm text-slate-500">
                            Corte {formatDate(card.cutoffDate)} · Pago {formatDate(card.dueDate)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-amber-600">{formatMoney(noInterestAmount || minimumAmount)}</p>
                          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                            {noInterestAmount > 0 ? 'No intereses' : 'Pago mínimo'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Días al corte</p>
                          <p className="mt-1 text-lg font-black text-slate-900">{cutoffDays}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Días al pago</p>
                          <p className={`mt-1 text-lg font-black ${paymentDays <= 3 ? 'text-rose-600' : 'text-slate-900'}`}>{paymentDays}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <Link href="/tarjetas" className="block text-center py-4 text-sm font-black text-slate-400 uppercase tracking-widest hover:text-slate-950 transition">
                  Revisar tarjetas
                </Link>
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <Panel title="Presupuesto del mes" subtitle="Cómo van las categorías con límite activo">
            {budgetRows.length === 0 ? (
              <div className="py-10 text-center text-slate-400 font-medium italic">
                No hay presupuestos definidos este mes.
              </div>
            ) : (
              <div className="space-y-4">
                {(budgetHighlights.length > 0 ? budgetHighlights : budgetRows.slice(0, 5)).map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <div>
                        <p className="font-bold text-slate-900">{row.categoryName}</p>
                        <p className="text-sm text-slate-500">
                          {formatMoney(row.spent)} de {formatMoney(row.budgetAmount)}
                        </p>
                      </div>
                      <p className={`font-black ${row.remaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {row.remaining >= 0 ? formatMoney(row.remaining) : `-${formatMoney(Math.abs(row.remaining))}`}
                      </p>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${row.progress < 70 ? 'bg-emerald-500' : row.progress < 100 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${Math.min(row.progress, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                <Link href="/presupuesto" className="block text-center py-4 text-sm font-black text-slate-400 uppercase tracking-widest hover:text-slate-950 transition">
                  Abrir control presupuestal
                </Link>
              </div>
            )}
          </Panel>

          <Panel title="Navegación rápida" subtitle="Entradas directas a los módulos que más se cruzan con el dashboard">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Presupuesto', href: '/presupuesto' },
                { label: 'Tarjetas', href: '/tarjetas' },
                { label: 'Recordatorios', href: '/recordatorios' },
                { label: 'Recurrentes', href: '/recurrentes' },
                { label: 'MSI', href: '/tarjetas' },
                { label: 'Movimientos', href: '/movimientos' },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-2xl border border-slate-100 bg-white px-4 py-5 text-center text-sm font-black uppercase tracking-tighter text-slate-900 transition hover:border-slate-200 hover:bg-slate-50"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </Panel>
        </div>

        {/* Acceso a Módulos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Cuentas', href: '/cuentas', icon: Wallet },
            { label: 'Tarjetas', href: '/tarjetas', icon: CardIcon },
            { label: 'Deudas', href: '/deudas', icon: ArrowUpRight },
            { label: 'Recurrentes', href: '/recurrentes', icon: Calendar },
            { label: 'Presupuesto', href: '/presupuesto', icon: ArrowRight },
          ].map((link) => (
            <Link key={link.label} href={link.href} className="group flex flex-col items-center justify-center p-6 bg-white border border-slate-100 rounded-[2rem] hover:bg-slate-950 hover:text-white transition-all shadow-sm">
              <link.icon className="mb-3 text-slate-400 group-hover:text-emerald-400 transition-colors" size={32} />
              <span className="font-black uppercase tracking-tighter text-sm">{link.label}</span>
            </Link>
          ))}
        </div>

        {/* Secciones de Datos */}
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="xl:col-span-6">
            <Panel title="Últimos Movimientos" subtitle="Actividad de carga y abono actual">
              <div className="space-y-4">
                {recentTransactions.map((tx) => (
                  <div key={tx.id} className="group flex items-center justify-between p-4 rounded-3xl border border-slate-50 bg-white hover:border-slate-200 hover:shadow-lg transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-2xl ${tx.transaction_type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-900 font-black'}`}>
                        {tx.transaction_type === 'income' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                      </div>
                      <div>
                        <p className="font-black text-slate-950 leading-tight">{tx.description || 'Sin concepto'}</p>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                          {friendlyTransactionType(tx.transaction_type)} · {formatDate(tx.transaction_date)}
                        </p>
                      </div>
                    </div>
                    <p className={`font-black text-lg ${tx.transaction_type === 'income' ? 'text-emerald-600' : 'text-slate-950'}`}>
                      {tx.transaction_type === 'income' ? '+' : '-'} {formatMoney(tx.amount)}
                    </p>
                  </div>
                ))}
                <Link href="/movimientos" className="block text-center py-4 text-sm font-black text-slate-400 uppercase tracking-widest hover:text-slate-950 transition">Ver todo el historial</Link>
              </div>
            </Panel>
          </div>

          <div className="xl:col-span-6">
            <Panel title="Recordatorios de Pago" subtitle="Eventos y vencimientos próximos">
              <div className="space-y-4">
                {reminders.map((rem) => (
                  <div key={rem.id} className="flex items-center justify-between p-5 rounded-3xl border-2 border-slate-100 bg-white shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-slate-950 flex items-center justify-center text-white">
                        <span className="text-lg font-black">{new Date(rem.due_date).getDate()}</span>
                      </div>
                      <div>
                        <p className="font-black text-slate-950">{rem.title}</p>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{formatDate(rem.due_date)}</p>
                      </div>
                    </div>
                    {rem.amount && <p className="font-black text-slate-950">{formatMoney(rem.amount)}</p>}
                  </div>
                ))}
                {reminders.length === 0 && <p className="text-center py-12 text-slate-400 font-bold italic">Todo al día por ahora ✨</p>}
                <Link href="/recordatorios" className="block text-center py-4 text-sm font-black text-slate-400 uppercase tracking-widest hover:text-slate-950 transition">Gestionar alertas</Link>
              </div>
            </Panel>
          </div>
        </div>
      </section>
    </main>
  )
}

function LoginScreen() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      window.location.reload()
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] -mr-64 -mt-64" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] -ml-64 -mb-64" />

      <form onSubmit={handleLogin} className="relative z-10 w-full max-w-md bg-white rounded-[3rem] p-12 shadow-2xl">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-[2rem] bg-slate-950 text-white mb-6 transform -rotate-12 shadow-xl">
            <Wallet size={40} />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-950 uppercase">Finanzas <span className="text-emerald-500">App</span></h1>
          <p className="text-slate-400 font-bold text-sm mt-3 uppercase tracking-widest text-balance leading-relaxed">Control total de tus activos y gastos</p>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-5 py-4 font-bold text-slate-900 focus:border-slate-950 focus:bg-white outline-none transition-all" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-5 py-4 font-bold text-slate-900 focus:border-slate-950 focus:bg-white outline-none transition-all" />
          </div>
        </div>

        <button disabled={loading} className="w-full mt-10 rounded-3xl bg-slate-950 py-6 text-xl font-black text-white hover:bg-slate-800 transition shadow-2xl active:scale-95 disabled:opacity-50">
          {loading ? 'Entrando...' : 'Iniciar Sesión'}
        </button>
        {error && <p className="mt-6 text-center text-xs font-black text-rose-500 uppercase">{error}</p>}
      </form>
    </main>
  )
}
