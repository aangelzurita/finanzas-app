'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  CreditCard,
  ShieldAlert,
  WalletCards,
} from 'lucide-react'
import { MainNavigation } from '@/components/ui/MainNavigation'
import { MiniStat } from '@/components/ui/MiniStat'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatMoney } from '@/lib/utils'
import { getAppDate } from '@/lib/app-date'
import {
  buildFinancialCalendarEvents,
  type FinancialCalendarDebt,
  type FinancialCalendarReminder,
  type IncomeSchedule,
} from '@/lib/financial-calendar'
import type { RecurringCharge } from '@/lib/recurring-charges'
import type { CreditCardInstallment } from '@/lib/credit-card-installments'
import {
  buildFinancialDiagnosis,
  type DiagnosticAccount,
  type DiagnosticCategory,
  type DiagnosticCreditCard,
  type DiagnosticRiskLevel,
  type DiagnosticTransaction,
} from '@/lib/financial-diagnostics'

const riskLabels: Record<DiagnosticRiskLevel, string> = {
  ok: 'Bien',
  caution: 'Precaución',
  risk: 'Riesgo',
}

const riskClasses: Record<DiagnosticRiskLevel, string> = {
  ok: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  caution: 'border-amber-100 bg-amber-50 text-amber-700',
  risk: 'border-rose-100 bg-rose-50 text-rose-700',
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function periodStart(referenceDate: Date, monthsBack = 12) {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() - monthsBack, 1)
}

