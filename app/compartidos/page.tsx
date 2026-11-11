'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  CheckCircle2,
  HandCoins,
  PlusCircle,
  ReceiptText,
  Scale,
  UsersRound,
} from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { formatAppDateKey, getAppDate } from '@/lib/app-date'
import { formatDate, formatMoney, friendlyTransactionType } from '@/lib/utils'
import {
  buildSharedGroupLedger,
  describeSelfBalance,
  getSelfLedgerRow,
  roundMoney,
  validateSplitTotal,
  type SharedAdjustment,
  type SharedCutoff,
  type SharedExpense,
  type SharedExpenseSplit,
  type SharedGroup,
  type SharedGroupMember,
  type SharedLedgerRow,
  type SharedParticipant,
  type SharedSettlement,
} from '@/lib/shared-expenses'

type TransactionOption = {
  id: string
  description: string | null
  amount: number
  transaction_date: string
  transaction_type: string
  category_id: string | null
}

type Category = {
  id: string
  name: string
}

type GroupForm = {
  name: string
  selfName: string
  otherName: string
  selfPercentage: string
}

type ExpenseForm = {
  transactionId: string
  description: string
  amount: string
  expenseDate: string
  paidByParticipantId: string
  selfPercentage: string
  categoryId: string
}

type SettlementForm = {
  fromParticipantId: string
  toParticipantId: string
  amount: string
  settlementDate: string
  notes: string
}

type CutoffForm = {
  name: string
  startDate: string
  endDate: string
}

const emptyGroupForm: GroupForm = {
  name: '',
  selfName: 'Yo',
  otherName: '',
  selfPercentage: '50',
}

function createEmptyExpenseForm(date: Date): ExpenseForm {
  return {
    transactionId: '',
    description: '',
    amount: '',
    expenseDate: formatAppDateKey(date),
    paidByParticipantId: '',
    selfPercentage: '50',
    categoryId: '',
  }
}

function createEmptySettlementForm(date: Date): SettlementForm {
  return {
    fromParticipantId: '',
    toParticipantId: '',
    amount: '',
    settlementDate: formatAppDateKey(date),
    notes: '',
  }
}

function createEmptyCutoffForm(date: Date): CutoffForm {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  return {
    name: `Corte ${date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}`,
    startDate: formatAppDateKey(start),
    endDate: formatAppDateKey(date),
  }
}

function getDateOnly(value: string) {
  return value.slice(0, 10)
}

function parseMoney(value: string) {
  return Number(value.replace(/,/g, '')) || 0
}

function expenseSelfImpact(expense: SharedExpense, rows: SharedExpenseSplit[], selfId: string | null) {
  if (!selfId) return 0
  const paid = expense.paid_by_participant_id === selfId ? Number(expense.total_amount || 0) : 0
  const owed = rows
    .filter((split) => split.participant_id === selfId)
    .reduce((acc, split) => acc + Number(split.amount_owed || 0), 0)
  return roundMoney(paid - owed)
}

function balanceClassName(value: number) {
  if (value > 0) return 'text-emerald-600'
  if (value < 0) return 'text-rose-600'
  return 'text-slate-950'
}

function participantName(participants: SharedParticipant[], id: string) {
  return participants.find((participant) => participant.id === id)?.name ?? 'Persona'
}

