'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getAppDate } from '@/lib/app-date'
import {
  formatMoney,
  formatDate
} from '@/lib/utils'
import {
  buildBudgetRows,
  buildCategoryChartData,
  buildDashboardMetrics,
  type Account,
  type Budget,
  type BudgetProgress,
  type Category,
  type CreditCard,
  type Debt,
  type Reminder,
  type Transaction,
} from '@/lib/dashboard'
import { MiniStat } from '@/components/ui/MiniStat'
import { MainNavigation } from '@/components/ui/MainNavigation'
import {
  getPendingInstallmentAmount,
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
import { buildCashflowProjection } from '@/lib/cashflow-projection'
import { adviseCreditCards } from '@/lib/credit-card-advisor'
import {
  CreditCard as CardIcon,
  Calendar,
  Wallet,
  AlertTriangle,
  Banknote,
  CircleDollarSign,
  HandCoins,
  Landmark,
  Sparkles
} from 'lucide-react'
import Link from 'next/link'

type InstallmentPlan = CreditCardInstallment
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

function sourceLabel(sourceType: FinancialCalendarEvent['sourceType']) {
  const labels: Record<FinancialCalendarEvent['sourceType'], string> = {
    income_schedule: 'Ingreso',
    recurring_charge: 'Recurrente',
    installment: 'MSI',
    credit_card_payment: 'Tarjeta',
    debt_payment: 'Deuda',
    reminder: 'Recordatorio',
    transaction: 'Movimiento',
  }

  return labels[sourceType]
}

function confidenceLabel(event: FinancialCalendarEvent) {
  if (event.eventStatus === 'pending_confirmation') return 'Pendiente'
  if (event.eventStatus === 'informational') return 'Informativo'
  if (event.confidence === 'confirmed') return 'Confirmado'
  if (event.confidence === 'manual') return 'Manual'
  return 'Estimado'
}

function eventAmountClass(event: FinancialCalendarEvent) {
  if (!event.affectsCash) return 'text-sky-600'
  if (event.direction === 'inflow') return 'text-emerald-600'
  if (event.direction === 'outflow') return 'text-rose-600'
  return 'text-slate-600'
}

function sourceActionHref(event?: FinancialCalendarEvent) {
  if (!event) return '/flujo'

  const hrefs: Record<FinancialCalendarEvent['sourceType'], string> = {
    income_schedule: '/ingresos',
    recurring_charge: '/recurrentes',
    installment: '/obligaciones',
    credit_card_payment: '/movimientos/nuevo?type=credit_card_payment',
    debt_payment: '/movimientos/nuevo?type=debt_payment',
    reminder: '/recordatorios',
    transaction: '/movimientos',
  }

  return hrefs[event.sourceType]
}

export default function Home() {
  const supabase = createClient()

  const [session, setSession] = useState<{ user: { email?: string | null } } | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>([])
  const [projectionReminders, setProjectionReminders] = useState<Reminder[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [recurring, setRecurring] = useState<RecurringCharge[]>([])
  const [installments, setInstallments] = useState<InstallmentPlan[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [incomeSchedules, setIncomeSchedules] = useState<IncomeSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const selectedMonth = currentMonthKey()
  const appDate = useMemo(() => getAppDate(), [])

  const loadDashboard = useCallback(async () => {
    setLoadError('')
    setLoading(true)
    try {
      const { start, end, month: currentMonth, year: currentYear } = monthRange(selectedMonth)

      const [
        { data: accountsData, error: accountsError },
        { data: monthTxData, error: monthTxError },
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
        supabase
          .from('transactions')
          .select('*')
          .gte('transaction_date', start.toISOString())
          .lte('transaction_date', end.toISOString()),
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
        monthTxError,
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
      setMonthTransactions((monthTxData as Transaction[]) ?? [])
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

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  )

  const filteredMonthTransactions = monthTransactions

  const msiPurchaseIds = useMemo(
    () => new Set(installments.map((plan) => plan.purchase_transaction_id).filter(Boolean) as string[]),
    [installments]
  )

  const selectedMonthEnd = useMemo(() => monthRange(selectedMonth).end, [selectedMonth])

  const pendingInstallmentAmountForDashboard = useCallback(
    (plan: CreditCardInstallment) => getPendingInstallmentAmount(plan, selectedMonthEnd),
    [selectedMonthEnd]
  )

  const filteredInstallmentsForDashboard = installments

  const pendingInstallmentPlans = useMemo(
    () =>
      filteredInstallmentsForDashboard.filter(
        (plan) => pendingInstallmentAmountForDashboard(plan) > 0
      ),
    [filteredInstallmentsForDashboard, pendingInstallmentAmountForDashboard]
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
    () => {
      const todayKey = appDate.toISOString().slice(0, 10)
      const priority = (event: FinancialCalendarEvent) => {
        if (event.sourceType === 'income_schedule' && event.date <= todayKey) return 0
        if (event.direction === 'outflow' && event.affectsCash && event.date <= todayKey) return 1
        if (event.eventStatus === 'pending_confirmation') return 2
        if (event.direction === 'outflow' && event.affectsCash) return 3
        if (event.sourceType === 'income_schedule') return 4
        if (!event.affectsCash) return 5
        return 6
      }

      return financialEvents
        .filter((event) => event.affectsCash || event.eventStatus === 'pending_confirmation' || event.eventStatus === 'informational')
        .sort((a, b) => {
          const priorityDiff = priority(a) - priority(b)
          if (priorityDiff !== 0) return priorityDiff
          const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime()
          if (dateDiff !== 0) return dateDiff
          return Number(b.amount || 0) - Number(a.amount || 0)
        })
        .slice(0, 5)
    },
    [appDate, financialEvents]
  )

  const categoryChartData = useMemo(
    () => buildCategoryChartData(filteredMonthTransactions, categories, installmentBudgetAmounts, msiPurchaseIds),
    [filteredMonthTransactions, categories, installmentBudgetAmounts, msiPurchaseIds]
  )

  const cardAdvisorResults = useMemo(
    () => adviseCreditCards(creditCards, appDate),
    [creditCards, appDate]
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

  const greeting = appDate.getHours() < 12 ? 'Buenos días' : appDate.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches'
  const nextImportantEvent = topCashflowEvents[0]
  const upcomingEvents = topCashflowEvents.slice(0, 5)
  const projectedPointByDate = new Map(cashflowProjection.points.map((point) => [point.date, point]))
  const primaryAttention = leakHealth.tone === 'slate'
    ? {
      title: nextIncomeHealth.status,
      text: nextIncomeHealth.text,
      tone: nextIncomeHealth.tone,
    }
    : {
      title: leakHealth.title,
      text: leakHealth.text,
      tone: leakHealth.tone,
    }

  const quickActions = [
    {
      label: 'Gasto',
      description: 'Efectivo o débito',
      href: '/movimientos/nuevo?type=expense',
      icon: CircleDollarSign,
      className: 'bg-rose-50 text-rose-700 border-rose-100',
    },
    {
      label: 'Compra TDC',
      description: 'Normal o MSI',
      href: '/movimientos/nuevo?type=credit_card_purchase',
      icon: CardIcon,
      className: 'bg-sky-50 text-sky-700 border-sky-100',
    },
    {
      label: 'Ingreso',
      description: 'Nómina o bono',
      href: '/movimientos/nuevo?type=income',
      icon: Banknote,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
    {
      label: 'Pago TDC',
      description: 'Abono a tarjeta',
      href: '/movimientos/nuevo?type=credit_card_payment',
      icon: Landmark,
      className: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    },
    {
      label: 'Pago deuda',
      description: 'Préstamo o adeudo',
      href: '/movimientos/nuevo?type=debt_payment',
      icon: HandCoins,
      className: 'bg-amber-50 text-amber-700 border-amber-100',
    },
    {
      label: 'Simular',
      description: 'Antes de gastar',
      href: '/flujo',
      icon: Sparkles,
      className: 'bg-slate-100 text-slate-800 border-slate-200',
    },
  ]

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
    <main className="min-h-screen bg-[#eef3f8] pb-28 text-slate-950 md:pb-12">
      <section className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
        <div className="mx-auto max-w-7xl px-5 pb-12 pt-8 md:px-6 md:pb-16 md:pt-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="w-fit rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.26em] text-emerald-200">Hoy</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">
                {greeting}
              </h1>
              <p className="mt-4 max-w-3xl text-base font-semibold leading-relaxed text-slate-200 md:text-lg">
                {healthRiskExplanation} Lectura estimada con tus registros actuales.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/flujo" className="rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black uppercase tracking-widest text-slate-950 shadow-xl shadow-emerald-950/20 transition hover:-translate-y-0.5 hover:bg-emerald-300 active:scale-95">
                Simular compra
              </Link>
              <Link href="/movimientos/nuevo" className="rounded-2xl bg-white px-5 py-4 text-sm font-black uppercase tracking-widest text-slate-950 shadow-xl shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-100 active:scale-95">
                Registrar movimiento
              </Link>
              <button onClick={logout} className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4 text-sm font-black uppercase tracking-widest text-slate-300 transition hover:bg-slate-800">
                Salir
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto max-w-7xl px-5 -mt-7 md:px-6">
        {loadError && (
          <div className="mb-6 rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm font-bold text-rose-700 shadow-sm">
            {loadError}
          </div>
        )}

        <MainNavigation />

        <section className="mb-6 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/8 md:p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Acciones rápidas</p>
              <h2 className="text-2xl font-black tracking-tight text-slate-950">¿Qué necesitas hacer hoy?</h2>
            </div>
            <p className="text-sm font-bold text-slate-500">Accesos directos a tus tareas diarias.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {quickActions.map((action) => {
              const Icon = action.icon

              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-lg ${action.className}`}
                >
                  <div className="flex items-center gap-3 lg:block">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm">
                      <Icon size={20} />
                    </span>
                    <div className="lg:mt-4">
                      <p className="text-sm font-black uppercase tracking-wide">{action.label}</p>
                      <p className="mt-0.5 text-xs font-bold opacity-75">{action.description}</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-[2rem] border border-white/10 bg-[#0d1b2f] p-6 shadow-2xl shadow-slate-950/20 md:p-8 xl:col-span-2">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Posición de efectivo</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">
                  Dinero real para decidir hoy
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-300">
                  Cuentas propias menos compromisos proyectados antes del próximo ingreso.
                </p>
              </div>
              <span className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-widest ${healthToneClasses[nextIncomeHealth.tone]}`}>
                {nextIncomeHealth.status}
              </span>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Dinero</p>
                <p className="mt-2 text-3xl font-black text-white md:text-4xl">{formatMoney(metrics.disponible)}</p>
              </div>
              <div className="hidden text-3xl font-black text-slate-500 md:block">-</div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Compromisos</p>
                <p className="mt-2 text-3xl font-black text-rose-300 md:text-4xl">{formatMoney(commitmentsBeforeNextIncome)}</p>
              </div>
              <div className="hidden text-3xl font-black text-slate-500 md:block">=</div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Margen</p>
                <p className={`mt-2 text-3xl font-black md:text-4xl ${nextIncomeHealth.margin >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {formatMoney(nextIncomeHealth.margin)}
                </p>
              </div>
            </div>

            <div className="mt-7">
              <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-400">
                <span>Margen</span>
                <span>Compromisos</span>
              </div>
              <div className="flex h-4 overflow-hidden rounded-full bg-slate-800">
                <div className="bg-emerald-500 transition-all" style={{ width: `${nextIncomeMarginWidth}%` }} />
                <div className="bg-rose-400 transition-all" style={{ width: `${nextIncomeCommitmentWidth}%` }} />
              </div>
            </div>

            {cashflowProjection.summary.nextIncomeDate ? (
              <p className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-300">
                Próximo ingreso: {formatMoney(cashflowProjection.summary.nextIncomeAmount || 0)} el {formatDate(cashflowProjection.summary.nextIncomeDate)}.
              </p>
            ) : (
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-sm font-bold text-amber-100 sm:flex-row sm:items-center sm:justify-between">
                <span>Falta registrar tu próximo ingreso para estimar la quincena.</span>
                <Link href="/ingresos" className="w-fit rounded-xl bg-amber-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-950">
                  Agregar ingreso
                </Link>
              </div>
            )}

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <MiniStat
                label="Próximo ingreso"
                value={cashflowProjection.summary.nextIncomeAmount ? formatMoney(cashflowProjection.summary.nextIncomeAmount) : '---'}
                subvalue={cashflowProjection.summary.nextIncomeDate ? formatDate(cashflowProjection.summary.nextIncomeDate) : 'Sin ingreso esperado'}
              />
              <MiniStat
                label="Saldo más bajo"
                value={formatMoney(cashflowProjection.summary.lowestBalance)}
                subvalue={formatDate(cashflowProjection.summary.lowestBalanceDate)}
                valueClassName={cashflowProjection.summary.lowestBalance >= 0 ? 'text-slate-950' : 'text-rose-600'}
              />
              <MiniStat
                label="Cierre estimado"
                value={formatMoney(cashflowProjection.summary.projectedEndBalance)}
                subvalue="Fin de mes"
                valueClassName={cashflowProjection.summary.projectedEndBalance >= 0 ? 'text-slate-950' : 'text-rose-600'}
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/8">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-600">Próxima acción</p>
                  <h2 className="mt-2 text-2xl font-black text-slate-950">
                    {nextImportantEvent?.title || 'Sin urgencias'}
                  </h2>
                </div>
                <Calendar size={24} className="text-sky-500" />
              </div>
              {nextImportantEvent ? (
                <>
                  <p className="mt-3 text-sm font-bold text-slate-500">
                    {formatDate(nextImportantEvent.date)} · {sourceLabel(nextImportantEvent.sourceType)} · {confidenceLabel(nextImportantEvent)} · {nextImportantEvent.affectsCash ? 'Afecta caja' : 'Informativo'}
                  </p>
                  <p className={`mt-5 text-4xl font-black ${eventAmountClass(nextImportantEvent)}`}>
                    {nextImportantEvent.direction === 'inflow' ? '+' : '-'} {formatMoney(nextImportantEvent.amount)}
                  </p>
                  <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-semibold text-slate-600">
                    Acción sugerida: {nextImportantEvent.sourceType === 'income_schedule' ? 'confirma si ya recibiste este ingreso.' : 'revisa si este evento ya está cubierto o confirmado.'}
                  </p>
                </>
              ) : (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
                  No hay pagos o ingresos proyectados para mostrar. Agrega recordatorios, ingresos o recurrentes para ver acciones.
                </div>
              )}
              <Link href={sourceActionHref(nextImportantEvent)} className="mt-auto pt-6 text-xs font-black uppercase tracking-widest text-sky-600 transition hover:text-slate-950">
                Atender ahora
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">Mejor tarjeta</p>
                <h2 className="mt-2 text-3xl font-black text-slate-950">{bestAdvisorCard?.cardName || 'Sin datos'}</h2>
              </div>
              <CardIcon size={28} className="text-emerald-500" />
            </div>
            {bestAdvisorCard ? (
              <>
                <p className="mt-3 text-sm font-bold text-slate-500">
                  {bestAdvisorCard.financingDaysIfUsedToday} días estimados de financiamiento.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Corte</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{formatDate(bestAdvisorCard.estimatedCutoffDate.toISOString())}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pago</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{formatDate(bestAdvisorCard.estimatedPaymentDueDate.toISOString())}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Uso</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{(bestAdvisorCard.utilizationRate * 100).toFixed(1)}%</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pago estimado</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{formatMoney(bestAdvisorCard.nextPaymentAmount)}</p>
                  </div>
                </div>
                <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                  {bestAdvisorCard.reasons[0] || 'Mejor balance entre tiempo para pagar y uso de línea.'}
                </p>
              </>
            ) : (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
                No hay tarjetas suficientes para recomendar. Registra tarjeta, corte y fecha de pago.
              </div>
            )}
            <Link href="/tarjetas" className="mt-5 inline-flex text-xs font-black uppercase tracking-widest text-emerald-600 transition hover:text-slate-950">
              Comparar tarjetas
            </Link>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/8 xl:col-span-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-600">Pagos y compromisos</p>
                <h2 className="mt-2 text-4xl font-black text-slate-950">{formatMoney(pressureHealth.value)}</h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
                  Tarjetas, MSI, deudas, recurrentes y alertas con monto. No es gasto nuevo: es dinero ya comprometido para cubrir este mes.
                </p>
              </div>
              <span className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-widest ${healthToneClasses[pressureHealth.tone]}`}>
                {pressureHealth.status}
              </span>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {monthlyCommitmentBreakdown.length > 0 ? monthlyCommitmentBreakdown.map((item) => {
                const width = pressureHealth.value > 0
                  ? Math.min(100, Math.max(6, (item.amount / pressureHealth.value) * 100))
                  : 0

                return (
                  <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm font-black text-slate-600">
                      <span>{item.label}</span>
                      <span>{formatMoney(item.amount)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white">
                      <div className={`h-full rounded-full ${item.className}`} style={{ width: `${width}%` }} />
                    </div>
                  </div>
                )
              }) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500 md:col-span-2">
                  No hay compromisos con monto para este mes. Revisa tarjetas, deudas, recurrentes o recordatorios si esperabas ver pagos aquí.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className={`rounded-[2rem] border p-6 shadow-xl ${healthCardClasses[primaryAttention.tone]}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Atención principal</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">{primaryAttention.title}</h2>
              </div>
              <AlertTriangle size={24} className={primaryAttention.tone === 'rose' ? 'text-rose-500' : primaryAttention.tone === 'amber' ? 'text-amber-500' : 'text-slate-400'} />
            </div>
            <p className="mt-4 text-sm font-bold leading-relaxed text-slate-600">{primaryAttention.text}</p>
            {leakHealth.progress > 0 && (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-400">
                  <span>Indicador</span>
                  <span>{leakHealth.progress.toFixed(0)}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full ${primaryAttention.tone === 'rose' ? 'bg-rose-500' : primaryAttention.tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, leakHealth.progress)}%` }}
                  />
                </div>
              </div>
            )}
            <Link href="/gastos" className="mt-5 inline-flex text-xs font-black uppercase tracking-widest text-slate-500 transition hover:text-slate-950">
              Revisar gastos
            </Link>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/8 xl:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-600">Próximos eventos</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Plan de los siguientes días</h2>
              </div>
              <Link href="/flujo" className="w-fit rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-slate-800">
                Ver planificación completa
              </Link>
            </div>
            <div className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-100 bg-slate-50/70">
              {upcomingEvents.length > 0 ? upcomingEvents.map((event) => {
                const projectedPoint = projectedPointByDate.get(event.date)

                return (
                  <div key={event.id} className="grid gap-3 p-4 sm:grid-cols-[8rem_1fr_auto] sm:items-center">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">{formatDate(event.date)}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-sky-600">{sourceLabel(event.sourceType)}</p>
                    </div>
                    <div>
                      <p className="text-base font-black text-slate-950">{event.title}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {confidenceLabel(event)}
                        {' · '}
                        {event.affectsCash ? 'Afecta caja' : 'Informativo'}
                        {projectedPoint ? ` · Saldo después: ${formatMoney(projectedPoint.endingBalance)}` : ''}
                      </p>
                    </div>
                    <p className={`text-lg font-black sm:text-right ${eventAmountClass(event)}`}>
                      {event.direction === 'inflow' ? '+' : event.direction === 'outflow' ? '-' : ''} {formatMoney(event.amount)}
                    </p>
                  </div>
                )
              }) : (
                <div className="p-5 text-sm font-bold text-slate-500">
                  No hay eventos proyectados. Agrega ingresos, alertas o recurrentes para ver una ruta de flujo.
                </div>
              )}
            </div>
          </div>
        </section>
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