function percent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${(value * 100).toFixed(0)}%`
}

export default function DiagnosticoPage() {
  const supabase = createClient()
  const appDate = useMemo(() => getAppDate(), [])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [accounts, setAccounts] = useState<DiagnosticAccount[]>([])
  const [creditCards, setCreditCards] = useState<DiagnosticCreditCard[]>([])
  const [transactions, setTransactions] = useState<DiagnosticTransaction[]>([])
  const [categories, setCategories] = useState<DiagnosticCategory[]>([])
  const [incomeSchedules, setIncomeSchedules] = useState<IncomeSchedule[]>([])
  const [reminders, setReminders] = useState<FinancialCalendarReminder[]>([])
  const [recurring, setRecurring] = useState<RecurringCharge[]>([])
  const [installments, setInstallments] = useState<CreditCardInstallment[]>([])
  const [debts, setDebts] = useState<FinancialCalendarDebt[]>([])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setMessage('')

      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/'
        return
      }

      const from = periodStart(appDate).toISOString()
      const [
        { data: accountsData, error: accountsError },
        { data: cardsData, error: cardsError },
        { data: txData, error: txError },
        { data: categoriesData, error: categoriesError },
        { data: incomeData, error: incomeError },
        { data: remindersData, error: remindersError },
        { data: recurringData, error: recurringError },
        { data: installmentsData, error: installmentsError },
        { data: debtsData, error: debtsError },
      ] = await Promise.all([
        supabase.from('accounts').select('*').eq('is_active', true).order('name'),
        supabase
          .from('credit_cards')
          .select('id, name, bank, current_balance, credit_limit, minimum_payment, no_interest_payment, payment_due_day, statement_cutoff_day')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('transactions')
          .select('*')
          .gte('transaction_date', from)
          .order('transaction_date', { ascending: false }),
        supabase.from('categories').select('*').eq('is_active', true),
        supabase.from('income_schedules').select('*').eq('is_active', true),
        supabase.from('reminders').select('*').eq('status', 'pending'),
        supabase.from('recurring_charges').select('*').eq('is_active', true),
        supabase.from('credit_card_installments').select('*').neq('status', 'canceled'),
        supabase.from('debts').select('*').neq('status', 'canceled'),
      ])

      const firstError = [
        accountsError,
        cardsError,
        txError,
        categoriesError,
        incomeError,
        remindersError,
        recurringError,
        installmentsError,
        debtsError,
      ].find(Boolean)

      if (firstError) {
        setMessage(firstError.message)
      }

      setAccounts((accountsData as DiagnosticAccount[]) ?? [])
      setCreditCards((cardsData as DiagnosticCreditCard[]) ?? [])
      setTransactions((txData as DiagnosticTransaction[]) ?? [])
      setCategories((categoriesData as DiagnosticCategory[]) ?? [])
      setIncomeSchedules((incomeData as IncomeSchedule[]) ?? [])
      setReminders((remindersData as FinancialCalendarReminder[]) ?? [])
      setRecurring((recurringData as RecurringCharge[]) ?? [])
      setInstallments((installmentsData as CreditCardInstallment[]) ?? [])
      setDebts((debtsData as FinancialCalendarDebt[]) ?? [])
      setLoading(false)
    }

    void loadData()
  }, [appDate, supabase])

  const financialEvents = useMemo(() => {
    const debtsWithContext = debts.map((debt) => {
      const paymentAccount = accounts.find((account) => account.id === debt.payment_account_id)
      return {
        ...debt,
        payment_account_is_external: paymentAccount?.is_external === true || paymentAccount?.include_in_balance === false,
      }
    })

    return buildFinancialCalendarEvents({
      incomeSchedules,
      reminders,
      recurringCharges: recurring,
      installments,
      creditCards,
      debts: debtsWithContext,
      from: appDate,
      to: addDays(appDate, 60),
    })
  }, [accounts, appDate, creditCards, debts, incomeSchedules, installments, recurring, reminders])

  const diagnosis = useMemo(
    () =>
      buildFinancialDiagnosis({
        accounts,
        creditCards,
        transactions,
        categories,
        installments,
        events: financialEvents,
        referenceDate: appDate,
      }),
    [accounts, appDate, categories, creditCards, financialEvents, installments, transactions]
  )

  const primaryRecommendation = diagnosis.paymentRecommendations[0]
  const riskyAccounts = diagnosis.accountPressures.filter((account) => account.riskLevel !== 'ok')
  const topCategory = diagnosis.spending.topCurrentCategories[0]

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />
          <p className="font-black uppercase tracking-widest text-slate-600">Diagnosticando...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] pb-28 text-slate-950 md:pb-12">
      <section className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
        <div className="mx-auto max-w-7xl px-5 pb-14 pt-8 md:px-6 md:pt-10">
          <nav className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-400">
            <Link href="/" className="transition hover:text-white">Home</Link>
            <span>/</span>
            <span className="text-slate-100">Diagnóstico</span>
          </nav>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="w-fit rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.26em] text-emerald-200">
                Sin IA externa
              </p>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">Diagnóstico financiero</h1>
              <p className="mt-4 max-w-3xl text-base font-semibold leading-relaxed text-slate-200 md:text-lg">
                Reglas explicables con tus cuentas, tarjetas, movimientos y compromisos. No mueve saldos ni registra movimientos.
              </p>
            </div>
            <Link href="/flujo" className="w-fit rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black uppercase tracking-widest text-slate-950 shadow-xl shadow-emerald-950/20 transition hover:bg-emerald-300">
              Simular decisión
            </Link>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto -mt-7 max-w-7xl px-5 md:px-6">
        {message && (
          <div className="mb-6 rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm font-bold text-rose-700 shadow-sm">
            {message}
          </div>
        )}

        <MainNavigation />

        <section className="mb-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/8 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-600">Lectura ejecutiva</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Qué revisar antes de pagar o gastar</h2>
              </div>
              <Brain className="text-sky-500" size={30} />
            </div>

            <div className="mt-6 grid gap-3">
              {diagnosis.executiveFindings.map((finding) => (
                <div key={finding} className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold leading-relaxed text-slate-700">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={18} />
                  <span>{finding}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/8 md:p-8">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">Pago recomendado</p>
            {primaryRecommendation ? (
              <>
                <h2 className="mt-2 text-3xl font-black text-slate-950">{primaryRecommendation.targetName}</h2>
                <p className="mt-2 text-sm font-bold text-slate-500">
                  {formatMoney(primaryRecommendation.amount)} · vence {primaryRecommendation.dueDate ? formatDate(primaryRecommendation.dueDate) : 'sin fecha'}
                </p>
                <div className="mt-5 rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Usar cuenta</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">
                    {primaryRecommendation.recommendedAccountName || 'Sin cuenta recomendada'}
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-600">
                    Margen después del pago: {formatMoney(primaryRecommendation.projectedMarginAfterPayment)}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest ${riskClasses[primaryRecommendation.riskLevel]}`}>
                    {riskLabels[primaryRecommendation.riskLevel]}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-widest text-slate-600">
                    Score {primaryRecommendation.score}/100
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                No hay pagos de tarjeta con monto suficiente para recomendar una cuenta.
              </div>
            )}
          </div>
        </section>

        <section className="mb-6 grid gap-6 md:grid-cols-4">
          <MiniStat
            label="Gasto este mes"
            value={formatMoney(diagnosis.spending.currentMonthSpend)}
          />
          <MiniStat
            label="Mes anterior"
            value={formatMoney(diagnosis.spending.previousMonthSpend)}
          />
          <MiniStat
            label="Cambio"
            value={formatMoney(diagnosis.spending.changeVsPrevious)}
            subvalue={percent(diagnosis.spending.changeRateVsPrevious)}
            valueClassName={diagnosis.spending.changeVsPrevious > 0 ? 'text-rose-600' : diagnosis.spending.changeVsPrevious < 0 ? 'text-emerald-600' : 'text-slate-950'}
          />
          <MiniStat
            label="Categoría principal"
            value={topCategory?.categoryName || 'Sin datos'}
            subvalue={topCategory ? formatMoney(topCategory.currentSpend) : undefined}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-600">Ruta de pago</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Tarjetas y cuenta sugerida</h2>
              </div>
              <CreditCard className="text-indigo-500" size={28} />
            </div>

            <div className="mt-6 space-y-3">
              {diagnosis.paymentRecommendations.length > 0 ? diagnosis.paymentRecommendations.map((item) => (
                <div key={item.targetId} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-lg font-black text-slate-950">{item.targetName}</p>
                      <p className="mt-1 text-sm font-bold text-slate-500">
                        {formatMoney(item.amount)} · {item.dueDate ? formatDate(item.dueDate) : 'sin fecha'}
                      </p>
                    </div>
                    <span className={`w-fit rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${riskClasses[item.riskLevel]}`}>
                      {riskLabels[item.riskLevel]}
                    </span>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white px-4 py-3">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Cuenta sugerida</p>
                    <p className="mt-1 font-black text-slate-950">{item.recommendedAccountName || 'No disponible'}</p>
                    <p className="mt-1 text-sm font-bold text-slate-500">Margen: {formatMoney(item.projectedMarginAfterPayment)}</p>
                  </div>
                  {(item.reasons.length > 0 || item.warnings.length > 0) && (
                    <div className="mt-3 grid gap-2">
                      {[...item.reasons.slice(0, 2), ...item.warnings.slice(0, 2)].map((reason) => (
                        <p key={reason} className="text-xs font-bold leading-relaxed text-slate-500">{reason}</p>
                      ))}
                    </div>
                  )}
                </div>
              )) : (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                  Sin pagos de tarjeta con monto registrado para analizar.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-600">Presión por cuenta</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Dónde podrías quedarte corto</h2>
              </div>
              <WalletCards className="text-amber-500" size={28} />
            </div>

            <div className="mt-6 space-y-3">
              {(riskyAccounts.length > 0 ? riskyAccounts : diagnosis.accountPressures.slice(0, 4)).map((account) => (
                <div key={account.accountId} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-black text-slate-950">{account.accountName}</p>
                      <p className="mt-1 text-sm font-bold text-slate-500">Saldo actual: {formatMoney(account.currentBalance)}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${riskClasses[account.riskLevel]}`}>
                      {riskLabels[account.riskLevel]}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <MiniStat label="Entradas" value={formatMoney(account.projectedInflow)} valueClassName="text-emerald-600" />
                    <MiniStat label="Salidas" value={formatMoney(account.projectedOutflow)} valueClassName="text-rose-600" />
                    <MiniStat label="Proyectado" value={formatMoney(account.projectedBalance)} valueClassName={account.projectedBalance >= 0 ? 'text-slate-950' : 'text-rose-600'} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-600">Aumentos de gasto</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Dónde subió contra el mes anterior</h2>
              </div>
              <ArrowUpRight className="text-rose-500" size={28} />
            </div>
            <div className="mt-6 space-y-3">
              {diagnosis.spending.topIncreases.length > 0 ? diagnosis.spending.topIncreases.map((item) => (
                <div key={item.categoryId} className="flex items-center justify-between gap-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                  <div>
                    <p className="font-black text-slate-950">{item.categoryName}</p>
                    <p className="text-sm font-bold text-slate-500">{formatMoney(item.previousSpend)} → {formatMoney(item.currentSpend)}</p>
                  </div>
                  <p className="text-right font-black text-rose-600">+{formatMoney(item.changeVsPrevious)}</p>
                </div>
              )) : (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                  No hay incrementos relevantes contra el mes anterior.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">Reducciones</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Dónde bajó el gasto</h2>
              </div>
              <ArrowDownRight className="text-emerald-500" size={28} />
            </div>
            <div className="mt-6 space-y-3">
              {diagnosis.spending.topDecreases.length > 0 ? diagnosis.spending.topDecreases.map((item) => (
                <div key={item.categoryId} className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <div>
                    <p className="font-black text-slate-950">{item.categoryName}</p>
                    <p className="text-sm font-bold text-slate-500">{formatMoney(item.previousSpend)} → {formatMoney(item.currentSpend)}</p>
                  </div>
                  <p className="text-right font-black text-emerald-600">{formatMoney(item.changeVsPrevious)}</p>
                </div>
              )) : (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                  No hay reducciones relevantes contra el mes anterior.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/8">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Notas del diagnóstico</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">Cómo leerlo</h2>
            </div>
            <ShieldAlert className="text-slate-400" size={28} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold leading-relaxed text-slate-600">
              Las recomendaciones no dividen pagos entre cuentas: si una cuenta no cubre el monto completo, se marca como riesgo.
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold leading-relaxed text-slate-600">
              “Mismo banco” se infiere por texto entre banco de tarjeta e institución/nombre de cuenta. Si falta ese dato, pesa más el margen.
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold leading-relaxed text-slate-600">
              El análisis de gasto usa movimientos presupuestales y mensualidades MSI, no pagos de tarjeta como gasto nuevo.
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
