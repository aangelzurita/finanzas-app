'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getAppDate } from '@/lib/app-date'
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
import { QuickNav } from '@/components/ui/QuickNav'
import {
  getPendingInstallmentAmount,
  getInstallmentDisplayState,
  syncInstallmentPlans,
  type CreditCardInstallment,
} from '@/lib/credit-card-installments'
import { getPendingRecurringAmount, type RecurringCharge } from '@/lib/recurring-charges'
import {
  buildFinancialCalendarEvents,
  getEndOfCurrentMonth,
  type FinancialCalendarEvent,
  type IncomeSchedule,
} from '@/lib/financial-calendar'
import { buildCashflowProjection, type CashflowRiskLevel } from '@/lib/cashflow-projection'
import { adviseCreditCards } from '@/lib/credit-card-advisor'
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
  ArrowRight,
  AlertTriangle,
  BadgeDollarSign,
  ShieldCheck,
  TrendingDown
} from 'lucide-react'
import Link from 'next/link'

type InstallmentPlan = CreditCardInstallment
type PaymentFilter = 'all' | 'cash' | 'credit_card'
type HealthTone = 'emerald' | 'amber' | 'rose' | 'slate'

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return { start, end, month, year }
}

export default function Home() {
  const supabase = createClient()

  const [session, setSession] = useState<{ user: { email?: string | null } } | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [projectionReminders, setProjectionReminders] = useState<Reminder[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [recurring, setRecurring] = useState<RecurringCharge[]>([])
  const [installments, setInstallments] = useState<InstallmentPlan[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [incomeSchedules, setIncomeSchedules] = useState<IncomeSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [chartsReady, setChartsReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey)
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
  const [selectedCardId, setSelectedCardId] = useState('all')
  const appDate = useMemo(() => getAppDate(), [])

  const loadDashboard = useCallback(async () => {
    setLoadError('')
    setLoading(true)
    try {
      const { start, end, month: currentMonth, year: currentYear } = monthRange(selectedMonth)

      const [
        { data: accountsData, error: accountsError },
        { data: recentTxData, error: recentTxError },
        { data: monthTxData, error: monthTxError },
        { data: remindersData, error: remindersError },
        { data: projectionRemindersData, error: projectionRemindersError },
        { data: categoriesData, error: categoriesError },
        { data: recurringData, error: recurringError },
        { data: installmentData, error: installmentError },
        { data: debtsData, error: debtsError },
        { data: budgetsData, error: budgetsError },
        { data: creditCardsData, error: creditCardsError },
        { data: incomeSchedulesData, error: incomeSchedulesError }
      ] = await Promise.all([
        supabase.from('accounts').select('*').eq('is_active', true).order('name'),
        supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(5),
        supabase
          .from('transactions')
          .select('*')
          .gte('transaction_date', start.toISOString())
          .lte('transaction_date', end.toISOString()),
        supabase.from('reminders').select('*').eq('status', 'pending').order('due_date', { ascending: true }).limit(5),
        supabase.from('reminders').select('*').eq('status', 'pending').order('due_date', { ascending: true }),
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
          .select('id, name, credit_limit, current_balance, payment_due_day, statement_cutoff_day, minimum_payment, no_interest_payment')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('income_schedules')
          .select('*')
          .eq('is_active', true)
          .order('next_income_date', { ascending: true })
      ])

      const firstError = [
        accountsError,
        recentTxError,
        monthTxError,
        remindersError,
        projectionRemindersError,
        categoriesError,
        recurringError,
        installmentError,
        debtsError,
        budgetsError,
        creditCardsError,
        incomeSchedulesError,
      ].find(Boolean)

      if (firstError) {
        throw firstError
      }

      setAccounts((accountsData as Account[]) ?? [])
      setRecentTransactions((recentTxData as Transaction[]) ?? [])
      setMonthTransactions((monthTxData as Transaction[]) ?? [])
      setReminders((remindersData as Reminder[]) ?? [])
      setProjectionReminders((projectionRemindersData as Reminder[]) ?? [])
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
      setIncomeSchedules((incomeSchedulesData as IncomeSchedule[]) ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar el dashboard.'
      setLoadError(message)
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, supabase])

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

  const filteredMonthTransactions = useMemo(
    () =>
      monthTransactions.filter((tx) => {
        if (paymentFilter === 'cash' && tx.transaction_type.startsWith('credit_card')) return false
        if (paymentFilter === 'credit_card' && !tx.transaction_type.startsWith('credit_card')) return false
        if (selectedCardId !== 'all' && tx.related_credit_card_id !== selectedCardId) return false
        return true
      }),
    [monthTransactions, paymentFilter, selectedCardId]
  )

  const msiPurchaseIds = useMemo(
    () => new Set(installments.map((plan) => plan.purchase_transaction_id).filter(Boolean) as string[]),
    [installments]
  )

  const selectedMonthEnd = useMemo(() => monthRange(selectedMonth).end, [selectedMonth])

  const pendingInstallmentAmountForDashboard = useCallback(
    (plan: CreditCardInstallment) => getPendingInstallmentAmount(plan, selectedMonthEnd),
    [selectedMonthEnd]
  )

  useEffect(() => {
    if (paymentFilter === 'cash' && selectedCardId !== 'all') {
      setSelectedCardId('all')
    }
  }, [paymentFilter, selectedCardId])

  const filteredInstallmentsForDashboard = useMemo(
    () =>
      installments.filter((plan) => {
        if (paymentFilter === 'cash') return false
        if (selectedCardId !== 'all' && plan.credit_card_id !== selectedCardId) return false
        return true
      }),
    [installments, paymentFilter, selectedCardId]
  )

  const pendingInstallmentPlans = useMemo(
    () =>
      filteredInstallmentsForDashboard.filter(
        (plan) => pendingInstallmentAmountForDashboard(plan) > 0
      ),
    [filteredInstallmentsForDashboard, pendingInstallmentAmountForDashboard]
  )

  const monthInstallmentPlans = useMemo(
    () => pendingInstallmentPlans.slice(0, 5),
    [pendingInstallmentPlans]
  )

  const installmentBudgetAmounts = useMemo(() => {
    const amounts = new Map<string, number>()

    pendingInstallmentPlans.forEach((plan) => {
      if (!plan.category_id) return
      amounts.set(
        plan.category_id,
        Number(amounts.get(plan.category_id) || 0) + pendingInstallmentAmountForDashboard(plan)
      )
    })

    return amounts
  }, [pendingInstallmentPlans, pendingInstallmentAmountForDashboard])

  const budgetRows = useMemo<BudgetProgress[]>(
    () => buildBudgetRows(budgets, filteredMonthTransactions, categoryMap, installmentBudgetAmounts, msiPurchaseIds),
    [budgets, filteredMonthTransactions, categoryMap, installmentBudgetAmounts, msiPurchaseIds]
  )

  const metrics = useMemo(
    () =>
      buildDashboardMetrics(
        accounts,
        filteredMonthTransactions,
        recurring,
        debts,
        filteredInstallmentsForDashboard,
        budgetRows,
        getPendingRecurringAmount,
        pendingInstallmentAmountForDashboard,
        msiPurchaseIds
      ),
    [accounts, filteredMonthTransactions, recurring, debts, filteredInstallmentsForDashboard, budgetRows, pendingInstallmentAmountForDashboard, msiPurchaseIds]
  )

  const dueRecurringCharges = useMemo(
    () => recurring.filter((charge) => getPendingRecurringAmount(charge) > 0).slice(0, 5),
    [recurring]
  )

  const upcomingCardPayments = useMemo(() => buildUpcomingCardPayments(creditCards), [creditCards])

  const pendingReminderAmount = useMemo(
    () => reminders.reduce((acc, reminder) => acc + Number(reminder.amount || 0), 0),
    [reminders]
  )

  const pendingCardPaymentAmount = useMemo(
    () => upcomingCardPayments.reduce((acc, card) => acc + Number(card.no_interest_payment || card.minimum_payment || 0), 0),
    [upcomingCardPayments]
  )

  const availableAfterPending = useMemo(
    () => metrics.disponible - metrics.fixedExpense - metrics.monthInstallments - pendingReminderAmount - pendingCardPaymentAmount,
    [metrics.disponible, metrics.fixedExpense, metrics.monthInstallments, pendingReminderAmount, pendingCardPaymentAmount]
  )

  const projectionEndDate = useMemo(() => getEndOfCurrentMonth(appDate), [appDate])

  const financialEvents = useMemo(
    () =>
      buildFinancialCalendarEvents({
        incomeSchedules,
        reminders: projectionReminders,
        recurringCharges: recurring,
        installments: filteredInstallmentsForDashboard,
        creditCards,
        debts: debts.map((debt) => {
          const paymentAccount = accounts.find((account) => account.id === debt.payment_account_id)
          return {
            ...debt,
            payment_account_is_external: paymentAccount?.is_external === true || paymentAccount?.include_in_balance === false,
          }
        }),
        from: appDate,
        to: projectionEndDate,
      }),
    [incomeSchedules, projectionReminders, recurring, filteredInstallmentsForDashboard, creditCards, debts, accounts, appDate, projectionEndDate]
  )

  const cashflowProjection = useMemo(
    () =>
      buildCashflowProjection({
        currentBalance: metrics.disponible,
        events: financialEvents,
        startDate: appDate,
        endDate: projectionEndDate,
      }),
    [metrics.disponible, financialEvents, appDate, projectionEndDate]
  )

  const projectedCashOutflows = useMemo(
    () =>
      financialEvents
        .filter((event) => event.direction === 'outflow' && event.affectsCash)
        .reduce((acc, event) => acc + Number(event.amount || 0), 0),
    [financialEvents]
  )

  const commitmentsBeforeNextIncome = useMemo(() => {
    const nextIncomeDate = cashflowProjection.summary.nextIncomeDate
    if (!nextIncomeDate) return 0

    return financialEvents
      .filter(
        (event) =>
          event.direction === 'outflow' &&
          event.affectsCash &&
          event.date < nextIncomeDate
      )
      .reduce((acc, event) => acc + Number(event.amount || 0), 0)
  }, [cashflowProjection.summary.nextIncomeDate, financialEvents])

  const monthlyCommitmentBreakdown = useMemo(() => {
    const sumBySource = (sourceTypes: FinancialCalendarEvent['sourceType'][]) =>
      financialEvents
        .filter(
          (event) =>
            event.direction === 'outflow' &&
            event.affectsCash &&
            sourceTypes.includes(event.sourceType)
        )
        .reduce((acc, event) => acc + Number(event.amount || 0), 0)

    const items = [
      {
        label: 'Tarjetas',
        amount: sumBySource(['credit_card_payment']),
        className: 'bg-indigo-500',
      },
      {
        label: 'MSI',
        amount: sumBySource(['installment']),
        className: 'bg-sky-500',
      },
      {
        label: 'Deudas',
        amount: sumBySource(['debt_payment']),
        className: 'bg-rose-500',
      },
      {
        label: 'Recurrentes/alertas',
        amount: sumBySource(['recurring_charge', 'reminder']),
        className: 'bg-amber-500',
      },
    ]

    return items.filter((item) => item.amount > 0)
  }, [financialEvents])

  const topCashflowEvents = useMemo(
    () =>
      financialEvents
        .filter((event) => event.affectsCash)
        .sort((a, b) => {
          const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime()
          if (dateDiff !== 0) return dateDiff
          return Number(b.amount || 0) - Number(a.amount || 0)
        })
        .slice(0, 5),
    [financialEvents]
  )

  const riskLabels: Record<CashflowRiskLevel, string> = {
    ok: 'Estable',
    caution: 'Precaución',
    risk: 'Riesgo',
  }

  const riskClasses: Record<CashflowRiskLevel, string> = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    caution: 'bg-amber-50 text-amber-700 border-amber-100',
    risk: 'bg-rose-50 text-rose-700 border-rose-100',
  }

  const confidenceLabels: Record<FinancialCalendarEvent['confidence'], string> = {
    confirmed: 'Confirmado',
    estimated: 'Estimado',
    manual: 'Manual',
  }

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

  // Chart Data: generated spending vs real cash outflow
  const flowChartData = [
    { name: 'Ingresos', value: metrics.totalIncome, color: '#10b981' },
    { name: 'Gasto generado', value: metrics.generatedExpense, color: '#f43f5e' },
    { name: 'Salida real', value: metrics.cashOutflow, color: '#0f172a' }
  ]

  const categoryChartData = useMemo(
    () => buildCategoryChartData(filteredMonthTransactions, categories, installmentBudgetAmounts, msiPurchaseIds),
    [filteredMonthTransactions, categories, installmentBudgetAmounts, msiPurchaseIds]
  )

  const cardAdvisorResults = useMemo(
    () => adviseCreditCards(creditCards),
    [creditCards]
  )

  const bestAdvisorCard = cardAdvisorResults[0]

  const nextIncomeHealth = useMemo(() => {
    const nextIncomeDate = cashflowProjection.summary.nextIncomeDate
    if (!nextIncomeDate) {
      return {
        tone: 'slate' as const,
        status: 'Sin datos suficientes',
        margin: cashflowProjection.summary.lowestBalance,
        text: 'Registra ingresos programados para estimar si llegas al siguiente ingreso.',
      }
    }

    const pointsBeforeIncome = cashflowProjection.points.filter((point) => point.date < nextIncomeDate)
    const lowestPoint = pointsBeforeIncome.length > 0
      ? pointsBeforeIncome.reduce((lowest, point) => point.endingBalance < lowest.endingBalance ? point : lowest)
      : cashflowProjection.points.find((point) => point.date === cashflowProjection.summary.lowestBalanceDate)

    const margin = lowestPoint?.endingBalance ?? cashflowProjection.summary.lowestBalance
    const cautionThreshold = Math.max(0, cashflowProjection.summary.currentBalance * 0.1)
    const tone = margin < 0 ? 'rose' as const : margin <= cautionThreshold ? 'amber' as const : 'emerald' as const
    const status = tone === 'rose' ? 'Riesgo' : tone === 'amber' ? 'Precaución' : 'Bien'

    return {
      tone,
      status,
      margin,
      text: `Llegas con margen estimado de ${formatMoney(margin)}.`,
    }
  }, [cashflowProjection])

  const pressureHealth = useMemo(() => {
    const commitments = projectedCashOutflows
    const base = Math.max(metrics.disponible + metrics.totalIncome, 1)
    const pressureRate = commitments / base
    const tone = pressureRate >= 0.75 ? 'rose' as const : pressureRate >= 0.4 ? 'amber' as const : 'emerald' as const
    const status = tone === 'rose' ? 'Alto' : tone === 'amber' ? 'Medio' : 'Bajo'

    return {
      tone,
      status,
      value: commitments,
      text: `Tus compromisos registrados representan ${formatMoney(commitments)} este mes.`,
    }
  }, [projectedCashOutflows, metrics.disponible, metrics.totalIncome])

  const leakHealth = useMemo(() => {
    const exceeded = budgetRows
      .filter((row) => row.remaining < 0)
      .sort((a, b) => a.remaining - b.remaining)[0]

    if (exceeded) {
      return {
        tone: 'rose' as const,
        status: 'Riesgo',
        title: exceeded.categoryName,
        text: `${exceeded.categoryName} ya excedió su presupuesto por ${formatMoney(Math.abs(exceeded.remaining))}.`,
        progress: 100,
      }
    }

    const pressured = budgetRows
      .filter((row) => row.progress >= 80)
      .sort((a, b) => b.progress - a.progress)[0]

    if (pressured) {
      return {
        tone: 'amber' as const,
        status: 'Precaución',
        title: pressured.categoryName,
        text: `${pressured.categoryName} ya va al ${pressured.progress.toFixed(0)}% de su presupuesto.`,
        progress: Math.min(100, pressured.progress),
      }
    }

    const topCategory = categoryChartData[0]
    if (topCategory) {
      return {
        tone: 'emerald' as const,
        status: 'Atención',
        title: topCategory.name,
        text: `${topCategory.name} concentra ${formatMoney(topCategory.value)} este mes.`,
        progress: 62,
      }
    }

    return {
      tone: 'slate' as const,
      status: 'Sin datos suficientes',
      title: 'Sin categoría',
      text: 'Registra movimientos o presupuestos para detectar fugas.',
      progress: 0,
    }
  }, [budgetRows, categoryChartData])

  const nextIncomeMargin = Math.max(0, nextIncomeHealth.margin)
  const nextIncomeBarTotal = nextIncomeMargin + commitmentsBeforeNextIncome
  const nextIncomeMarginWidth = nextIncomeBarTotal > 0
    ? Math.min(100, Math.max(nextIncomeMargin > 0 ? 8 : 0, (nextIncomeMargin / nextIncomeBarTotal) * 100))
    : 0
  const nextIncomeCommitmentWidth = nextIncomeBarTotal > 0 ? 100 - nextIncomeMarginWidth : 0

  const healthToneClasses: Record<HealthTone, string> = {
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
    slate: 'border-slate-100 bg-slate-50 text-slate-600',
  }

  const healthCardClasses: Record<HealthTone, string> = {
    emerald: 'border-emerald-100 bg-gradient-to-br from-white via-white to-emerald-50/80',
    amber: 'border-amber-100 bg-gradient-to-br from-white via-white to-amber-50/80',
    rose: 'border-rose-100 bg-gradient-to-br from-white via-white to-rose-50/80',
    slate: 'border-slate-100 bg-gradient-to-br from-white via-white to-slate-50',
  }

  const healthIconClasses: Record<HealthTone, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    slate: 'bg-slate-100 text-slate-600',
  }

  const healthRiskExplanation = useMemo(() => {
    if (cashflowProjection.summary.currentBalance < 0) {
      return `Riesgo porque tu saldo actual en cuentas está en ${formatMoney(cashflowProjection.summary.currentBalance)}.`
    }

    if (cashflowProjection.summary.lowestBalance < 0) {
      return `Riesgo porque tu saldo proyectado baja a ${formatMoney(cashflowProjection.summary.lowestBalance)} el ${formatDate(cashflowProjection.summary.lowestBalanceDate)}.`
    }

    if (cashflowProjection.summary.riskLevel === 'caution') {
      return `Precaución porque tu margen más bajo es ${formatMoney(cashflowProjection.summary.lowestBalance)}.`
    }

    return `Estable: tu saldo proyectado se mantiene arriba de ${formatMoney(cashflowProjection.summary.lowestBalance)}.`
  }, [cashflowProjection.summary])

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
    <main className="finance-shell min-h-screen pb-12">
      {/* Header Premium */}
      <section className="finance-surface-dark relative overflow-hidden text-white">
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
        {loadError && (
          <div className="mb-8 rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm font-bold text-rose-700 shadow-sm">
            {loadError}
          </div>
        )}

        <QuickNav />

        <section className="mb-8">
          <Panel
            title="Salud financiera"
            subtitle="Resumen ejecutivo financiero con base en tus registros actuales"
            className="border-slate-200/80 bg-white/95 p-6 shadow-2xl shadow-slate-900/10"
          >
            <div className="mb-6 flex flex-col gap-3 rounded-[1.75rem] border border-slate-100 bg-slate-950 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Lectura rápida</p>
                <p className="mt-2 text-2xl font-black tracking-tight">Tu resumen ejecutivo para decidir antes de gastar</p>
                <p className="mt-2 text-sm font-bold text-slate-300">{healthRiskExplanation}</p>
              </div>
              <span className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-widest ${healthToneClasses[nextIncomeHealth.tone]}`}>
                {nextIncomeHealth.status}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <div className={`rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${healthCardClasses[nextIncomeHealth.tone]}`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${healthIconClasses[nextIncomeHealth.tone]}`}>
                      <ShieldCheck size={19} />
                    </span>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Próxima quincena</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${healthToneClasses[nextIncomeHealth.tone]}`}>
                    {nextIncomeHealth.status}
                  </span>
                </div>
                <p className="text-2xl font-black tracking-tight text-slate-950">
                  {cashflowProjection.summary.nextIncomeAmount ? formatMoney(cashflowProjection.summary.nextIncomeAmount) : '---'}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  {cashflowProjection.summary.nextIncomeDate ? `Próximo ingreso: ${formatDate(cashflowProjection.summary.nextIncomeDate)}` : 'Sin ingreso esperado'}
                </p>
                <p className="mt-4 text-sm font-black text-slate-700">{nextIncomeHealth.text}</p>
                <p className="mt-2 rounded-2xl bg-white/70 px-3 py-2 text-xs font-bold text-slate-500">
                  Si ese ingreso ya cayó y registraste el movimiento, márcalo como recibido en Ingresos para avanzar la próxima fecha.
                </p>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-400">
                    <span>Margen</span>
                    <span>Compromisos</span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="bg-emerald-500 transition-all"
                      style={{ width: `${nextIncomeMarginWidth}%` }}
                    />
                    <div
                      className="bg-slate-300 transition-all"
                      style={{ width: `${nextIncomeCommitmentWidth}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>{formatMoney(nextIncomeHealth.margin)}</span>
                    <span>{formatMoney(commitmentsBeforeNextIncome)}</span>
                  </div>
                </div>
              </div>

              <div className={`rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${healthCardClasses[pressureHealth.tone]}`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${healthIconClasses[pressureHealth.tone]}`}>
                      <BadgeDollarSign size={19} />
                    </span>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Pagos y compromisos del mes</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${healthToneClasses[pressureHealth.tone]}`}>
                    {pressureHealth.status}
                  </span>
                </div>
                <p className="text-2xl font-black tracking-tight text-slate-950">{formatMoney(pressureHealth.value)}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">Tarjetas, MSI, deudas, recurrentes y alertas con monto.</p>
                {monthlyCommitmentBreakdown.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {monthlyCommitmentBreakdown.map((item) => {
                      const width = pressureHealth.value > 0
                        ? Math.min(100, Math.max(6, (item.amount / pressureHealth.value) * 100))
                        : 0

                      return (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
                            <span>{item.label}</span>
                            <span>{formatMoney(item.amount)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${item.className}`} style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-sm font-bold text-slate-600">{pressureHealth.text}</p>
                )}
                <p className="mt-4 rounded-2xl bg-white/70 px-3 py-2 text-xs font-bold text-slate-500">
                  No es gasto nuevo: es dinero ya comprometido para cubrir este mes.
                </p>
              </div>

              <div className={`rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${healthCardClasses[bestAdvisorCard ? bestAdvisorCard.recommendation === 'avoid' ? 'rose' : bestAdvisorCard.riskLevel === 'medium' ? 'amber' : 'emerald' : 'slate']}`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${bestAdvisorCard ? healthIconClasses[bestAdvisorCard.recommendation === 'avoid' ? 'rose' : bestAdvisorCard.riskLevel === 'medium' ? 'amber' : 'emerald'] : healthIconClasses.slate}`}>
                      <CardIcon size={19} />
                    </span>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Mejor tarjeta hoy</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${bestAdvisorCard ? healthToneClasses[bestAdvisorCard.recommendation === 'avoid' ? 'rose' : bestAdvisorCard.riskLevel === 'medium' ? 'amber' : 'emerald'] : healthToneClasses.slate}`}>
                    {bestAdvisorCard ? (bestAdvisorCard.recommendation === 'avoid' ? 'Evitar' : 'Bien') : 'Sin datos'}
                  </span>
                </div>
                <p className="text-2xl font-black tracking-tight text-slate-950">{bestAdvisorCard?.cardName || '---'}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  {bestAdvisorCard ? `${bestAdvisorCard.financingDaysIfUsedToday} días estimados para pagar.` : 'Registra tarjetas activas para recomendar.'}
                </p>
                <div className="mt-4 rounded-2xl bg-white/70 px-3 py-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Razón principal</p>
                  <p className="mt-1 text-sm font-bold text-slate-700">
                  {bestAdvisorCard?.reasons[0] || 'Sin datos suficientes para elegir tarjeta.'}
                  </p>
                </div>
              </div>

              <div className={`rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${healthCardClasses[leakHealth.tone]}`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${healthIconClasses[leakHealth.tone]}`}>
                      {leakHealth.tone === 'rose' ? <AlertTriangle size={19} /> : <TrendingDown size={19} />}
                    </span>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Categoría de atención</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${healthToneClasses[leakHealth.tone]}`}>
                    {leakHealth.status}
                  </span>
                </div>
                <p className="text-2xl font-black tracking-tight text-slate-950">{leakHealth.title}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">Presupuesto y gasto del mes seleccionado.</p>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-400">
                    <span>Indicador</span>
                    <span>{leakHealth.progress.toFixed(0)}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${leakHealth.tone === 'rose' ? 'bg-rose-500' : leakHealth.tone === 'amber' ? 'bg-amber-500' : leakHealth.tone === 'emerald' ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      style={{ width: `${leakHealth.progress}%` }}
                    />
                  </div>
                </div>
                <p className="mt-4 text-sm font-bold text-slate-700">{leakHealth.text}</p>
              </div>
            </div>
            <p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
              Lectura estimada con base en tus registros actuales.
            </p>
          </Panel>
        </section>

        <Panel title="Lectura del dashboard" subtitle="Ajusta el mes, el medio de pago y la tarjeta antes de revisar disponibilidad, presión, riesgo y fugas">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Mes</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value || currentMonthKey())}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Medio de pago</span>
              <select
                value={paymentFilter}
                onChange={(event) => setPaymentFilter(event.target.value as PaymentFilter)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
              >
                <option value="all">Todos</option>
                <option value="cash">Efectivo / débito</option>
                <option value="credit_card">Tarjeta de crédito</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Tarjeta</span>
              <select
                value={selectedCardId}
                onChange={(event) => setSelectedCardId(event.target.value)}
                disabled={paymentFilter === 'cash'}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="all">Todas las tarjetas</option>
                {creditCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
            En MSI, el saldo usado de la tarjeta sube por el total de la compra; el presupuesto del mes se afecta por la mensualidad pendiente.
          </p>
        </Panel>

        <section className="mt-8 mb-8">
          <Panel title="Proyección de flujo" subtitle="Proyección estimada con base en ingresos y compromisos registrados">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Saldo actual en cuentas</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(cashflowProjection.summary.currentBalance)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-emerald-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Próximo ingreso</p>
                <p className="mt-2 text-2xl font-black text-emerald-700">
                  {cashflowProjection.summary.nextIncomeAmount ? formatMoney(cashflowProjection.summary.nextIncomeAmount) : '---'}
                </p>
                <p className="mt-1 text-xs font-bold text-emerald-700">
                  {cashflowProjection.summary.nextIncomeDate ? formatDate(cashflowProjection.summary.nextIncomeDate) : 'Sin ingreso esperado'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Compromisos a fin de mes</p>
                <p className="mt-2 text-2xl font-black text-rose-600">{formatMoney(projectedCashOutflows)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Cierre estimado del mes</p>
                <p className={`mt-2 text-2xl font-black ${cashflowProjection.summary.projectedEndBalance >= 0 ? 'text-slate-950' : 'text-rose-600'}`}>
                  {formatMoney(cashflowProjection.summary.projectedEndBalance)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Saldo más bajo</p>
                <p className={`mt-2 text-2xl font-black ${cashflowProjection.summary.lowestBalance >= 0 ? 'text-slate-950' : 'text-rose-600'}`}>
                  {formatMoney(cashflowProjection.summary.lowestBalance)}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">{formatDate(cashflowProjection.summary.lowestBalanceDate)}</p>
              </div>
              <div className={`rounded-2xl border p-4 ${riskClasses[cashflowProjection.summary.riskLevel]}`}>
                <p className="text-xs font-black uppercase tracking-widest">Nivel de riesgo</p>
                <p className="mt-2 text-2xl font-black">{riskLabels[cashflowProjection.summary.riskLevel]}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Próximos eventos que afectan el flujo</h3>
                <p className="text-sm font-semibold text-slate-500">Ordenados por fecha. Para ver el saldo después de cada día, entra al detalle.</p>
              </div>
              <Link href="/flujo" className="text-sm font-black uppercase tracking-widest text-slate-500 transition hover:text-slate-950">
                Ver detalle
              </Link>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-5">
              {topCashflowEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black leading-tight text-slate-900">{event.title}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">{formatDate(event.date)}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                      event.confidence === 'confirmed'
                        ? 'bg-emerald-50 text-emerald-700'
                        : event.confidence === 'manual'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-amber-50 text-amber-700'
                    }`}>
                      {confidenceLabels[event.confidence]}
                    </span>
                  </div>
                  <p className={`mt-3 text-xl font-black ${event.direction === 'inflow' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {event.direction === 'inflow' ? '+' : '-'} {formatMoney(event.amount)}
                  </p>
                </div>
              ))}

              {topCashflowEvents.length === 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400 lg:col-span-5">
                  No hay eventos de flujo proyectados para el resto del mes.
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 md:flex-row md:items-center md:justify-between">
              <span>Compras con tarjeta y MSI se muestran como compromisos; el efectivo baja cuando corresponde pagarlos.</span>
              <Link href="/flujo" className="font-black uppercase tracking-widest text-slate-900 hover:text-emerald-600">
                Ver detalle
              </Link>
            </div>
          </Panel>
        </section>

        <section className="mt-8 mb-8">
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">1. Dinero real disponible</p>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">Lo que puedes usar sin perder de vista compromisos</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <KpiCard title="Disponible estimado tras compromisos" value={formatMoney(availableAfterPending)} valueClassName={availableAfterPending >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
            </div>
            <div className="lg:col-span-3">
              <KpiCard title="Efectivo disponible" value={formatMoney(metrics.disponible)} valueClassName="text-slate-950" />
            </div>
            <div className="lg:col-span-3">
              <KpiCard title="Salida real de efectivo" value={formatMoney(metrics.cashOutflow)} valueClassName="text-slate-950" subtitle="Pagos reales desde cuentas, incluidas tarjetas y deudas" />
            </div>
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600">2. Pagos que presionan</p>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">Lo que exige atención antes de gastar más</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5">
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
            </div>

            <div className="lg:col-span-4">
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

            <div className="lg:col-span-3 space-y-6">
              <KpiCard title="MSI comprometido este mes" value={formatMoney(metrics.monthInstallments)} valueClassName="text-sky-600" />
              <KpiCard title="Pagos a tarjetas" value={formatMoney(metrics.cardPayments)} valueClassName="text-sky-600" subtitle="No cuenta como gasto por categoría" />
              <KpiCard title="Pagos de deuda" value={formatMoney(metrics.debtPayments)} valueClassName="text-amber-600" subtitle="Salida real sin categoría de gasto" />
            </div>
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-600">3. Riesgo financiero</p>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">Deuda, presupuesto y margen en una sola lectura</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4 space-y-6">
              <KpiCard title="Deuda total" value={formatMoney(metrics.deuda)} valueClassName="text-rose-600" />
              <KpiCard title="Presupuesto del mes" value={formatMoney(metrics.totalBudget)} valueClassName="text-slate-950" />
              <KpiCard title="Gastado contra presupuesto" value={formatMoney(metrics.totalBudgetSpent)} valueClassName="text-rose-600" />
              <KpiCard
                title="Margen presupuestal"
                value={formatMoney(metrics.totalBudgetRemaining)}
                subtitle={metrics.overBudgetCount > 0 ? `${metrics.overBudgetCount} categoría(s) excedida(s)` : 'Sin categorías excedidas'}
                valueClassName={metrics.totalBudgetRemaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}
              />
            </div>

            <div className="lg:col-span-8">
              <Panel title="Presupuesto del mes" subtitle="Categorías con límite activo, ordenadas por presión">
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
            </div>
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-600">4. Dónde se va el dinero</p>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">Gasto generado, flujo y categorías principales</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4 space-y-6">
              <KpiCard title="Gasto generado del mes" value={formatMoney(metrics.generatedExpense)} valueClassName="text-rose-600" subtitle="Efectivo/debito + compras con tarjeta" />
              <Panel title="Top categorías / fugas" subtitle="Gasto generado por categoría del mes">
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

            <div className="lg:col-span-8">
              <Panel title="Flujo del mes" subtitle="Compara ingreso, gasto generado y salida real de efectivo">
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
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <Panel title="MSI pendientes" subtitle="Mensualidades activas que ya toca procesar">
            {monthInstallmentPlans.length === 0 ? (
              <div className="py-10 text-center text-slate-400 font-medium italic">
                No hay MSI pendientes por procesar.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {monthInstallmentPlans.map((plan) => {
                  const displayState = getInstallmentDisplayState(plan)

                  return (
                    <div key={plan.id} className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-bold text-slate-900">{plan.description}</p>
                        <p className="text-sm text-slate-500">
                          Próxima {displayState.currentInstallmentNumber}/{plan.total_months} · Día {plan.charge_day}
                        </p>
                      </div>
                      <p className="font-black text-sky-600">{formatMoney(Number(plan.monthly_amount || 0))}</p>
                    </div>
                  )
                })}
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

        {/* Acceso a Módulos */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {[
            { label: 'Cuentas', href: '/cuentas', icon: Wallet },
            { label: 'Ingresos', href: '/ingresos', icon: ArrowDownRight },
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
  const [mode, setMode] = useState<'login' | 'signup' | 'recover' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const applyRecoveryModeFromUrl = async () => {
      const currentUrl = new URL(window.location.href)
      const code = currentUrl.searchParams.get('code')
      const queryType = currentUrl.searchParams.get('type')
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const hashType = hashParams.get('type')

      if (queryType === 'recovery' || hashType === 'recovery') {
        setMode('reset')
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          setError('No se pudo validar el enlace de recuperación. Pide uno nuevo.')
          return
        }

        setMode('reset')
        setMessage('Enlace validado. Ahora escribe tu nueva contraseña.')
        window.history.replaceState({}, document.title, currentUrl.pathname)
      }
    }

    void applyRecoveryModeFromUrl()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset')
        setMessage('Ya puedes definir una nueva contraseña.')
        setError('')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase.auth])

  const clearFeedback = () => {
    setError('')
    setMessage('')
  }

  const resetFormFields = () => {
    setPassword('')
    setConfirmPassword('')
  }

  const changeMode = (nextMode: 'login' | 'signup' | 'recover' | 'reset') => {
    setMode(nextMode)
    clearFeedback()
    resetFormFields()
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    clearFeedback()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      window.location.reload()
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    clearFeedback()

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setMessage('Cuenta creada. Revisa tu correo si Supabase te pide confirmación.')
    setLoading(false)
    resetFormFields()
    setMode('login')
  }

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault()
    clearFeedback()
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setMessage('Te enviamos un enlace para restablecer tu contraseña.')
    setLoading(false)
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    clearFeedback()

    if (password.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setMessage('Contraseña actualizada. Entrando a la app...')
    setLoading(false)
    setTimeout(() => {
      window.location.href = '/'
    }, 700)
  }

  const isResetMode = mode === 'reset'
  const isRecoverMode = mode === 'recover'
  const isSignupMode = mode === 'signup'
  const submitLabel = isResetMode
    ? 'Guardar nueva contraseña'
    : isRecoverMode
      ? 'Enviar enlace'
      : isSignupMode
        ? 'Crear cuenta'
        : 'Iniciar sesión'

  const handleSubmit = (e: React.FormEvent) => {
    if (isResetMode) {
      void handlePasswordReset(e)
      return
    }

    if (isRecoverMode) {
      void handleRecovery(e)
      return
    }

    if (isSignupMode) {
      void handleSignUp(e)
      return
    }

    void handleLogin(e)
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] -mr-64 -mt-64" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] -ml-64 -mb-64" />

      <form onSubmit={handleSubmit} className="relative z-10 w-full max-w-md bg-white rounded-[3rem] p-12 shadow-2xl">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-[2rem] bg-slate-950 text-white mb-6 transform -rotate-12 shadow-xl">
            <Wallet size={40} />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-950 uppercase">Finanzas <span className="text-emerald-500">App</span></h1>
          <p className="text-slate-400 font-bold text-sm mt-3 uppercase tracking-widest text-balance leading-relaxed">
            {isResetMode
              ? 'Define una nueva contraseña'
              : isRecoverMode
                ? 'Recupera el acceso a tu cuenta'
                : isSignupMode
                  ? 'Crea tu acceso personal'
                  : 'Control total de tus activos y gastos'}
          </p>
        </div>

        <div className="mb-8 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
          <button type="button" onClick={() => changeMode('login')} className={`rounded-2xl px-3 py-3 transition ${mode === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'hover:text-slate-700'}`}>
            Entrar
          </button>
          <button type="button" onClick={() => changeMode('signup')} className={`rounded-2xl px-3 py-3 transition ${mode === 'signup' ? 'bg-white text-slate-950 shadow-sm' : 'hover:text-slate-700'}`}>
            Crear cuenta
          </button>
          <button type="button" onClick={() => changeMode('recover')} className={`rounded-2xl px-3 py-3 transition ${mode === 'recover' ? 'bg-white text-slate-950 shadow-sm' : 'hover:text-slate-700'}`}>
            Recuperar
          </button>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-5 py-4 font-bold text-slate-900 focus:border-slate-950 focus:bg-white outline-none transition-all" />
          </div>
          {!isRecoverMode && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                {isResetMode ? 'Nueva contraseña' : 'Password'}
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-5 py-4 font-bold text-slate-900 focus:border-slate-950 focus:bg-white outline-none transition-all"
              />
            </div>
          )}
          {(isSignupMode || isResetMode) && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Confirmar password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-5 py-4 font-bold text-slate-900 focus:border-slate-950 focus:bg-white outline-none transition-all"
              />
            </div>
          )}
        </div>

        <button disabled={loading} className="w-full mt-10 rounded-3xl bg-slate-950 py-6 text-xl font-black text-white hover:bg-slate-800 transition shadow-2xl active:scale-95 disabled:opacity-50">
          {loading ? 'Procesando...' : submitLabel}
        </button>
        {message && <p className="mt-6 text-center text-xs font-black text-emerald-600 uppercase">{message}</p>}
        {error && <p className="mt-3 text-center text-xs font-black text-rose-500 uppercase">{error}</p>}
        {mode !== 'login' && !isResetMode && (
          <button
            type="button"
            onClick={() => changeMode('login')}
            className="mt-6 w-full text-center text-xs font-black uppercase tracking-widest text-slate-400 transition hover:text-slate-900"
          >
            Volver a iniciar sesión
          </button>
        )}
      </form>
    </main>
  )
}