export default function CompartidosPage() {
  const supabase = createClient()
  const appDate = useMemo(() => getAppDate(), [])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [participants, setParticipants] = useState<SharedParticipant[]>([])
  const [groups, setGroups] = useState<SharedGroup[]>([])
  const [members, setMembers] = useState<SharedGroupMember[]>([])
  const [expenses, setExpenses] = useState<SharedExpense[]>([])
  const [splits, setSplits] = useState<SharedExpenseSplit[]>([])
  const [settlements, setSettlements] = useState<SharedSettlement[]>([])
  const [cutoffs, setCutoffs] = useState<SharedCutoff[]>([])
  const [adjustments, setAdjustments] = useState<SharedAdjustment[]>([])
  const [transactions, setTransactions] = useState<TransactionOption[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm)
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(() => createEmptyExpenseForm(appDate))
  const [settlementForm, setSettlementForm] = useState<SettlementForm>(() => createEmptySettlementForm(appDate))
  const [cutoffForm, setCutoffForm] = useState<CutoffForm>(() => createEmptyCutoffForm(appDate))

  const loadData = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      window.location.href = '/'
      return
    }

    const start = new Date(appDate)
    start.setMonth(start.getMonth() - 6)

    const [
      { data: participantData, error: participantError },
      { data: groupData, error: groupError },
      { data: memberData, error: memberError },
      { data: expenseData, error: expenseError },
      { data: splitData, error: splitError },
      { data: settlementData, error: settlementError },
      { data: cutoffData, error: cutoffError },
      { data: adjustmentData, error: adjustmentError },
      { data: transactionData, error: transactionError },
      { data: categoryData, error: categoryError },
    ] = await Promise.all([
      supabase.from('shared_participants').select('*').order('is_self', { ascending: false }).order('name'),
      supabase.from('shared_groups').select('*').neq('status', 'archived').order('created_at', { ascending: false }),
      supabase.from('shared_group_members').select('*').order('created_at', { ascending: true }),
      supabase.from('shared_expenses').select('*').neq('status', 'void').order('expense_date', { ascending: false }),
      supabase.from('shared_expense_splits').select('*'),
      supabase.from('shared_settlements').select('*').order('settlement_date', { ascending: false }),
      supabase.from('shared_cutoffs').select('*').order('end_date', { ascending: false }),
      supabase.from('shared_adjustments').select('*').order('adjustment_date', { ascending: false }),
      supabase
        .from('transactions')
        .select('id, description, amount, transaction_date, transaction_type, category_id')
        .in('transaction_type', ['expense', 'credit_card_purchase'])
        .eq('status', 'completed')
        .gte('transaction_date', start.toISOString())
        .order('transaction_date', { ascending: false })
        .limit(100),
      supabase.from('categories').select('id, name').eq('is_active', true).eq('category_type', 'expense').order('name'),
    ])

    const firstError = [
      participantError,
      groupError,
      memberError,
      expenseError,
      splitError,
      settlementError,
      cutoffError,
      adjustmentError,
      transactionError,
      categoryError,
    ].find(Boolean)

    if (firstError) setMessage(firstError.message)

    const loadedGroups = (groupData as SharedGroup[]) ?? []
    setParticipants((participantData as SharedParticipant[]) ?? [])
    setGroups(loadedGroups)
    setMembers((memberData as SharedGroupMember[]) ?? [])
    setExpenses((expenseData as SharedExpense[]) ?? [])
    setSplits((splitData as SharedExpenseSplit[]) ?? [])
    setSettlements((settlementData as SharedSettlement[]) ?? [])
    setCutoffs((cutoffData as SharedCutoff[]) ?? [])
    setAdjustments((adjustmentData as SharedAdjustment[]) ?? [])
    setTransactions((transactionData as TransactionOption[]) ?? [])
    setCategories((categoryData as Category[]) ?? [])
    setSelectedGroupId((current) => current || loadedGroups[0]?.id || '')
    setLoading(false)
  }, [appDate, supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
  }, [loadData])

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  )
  const groupMembers = useMemo(
    () => members.filter((member) => member.group_id === selectedGroupId && member.status === 'active'),
    [members, selectedGroupId]
  )
  const groupParticipants = useMemo(
    () =>
      groupMembers
        .map((member) => participants.find((participant) => participant.id === member.participant_id))
        .filter((participant): participant is SharedParticipant => Boolean(participant)),
    [groupMembers, participants]
  )
  const groupExpenses = useMemo(
    () => expenses.filter((expense) => expense.group_id === selectedGroupId),
    [expenses, selectedGroupId]
  )
  const groupSettlements = useMemo(
    () => settlements.filter((settlement) => settlement.group_id === selectedGroupId),
    [settlements, selectedGroupId]
  )
  const groupAdjustments = useMemo(
    () => adjustments.filter((adjustment) => adjustment.group_id === selectedGroupId),
    [adjustments, selectedGroupId]
  )
  const groupSplits = useMemo(() => {
    const expenseIds = new Set(groupExpenses.map((expense) => expense.id))
    return splits.filter((split) => expenseIds.has(split.shared_expense_id))
  }, [groupExpenses, splits])
  const ledger = useMemo<SharedLedgerRow[]>(
    () =>
      buildSharedGroupLedger({
        participants,
        members: groupMembers,
        expenses: groupExpenses,
        splits: groupSplits,
        settlements: groupSettlements,
        adjustments: groupAdjustments,
      }),
    [participants, groupMembers, groupExpenses, groupSplits, groupSettlements, groupAdjustments]
  )
  const selfRow = useMemo(() => getSelfLedgerRow(ledger), [ledger])
  const selfParticipantId = selfRow?.participantId ?? null
  const totalShared = useMemo(
    () => groupExpenses.reduce((acc, expense) => acc + Number(expense.total_amount || 0), 0),
    [groupExpenses]
  )
  const totalSettled = useMemo(
    () => groupSettlements.reduce((acc, settlement) => acc + Number(settlement.amount || 0), 0),
    [groupSettlements]
  )
  const latestExpenses = useMemo(() => groupExpenses.slice(0, 6), [groupExpenses])
  const groupCutoffs = useMemo(
    () => cutoffs.filter((cutoff) => cutoff.group_id === selectedGroupId).slice(0, 4),
    [cutoffs, selectedGroupId]
  )

  const onCreateGroup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setSaving(true)

    const selfPercentage = Math.min(100, Math.max(0, parseMoney(groupForm.selfPercentage)))
    const otherPercentage = roundMoney(100 - selfPercentage)

    if (!groupForm.name.trim() || !groupForm.selfName.trim() || !groupForm.otherName.trim()) {
      setMessage('Completa el nombre del grupo y las dos personas.')
      setSaving(false)
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) {
      setSaving(false)
      return
    }

    const existingSelf = participants.find((participant) => participant.is_self && participant.status === 'active')
    let selfData = existingSelf ?? null
    let selfError: { message: string } | null = null

    if (!selfData) {
      const { data, error } = await supabase
        .from('shared_participants')
        .insert({
          user_id: userId,
          name: groupForm.selfName.trim(),
          is_self: true,
        })
        .select()
        .single()

      selfData = data as SharedParticipant | null
      selfError = error
    }

    const { data: otherData, error: otherError } = await supabase
      .from('shared_participants')
      .insert({
        user_id: userId,
        name: groupForm.otherName.trim(),
        is_self: false,
      })
      .select()
      .single()

    if (selfError || otherError || !selfData || !otherData) {
      setMessage(selfError?.message || otherError?.message || 'No se pudieron crear los participantes.')
      setSaving(false)
      return
    }

    const { data: groupData, error: groupError } = await supabase
      .from('shared_groups')
      .insert({
        user_id: userId,
        name: groupForm.name.trim(),
        currency: 'MXN',
      })
      .select()
      .single()

    if (groupError || !groupData) {
      setMessage(groupError?.message || 'No se pudo crear el grupo.')
      setSaving(false)
      return
    }

    const { error: memberError } = await supabase.from('shared_group_members').insert([
      {
        group_id: groupData.id,
        participant_id: selfData.id,
        default_percentage: selfPercentage,
      },
      {
        group_id: groupData.id,
        participant_id: otherData.id,
        default_percentage: otherPercentage,
      },
    ])

    if (memberError) {
      setMessage(memberError.message)
      setSaving(false)
      return
    }

    setGroupForm(emptyGroupForm)
    setSelectedGroupId(groupData.id)
    setMessage('Grupo compartido creado.')
    await loadData()
    setSaving(false)
  }

  const onSelectTransaction = (transactionId: string) => {
    const transaction = transactions.find((item) => item.id === transactionId)
    setExpenseForm((current) => ({
      ...current,
      transactionId,
      description: transaction?.description || current.description,
      amount: transaction ? String(Number(transaction.amount || 0)) : current.amount,
      expenseDate: transaction ? getDateOnly(transaction.transaction_date) : current.expenseDate,
      categoryId: transaction?.category_id || current.categoryId,
    }))
  }

  const onCreateExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setSaving(true)

    const amount = roundMoney(parseMoney(expenseForm.amount))
    const selfPercentage = Math.min(100, Math.max(0, parseMoney(expenseForm.selfPercentage)))
    const otherPercentage = roundMoney(100 - selfPercentage)
    const selfMember = groupMembers.find((member) =>
      participants.find((participant) => participant.id === member.participant_id && participant.is_self)
    )
    const otherMember = groupMembers.find((member) => member.participant_id !== selfMember?.participant_id)

    if (!selectedGroupId || !expenseForm.paidByParticipantId || !expenseForm.description.trim() || amount <= 0) {
      setMessage('Completa grupo, pagador, concepto y monto.')
      setSaving(false)
      return
    }

    if (!selfMember || !otherMember) {
      setMessage('Este MVP necesita un grupo con dos personas activas.')
      setSaving(false)
      return
    }

    const selfAmount = roundMoney((amount * selfPercentage) / 100)
    const otherAmount = roundMoney(amount - selfAmount)
    if (!validateSplitTotal(amount, [selfAmount, otherAmount])) {
      setMessage('La división no cuadra con el total del gasto.')
      setSaving(false)
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) {
      setSaving(false)
      return
    }

    const { data: expenseData, error: expenseError } = await supabase
      .from('shared_expenses')
      .insert({
        user_id: userId,
        group_id: selectedGroupId,
        transaction_id: expenseForm.transactionId || null,
        category_id: expenseForm.categoryId || null,
        paid_by_participant_id: expenseForm.paidByParticipantId,
        description: expenseForm.description.trim(),
        total_amount: amount,
        expense_date: expenseForm.expenseDate,
        split_method: 'percentage',
      })
      .select()
      .single()

    if (expenseError || !expenseData) {
      setMessage(expenseError?.message || 'No se pudo registrar el gasto compartido.')
      setSaving(false)
      return
    }

    const { error: splitError } = await supabase.from('shared_expense_splits').insert([
      {
        shared_expense_id: expenseData.id,
        participant_id: selfMember.participant_id,
        percentage: selfPercentage,
        amount_owed: selfAmount,
      },
      {
        shared_expense_id: expenseData.id,
        participant_id: otherMember.participant_id,
        percentage: otherPercentage,
        amount_owed: otherAmount,
      },
    ])

    if (splitError) {
      setMessage(splitError.message)
      setSaving(false)
      return
    }

    setExpenseForm(createEmptyExpenseForm(appDate))
    setMessage('Gasto compartido registrado sin mover saldos reales.')
    await loadData()
    setSaving(false)
  }

  const onCreateSettlement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setSaving(true)

    const amount = roundMoney(parseMoney(settlementForm.amount))
    if (
      !selectedGroupId ||
      !settlementForm.fromParticipantId ||
      !settlementForm.toParticipantId ||
      settlementForm.fromParticipantId === settlementForm.toParticipantId ||
      amount <= 0
    ) {
      setMessage('Completa personas distintas y un monto mayor a cero.')
      setSaving(false)
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) {
      setSaving(false)
      return
    }

    const { error } = await supabase.from('shared_settlements').insert({
      user_id: userId,
      group_id: selectedGroupId,
      from_participant_id: settlementForm.fromParticipantId,
      to_participant_id: settlementForm.toParticipantId,
      amount,
      settlement_date: settlementForm.settlementDate,
      affects_cash: false,
      notes: settlementForm.notes || null,
    })

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    setSettlementForm(createEmptySettlementForm(appDate))
    setMessage('Liquidación anotada solo para balance compartido.')
    await loadData()
    setSaving(false)
  }

  const onCreateCutoff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setSaving(true)

    if (!selectedGroupId || !cutoffForm.name.trim() || !cutoffForm.startDate || !cutoffForm.endDate) {
      setMessage('Completa nombre y periodo del corte.')
      setSaving(false)
      return
    }

    const periodLedger = buildSharedGroupLedger({
      participants,
      members: groupMembers,
      expenses: groupExpenses,
      splits: groupSplits,
      settlements: groupSettlements,
      adjustments: groupAdjustments,
      from: cutoffForm.startDate,
      to: cutoffForm.endDate,
    })
    const periodSelfBalance = getSelfLedgerRow(periodLedger)?.balance ?? 0
    const closingBalance = selfRow?.balance ?? 0

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) {
      setSaving(false)
      return
    }

    const { error } = await supabase.from('shared_cutoffs').insert({
      user_id: userId,
      group_id: selectedGroupId,
      name: cutoffForm.name.trim(),
      start_date: cutoffForm.startDate,
      end_date: cutoffForm.endDate,
      opening_balance: roundMoney(closingBalance - periodSelfBalance),
      period_balance: roundMoney(periodSelfBalance),
      closing_balance: roundMoney(closingBalance),
      status: 'closed',
      action: 'carry_forward',
    })

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    setCutoffForm(createEmptyCutoffForm(appDate))
    setMessage('Corte guardado. El saldo queda arrastrado, no se liquida automáticamente.')
    await loadData()
    setSaving(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#eef3f8] px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="finance-card-strong rounded-[2rem] p-8 text-sm font-bold text-slate-500">Cargando compartidos...</div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] pb-28 md:pb-12">
      <section className="border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Gastos compartidos</p>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-5xl font-black tracking-tight">Compartidos</h1>
              <p className="mt-3 max-w-3xl text-lg font-semibold text-slate-300">
                Controla gastos pagados por alguien, cuánto corresponde a cada persona y qué queda por liquidar.
              </p>
            </div>
            <Link
              href="/movimientos/nuevo"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white px-5 py-3 text-sm font-black uppercase tracking-widest text-slate-950 transition hover:bg-emerald-50"
            >
              <PlusCircle size={18} />
              Registrar movimiento
            </Link>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto max-w-7xl px-6 -mt-8">
        {message && (
          <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
            {message}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="finance-card-strong rounded-[2rem] p-6 md:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Resumen del grupo</p>
                <h2 className="mt-2 text-3xl font-black text-slate-950">
                  {selectedGroup?.name ?? 'Crea tu primer grupo'}
                </h2>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  No modifica saldos reales. Sirve para saber quién absorbió el gasto y quién debe compensar.
                </p>
              </div>

              {groups.length > 0 && (
                <select
                  value={selectedGroupId}
                  onChange={(event) => setSelectedGroupId(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950"
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <SummaryCard
                icon={<Scale size={22} />}
                label={describeSelfBalance(selfRow?.balance ?? 0)}
                value={formatMoney(Math.abs(selfRow?.balance ?? 0))}
                valueClassName={balanceClassName(selfRow?.balance ?? 0)}
              />
              <SummaryCard icon={<ReceiptText size={22} />} label="Gastos compartidos" value={formatMoney(totalShared)} />
              <SummaryCard icon={<HandCoins size={22} />} label="Liquidado/anotado" value={formatMoney(totalSettled)} />
              <SummaryCard icon={<UsersRound size={22} />} label="Personas" value={String(groupParticipants.length)} />
            </div>

            {ledger.length > 0 && (
              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {ledger.map((row) => (
                  <div key={row.participantId} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-black text-slate-950">{row.participantName}</h3>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                          {row.isSelf ? 'Tu posición' : 'Contraparte'}
                        </p>
                      </div>
                      <span className={`text-lg font-black ${balanceClassName(row.balance)}`}>
                        {formatMoney(Math.abs(row.balance))}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-bold text-slate-600">
                      <span>Pagó {formatMoney(row.paid)}</span>
                      <span>Le toca {formatMoney(row.owed)}</span>
                      <span>Liquidó {formatMoney(row.settlementsPaid)}</span>
                      <span>Recibió {formatMoney(row.settlementsReceived)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="finance-card-strong rounded-[2rem] p-6 md:p-8">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <UsersRound size={22} />
              </span>
              <div>
                <h2 className="text-2xl font-black text-slate-950">Nuevo grupo</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Ejemplo: Renta, viaje, comida o gastos de casa.</p>
              </div>
            </div>
            <form onSubmit={onCreateGroup} className="mt-6 grid gap-4">
              <Field label="Nombre del grupo">
                <input
                  value={groupForm.name}
                  onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))}
                  className="input"
                  placeholder="Renta casa"
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Tú">
                  <input
                    value={groupForm.selfName}
                    onChange={(event) => setGroupForm((current) => ({ ...current, selfName: event.target.value }))}
                    className="input"
                  />
                </Field>
                <Field label="Otra persona">
                  <input
                    value={groupForm.otherName}
                    onChange={(event) => setGroupForm((current) => ({ ...current, otherName: event.target.value }))}
                    className="input"
                    placeholder="Nombre"
                  />
                </Field>
              </div>
              <Field label="Tu porcentaje base">
                <input
                  value={groupForm.selfPercentage}
                  onChange={(event) => setGroupForm((current) => ({ ...current, selfPercentage: event.target.value }))}
                  className="input"
                  inputMode="decimal"
                />
              </Field>
              <button disabled={saving} className="btn-primary">
                Crear grupo
              </button>
            </form>
          </section>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_0.85fr]">
          <section className="finance-card-strong rounded-[2rem] p-6 md:p-8">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <ReceiptText size={22} />
              </span>
              <div>
                <h2 className="text-2xl font-black text-slate-950">Marcar gasto como compartido</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Vincula un movimiento ya registrado. Así evitas duplicar saldos.
                </p>
              </div>
            </div>
            <form onSubmit={onCreateExpense} className="mt-6 grid gap-4">
              <Field label="Movimiento existente">
                <select
                  value={expenseForm.transactionId}
                  onChange={(event) => onSelectTransaction(event.target.value)}
                  className="input"
                >
                  <option value="">Sin vincular / capturar manual</option>
                  {transactions.map((transaction) => (
                    <option key={transaction.id} value={transaction.id}>
                      {formatDate(transaction.transaction_date)} · {transaction.description || friendlyTransactionType(transaction.transaction_type)} ·{' '}
                      {formatMoney(Number(transaction.amount || 0))}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Concepto">
                  <input
                    value={expenseForm.description}
                    onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))}
                    className="input"
                    placeholder="Super, renta, cena..."
                  />
                </Field>
                <Field label="Monto">
                  <input
                    value={expenseForm.amount}
                    onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))}
                    className="input"
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Fecha">
                  <input
                    value={expenseForm.expenseDate}
                    onChange={(event) => setExpenseForm((current) => ({ ...current, expenseDate: event.target.value }))}
                    className="input"
                    type="date"
                  />
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Pagó">
                  <select
                    value={expenseForm.paidByParticipantId}
                    onChange={(event) => setExpenseForm((current) => ({ ...current, paidByParticipantId: event.target.value }))}
                    className="input"
                  >
                    <option value="">Selecciona</option>
                    {groupParticipants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tu porcentaje">
                  <input
                    value={expenseForm.selfPercentage}
                    onChange={(event) => setExpenseForm((current) => ({ ...current, selfPercentage: event.target.value }))}
                    className="input"
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Categoría">
                  <select
                    value={expenseForm.categoryId}
                    onChange={(event) => setExpenseForm((current) => ({ ...current, categoryId: event.target.value }))}
                    className="input"
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <button disabled={saving || !selectedGroupId} className="btn-primary">
                Registrar compartido
              </button>
            </form>
          </section>

          <section className="finance-card-strong rounded-[2rem] p-6 md:p-8">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <ArrowRightLeft size={22} />
              </span>
              <div>
                <h2 className="text-2xl font-black text-slate-950">Liquidación</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Anota que alguien pagó su parte. No crea movimiento en cuentas.
                </p>
              </div>
            </div>
            <form onSubmit={onCreateSettlement} className="mt-6 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="De">
                  <select
                    value={settlementForm.fromParticipantId}
                    onChange={(event) => setSettlementForm((current) => ({ ...current, fromParticipantId: event.target.value }))}
                    className="input"
                  >
                    <option value="">Selecciona</option>
                    {groupParticipants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Para">
                  <select
                    value={settlementForm.toParticipantId}
                    onChange={(event) => setSettlementForm((current) => ({ ...current, toParticipantId: event.target.value }))}
                    className="input"
                  >
                    <option value="">Selecciona</option>
                    {groupParticipants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Monto">
                  <input
                    value={settlementForm.amount}
                    onChange={(event) => setSettlementForm((current) => ({ ...current, amount: event.target.value }))}
                    className="input"
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Fecha">
                  <input
                    value={settlementForm.settlementDate}
                    onChange={(event) => setSettlementForm((current) => ({ ...current, settlementDate: event.target.value }))}
                    className="input"
                    type="date"
                  />
                </Field>
              </div>
              <Field label="Nota">
                <input
                  value={settlementForm.notes}
                  onChange={(event) => setSettlementForm((current) => ({ ...current, notes: event.target.value }))}
                  className="input"
                  placeholder="Transferencia, efectivo, pendiente..."
                />
              </Field>
              <button disabled={saving || !selectedGroupId} className="btn-primary">
                Anotar liquidación
              </button>
            </form>
          </section>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="finance-card-strong rounded-[2rem] overflow-hidden">
            <div className="border-b border-slate-100 p-6 md:p-8">
              <h2 className="text-2xl font-black text-slate-950">Actividad compartida</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                El impacto mostrado es solo entre participantes, no contra tus cuentas reales.
              </p>
            </div>
            <div>
              {latestExpenses.length === 0 ? (
                <div className="p-8 text-sm font-bold text-slate-500">Aún no hay gastos compartidos en este grupo.</div>
              ) : (
                latestExpenses.map((expense) => {
                  const expenseSplits = groupSplits.filter((split) => split.shared_expense_id === expense.id)
                  const impact = expenseSelfImpact(expense, expenseSplits, selfParticipantId)

                  return (
                    <div key={expense.id} className="grid gap-4 border-b border-slate-100 p-6 md:grid-cols-[1fr_auto]">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{formatDate(expense.expense_date)}</p>
                        <h3 className="mt-2 text-xl font-black text-slate-950">{expense.description}</h3>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          Pagó {participantName(participants, expense.paid_by_participant_id)} · Total {formatMoney(Number(expense.total_amount || 0))}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {expenseSplits.map((split) => (
                            <span key={split.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                              {participantName(participants, split.participant_id)} {formatMoney(Number(split.amount_owed || 0))}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-black ${balanceClassName(impact)}`}>
                          {impact > 0 ? '+' : impact < 0 ? '-' : ''}
                          {formatMoney(Math.abs(impact))}
                        </p>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                          {impact > 0 ? 'A tu favor' : impact < 0 ? 'Por cubrir' : 'Sin efecto'}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section className="finance-card-strong rounded-[2rem] p-6 md:p-8">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <CheckCircle2 size={22} />
              </span>
              <div>
                <h2 className="text-2xl font-black text-slate-950">Cortes</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Cierra un periodo y arrastra el saldo si no se liquida.</p>
              </div>
            </div>
            <form onSubmit={onCreateCutoff} className="mt-6 grid gap-4">
              <Field label="Nombre">
                <input
                  value={cutoffForm.name}
                  onChange={(event) => setCutoffForm((current) => ({ ...current, name: event.target.value }))}
                  className="input"
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Inicio">
                  <input
                    value={cutoffForm.startDate}
                    onChange={(event) => setCutoffForm((current) => ({ ...current, startDate: event.target.value }))}
                    className="input"
                    type="date"
                  />
                </Field>
                <Field label="Fin">
                  <input
                    value={cutoffForm.endDate}
                    onChange={(event) => setCutoffForm((current) => ({ ...current, endDate: event.target.value }))}
                    className="input"
                    type="date"
                  />
                </Field>
              </div>
              <button disabled={saving || !selectedGroupId} className="btn-primary">
                Guardar corte
              </button>
            </form>

            <div className="mt-6 space-y-3">
              {groupCutoffs.map((cutoff) => (
                <div key={cutoff.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <h3 className="font-black text-slate-950">{cutoff.name}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {formatDate(cutoff.start_date)} - {formatDate(cutoff.end_date)}
                  </p>
                  <p className={`mt-2 text-lg font-black ${balanceClassName(Number(cutoff.closing_balance || 0))}`}>
                    Cierre {formatMoney(Math.abs(Number(cutoff.closing_balance || 0)))}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{label}</span>
      {children}
    </label>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  valueClassName = 'text-slate-950',
}: {
  icon: React.ReactNode
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm shadow-slate-900/5">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">{icon}</span>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-black ${valueClassName}`}>{value}</p>
    </div>
  )
}
