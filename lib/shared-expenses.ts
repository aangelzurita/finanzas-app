export type SharedParticipant = {
  id: string
  user_id: string
  name: string
  is_self: boolean
  status: 'active' | 'inactive'
}

export type SharedGroup = {
  id: string
  user_id: string
  name: string
  currency: string
  default_cutoff_day: number | null
  status: 'active' | 'inactive' | 'archived'
  notes: string | null
}

export type SharedGroupMember = {
  id: string
  group_id: string
  participant_id: string
  default_percentage: number
  status: 'active' | 'inactive'
}

export type SharedExpense = {
  id: string
  user_id: string
  group_id: string
  transaction_id: string | null
  category_id: string | null
  paid_by_participant_id: string
  description: string
  total_amount: number
  expense_date: string
  split_method: 'equal' | 'percentage' | 'amount'
  status: 'active' | 'void'
  notes: string | null
}

export type SharedExpenseSplit = {
  id: string
  shared_expense_id: string
  participant_id: string
  percentage: number | null
  amount_owed: number
}

export type SharedSettlement = {
  id: string
  user_id: string
  group_id: string
  cutoff_id: string | null
  from_participant_id: string
  to_participant_id: string
  amount: number
  settlement_date: string
  account_id: string | null
  transaction_id: string | null
  affects_cash: boolean
  notes: string | null
}

export type SharedCutoff = {
  id: string
  user_id: string
  group_id: string
  name: string
  start_date: string
  end_date: string
  opening_balance: number
  period_balance: number
  closing_balance: number
  status: 'draft' | 'closed' | 'carried' | 'paid' | 'canceled'
  action: 'carry_forward' | 'paid' | 'partial' | 'forgiven'
  notes: string | null
}

export type SharedAdjustment = {
  id: string
  user_id: string
  group_id: string
  cutoff_id: string | null
  participant_id: string
  adjustment_type: 'forgiveness' | 'manual'
  amount_signed: number
  adjustment_date: string
  notes: string | null
}

export type SharedLedgerRow = {
  participantId: string
  participantName: string
  isSelf: boolean
  paid: number
  owed: number
  settlementsPaid: number
  settlementsReceived: number
  adjustments: number
  balance: number
}

export type SharedLedgerInput = {
  participants: SharedParticipant[]
  members: SharedGroupMember[]
  expenses: SharedExpense[]
  splits: SharedExpenseSplit[]
  settlements: SharedSettlement[]
  adjustments: SharedAdjustment[]
  from?: string
  to?: string
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function inRange(date: string, from?: string, to?: string) {
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

export function buildSharedGroupLedger(input: SharedLedgerInput) {
  const participantMap = new Map(input.participants.map((participant) => [participant.id, participant]))
  const expenseSplits = new Map<string, SharedExpenseSplit[]>()

  input.splits.forEach((split) => {
    const existing = expenseSplits.get(split.shared_expense_id) ?? []
    existing.push(split)
    expenseSplits.set(split.shared_expense_id, existing)
  })

  const ledger = new Map<string, SharedLedgerRow>()

  input.members
    .filter((member) => member.status === 'active')
    .forEach((member) => {
      const participant = participantMap.get(member.participant_id)
      if (!participant) return

      ledger.set(member.participant_id, {
        participantId: member.participant_id,
        participantName: participant.name,
        isSelf: participant.is_self,
        paid: 0,
        owed: 0,
        settlementsPaid: 0,
        settlementsReceived: 0,
        adjustments: 0,
        balance: 0,
      })
    })

  input.expenses
    .filter((expense) => expense.status === 'active' && inRange(expense.expense_date, input.from, input.to))
    .forEach((expense) => {
      const payer = ledger.get(expense.paid_by_participant_id)
      if (payer) payer.paid = roundMoney(payer.paid + Number(expense.total_amount || 0))

      ;(expenseSplits.get(expense.id) ?? []).forEach((split) => {
        const row = ledger.get(split.participant_id)
        if (row) row.owed = roundMoney(row.owed + Number(split.amount_owed || 0))
      })
    })

  input.settlements
    .filter((settlement) => inRange(settlement.settlement_date, input.from, input.to))
    .forEach((settlement) => {
      const fromRow = ledger.get(settlement.from_participant_id)
      const toRow = ledger.get(settlement.to_participant_id)
      const amount = Number(settlement.amount || 0)

      if (fromRow) fromRow.settlementsPaid = roundMoney(fromRow.settlementsPaid + amount)
      if (toRow) toRow.settlementsReceived = roundMoney(toRow.settlementsReceived + amount)
    })

  input.adjustments
    .filter((adjustment) => inRange(adjustment.adjustment_date, input.from, input.to))
    .forEach((adjustment) => {
      const row = ledger.get(adjustment.participant_id)
      if (row) row.adjustments = roundMoney(row.adjustments + Number(adjustment.amount_signed || 0))
    })

  return Array.from(ledger.values()).map((row) => ({
    ...row,
    balance: roundMoney(row.paid - row.owed + row.settlementsPaid - row.settlementsReceived + row.adjustments),
  }))
}

export function getSelfLedgerRow(rows: SharedLedgerRow[]) {
  return rows.find((row) => row.isSelf) ?? null
}

export function describeSelfBalance(balance: number) {
  const rounded = roundMoney(balance)
  if (rounded > 0) return 'Te deben'
  if (rounded < 0) return 'Debes'
  return 'Están a mano'
}

export function validateSplitTotal(total: number, splitAmounts: number[]) {
  return Math.abs(roundMoney(splitAmounts.reduce((acc, value) => acc + value, 0)) - roundMoney(total)) <= 0.01
}
