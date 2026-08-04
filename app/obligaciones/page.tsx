'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarClock, CreditCard, Repeat, ReceiptText } from 'lucide-react'
import { MainNavigation } from '@/components/ui/MainNavigation'
import { MiniStat } from '@/components/ui/MiniStat'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatMoney } from '@/lib/utils'
import {
  buildUpcomingCardPayments,
  type CreditCard as DashboardCreditCard,
  type Debt,
  type Reminder,
} from '@/lib/dashboard'
import {
  getInstallmentDisplayState,
  type CreditCardInstallment,
} from '@/lib/credit-card-installments'
import { getPendingRecurringAmount, type RecurringCharge } from '@/lib/recurring-charges'

type Account = {
  id: string
  name: string
  is_external?: boolean | null
  include_in_balance?: boolean | null
}

export default function ObligacionesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [cards, setCards] = useState<DashboardCreditCard[]>([])
  const [installments, setInstallments] = useState<CreditCardInstallment[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [recurring, setRecurring] = useState<RecurringCharge[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])

  useEffect(() => {
    const loadData = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        window.location.href = '/'
        return
      }

      const [
        { data: cardsData, error: cardsError },
        { data: installmentsData, error: installmentsError },
        { data: debtsData, error: debtsError },
        { data: recurringData, error: recurringError },
        { data: remindersData, error: remindersError },
        { data: accountsData, error: accountsError },
      ] = await Promise.all([
        supabase.from('credit_cards').select('*').eq('is_active', true).order('name'),
        supabase.from('credit_card_installments').select('*').neq('status', 'canceled'),
        supabase.from('debts').select('*').neq('status', 'canceled').order('next_payment_date', { ascending: true }),
        supabase.from('recurring_charges').select('*').eq('is_active', true),
        supabase.from('reminders').select('*').eq('status', 'pending').order('due_date', { ascending: true }),
        supabase.from('accounts').select('id, name, is_external, include_in_balance').eq('is_active', true),
      ])

      const firstError = [cardsError, installmentsError, debtsError, recurringError, remindersError, accountsError].find(Boolean)
      if (firstError) setMessage(firstError.message)

      setCards((cardsData as DashboardCreditCard[]) ?? [])
      setInstallments((installmentsData as CreditCardInstallment[]) ?? [])
      setDebts((debtsData as Debt[]) ?? [])
      setRecurring((recurringData as RecurringCharge[]) ?? [])
      setReminders((remindersData as Reminder[]) ?? [])
      setAccounts((accountsData as Account[]) ?? [])
      setLoading(false)
    }

    void loadData()
  }, [supabase])

  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])
  const cardPayments = useMemo(() => buildUpcomingCardPayments(cards), [cards])
  const totalCardPayments = useMemo(
    () => cardPayments.reduce((acc, card) => acc + Number(card.no_interest_payment || card.minimum_payment || 0), 0),
    [cardPayments]
  )
  const activeInstallments = useMemo(
    () => installments.filter((plan) => plan.status === 'active'),
    [installments]
  )
  const installmentTotal = useMemo(
    () => activeInstallments.reduce((acc, plan) => acc + Number(plan.monthly_amount || 0), 0),
    [activeInstallments]
  )
  const debtTotal = useMemo(
    () => debts.reduce((acc, debt) => acc + Number(debt.monthly_payment || 0), 0),
    [debts]
  )
  const recurringDue = useMemo(
    () => recurring.filter((charge) => getPendingRecurringAmount(charge) > 0),
    [recurring]
  )
  const reminderAmount = useMemo(
    () => reminders.reduce((acc, reminder) => acc + Number(reminder.amount || 0), 0),
    [reminders]
  )

  if (loading) {
    return (
      <main className="finance-shell flex min-h-screen items-center justify-center">
        <p className="text-sm font-black uppercase tracking-widest text-slate-500">Cargando obligaciones...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] pb-28 md:pb-12">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Obligaciones</p>
          <h1 className="mt-3 text-5xl font-black tracking-tight text-slate-950">Pagos y compromisos</h1>
          <p className="mt-3 max-w-2xl text-lg font-semibold text-slate-500">
            Lo que ya tienes comprometido: tarjetas, MSI, deudas, recurrentes y alertas financieras.
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

        <div className="mb-6 grid gap-3 md:grid-cols-5">
          {[
            { label: 'Tarjetas', href: '/tarjetas', icon: CreditCard },
            { label: 'MSI', href: '/tarjetas', icon: CalendarClock },
            { label: 'Deudas', href: '/deudas', icon: ReceiptText },
            { label: 'Recurrentes', href: '/recurrentes', icon: Repeat },
            { label: 'Alertas', href: '/recordatorios', icon: Bell },
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
          <MiniStat label="Tarjetas por pagar" value={formatMoney(totalCardPayments)} />
          <MiniStat label="MSI informativos" value={formatMoney(installmentTotal)} />
          <MiniStat label="Deudas estimadas" value={formatMoney(debtTotal)} />
          <MiniStat label="Alertas con monto" value={formatMoney(reminderAmount)} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="finance-card-strong rounded-[2rem] p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Tarjetas</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Próximos pagos TDC</h2>
              </div>
              <CreditCard className="text-slate-400" />
            </div>
            <div className="space-y-3">
              {cardPayments.slice(0, 6).map((card) => (
                <Link key={card.id} href={`/tarjetas/${card.id}`} className="block rounded-2xl border border-slate-100 bg-white p-4 transition hover:border-slate-300">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-slate-950">{card.name}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        Corte {formatDate(card.cutoffDate)} · pago {formatDate(card.dueDate)}
                      </p>
                    </div>
                    <p className="font-black text-amber-600">{formatMoney(Number(card.no_interest_payment || card.minimum_payment || 0))}</p>
                  </div>
                </Link>
              ))}
              {cardPayments.length === 0 && <EmptyText text="No hay tarjetas con pago pendiente." />}
            </div>
          </section>

          <section className="finance-card-strong rounded-[2rem] p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">MSI</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Mensualidades en tarjeta</h2>
              </div>
              <CalendarClock className="text-sky-500" />
            </div>
            <div className="space-y-3">
              {activeInstallments.slice(0, 6).map((plan) => {
                const state = getInstallmentDisplayState(plan)
                return (
                  <Link key={plan.id} href={`/tarjetas/${plan.credit_card_id}`} className="block rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-slate-950">{plan.description}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          MSI {state.currentInstallmentNumber}/{plan.total_months} · no es salida adicional fuera del pago TDC
                        </p>
                      </div>
                      <p className="font-black text-sky-600">{formatMoney(Number(plan.monthly_amount || 0))}</p>
                    </div>
                  </Link>
                )
              })}
              {activeInstallments.length === 0 && <EmptyText text="No hay MSI activos." />}
            </div>
          </section>

          <section className="finance-card-strong rounded-[2rem] p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Préstamos</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Deudas</h2>
              </div>
              <ReceiptText className="text-rose-500" />
            </div>
            <div className="space-y-3">
              {debts.slice(0, 6).map((debt) => {
                const account = debt.payment_account_id ? accountMap.get(debt.payment_account_id) : null
                const external = account?.is_external === true || account?.include_in_balance === false
                return (
                  <Link key={debt.id} href={`/deudas/${debt.id}/editar`} className="block rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-slate-950">{debt.name || 'Deuda'}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {debt.next_payment_date ? formatDate(debt.next_payment_date) : 'Sin fecha'} · {external ? 'fuente externa' : account?.name || 'sin cuenta'}
                        </p>
                      </div>
                      <p className="font-black text-rose-600">{formatMoney(Number(debt.monthly_payment || 0))}</p>
                    </div>
                  </Link>
                )
              })}
              {debts.length === 0 && <EmptyText text="No hay deudas activas." />}
            </div>
          </section>

          <section className="finance-card-strong rounded-[2rem] p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Recurrentes y alertas</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Pendientes</h2>
              </div>
              <Repeat className="text-amber-500" />
            </div>
            <div className="space-y-3">
              {recurringDue.slice(0, 4).map((charge) => (
                <Link key={charge.id} href="/recurrentes" className="block rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-slate-950">{charge.name}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{charge.next_charge_date ? formatDate(charge.next_charge_date) : 'Sin fecha'} · recurrente</p>
                    </div>
                    <p className="font-black text-amber-600">{formatMoney(getPendingRecurringAmount(charge))}</p>
                  </div>
                </Link>
              ))}
              {reminders.filter((reminder) => Number(reminder.amount || 0) > 0).slice(0, 4).map((reminder) => (
                <Link key={reminder.id} href="/recordatorios" className="block rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-slate-950">{reminder.title}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{formatDate(reminder.due_date)} · alerta financiera</p>
                    </div>
                    <p className="font-black text-slate-900">{formatMoney(Number(reminder.amount || 0))}</p>
                  </div>
                </Link>
              ))}
              {recurringDue.length === 0 && reminders.filter((reminder) => Number(reminder.amount || 0) > 0).length === 0 && (
                <EmptyText text="No hay recurrentes o alertas financieras con monto." />
              )}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Link href="/tarjetas" className="finance-hover finance-card rounded-[1.5rem] p-5 font-black text-slate-950">Administrar tarjetas</Link>
          <Link href="/deudas" className="finance-hover finance-card rounded-[1.5rem] p-5 font-black text-slate-950">Administrar deudas</Link>
          <Link href="/recurrentes" className="finance-hover finance-card rounded-[1.5rem] p-5 font-black text-slate-950">Administrar recurrentes</Link>
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
