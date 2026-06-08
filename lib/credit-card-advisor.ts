export type CreditCardAdvisorInput = {
  id: string
  name: string
  statement_cutoff_day: number
  payment_due_day: number
  credit_limit: number
  current_balance: number
  minimum_payment: number
  no_interest_payment: number
}

export type CardAdvisorResult = {
  cardId: string
  cardName: string
  estimatedCutoffDate: Date
  estimatedPaymentDueDate: Date
  daysUntilCutoff: number
  daysUntilPayment: number
  financingDaysIfUsedToday: number
  currentBalance: number
  availableCredit: number
  utilizationRate: number
  nextPaymentAmount: number
  riskLevel: 'low' | 'medium' | 'high'
  recommendation: 'best' | 'usable' | 'avoid'
  score: number
  reasons: string[]
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function safeDayForMonth(year: number, month: number, preferredDay: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return Math.min(Math.max(1, preferredDay), lastDay)
}

function dateForDay(year: number, month: number, preferredDay: number) {
  return new Date(year, month, safeDayForMonth(year, month, preferredDay))
}

function daysBetween(from: Date, to: Date) {
  const start = startOfDay(from)
  const end = startOfDay(to)
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

function nextDateForDay(referenceDate: Date, preferredDay: number) {
  const today = startOfDay(referenceDate)
  let candidate = dateForDay(today.getFullYear(), today.getMonth(), preferredDay)

  if (candidate < today) {
    candidate = dateForDay(today.getFullYear(), today.getMonth() + 1, preferredDay)
  }

  return candidate
}

function paymentDateForCutoff(cutoffDate: Date, paymentDueDay: number) {
  const sameMonthPayment = dateForDay(cutoffDate.getFullYear(), cutoffDate.getMonth(), paymentDueDay)
  if (sameMonthPayment > cutoffDate) return sameMonthPayment
  return dateForDay(cutoffDate.getFullYear(), cutoffDate.getMonth() + 1, paymentDueDay)
}

export function isExcludedFromAdvisor(card: Pick<CreditCardAdvisorInput, 'name'>) {
  return card.name.toLowerCase().includes('liverpool')
}

export function getCardFinancingDates(
  card: Pick<CreditCardAdvisorInput, 'statement_cutoff_day' | 'payment_due_day'>,
  referenceDate = new Date()
) {
  const today = startOfDay(referenceDate)
  const estimatedCutoffDate = nextDateForDay(today, Number(card.statement_cutoff_day || 1))
  const estimatedPaymentDueDate = paymentDateForCutoff(estimatedCutoffDate, Number(card.payment_due_day || 1))

  return {
    estimatedCutoffDate,
    estimatedPaymentDueDate,
    daysUntilCutoff: daysBetween(today, estimatedCutoffDate),
    daysUntilPayment: daysBetween(today, nextDateForDay(today, Number(card.payment_due_day || 1))),
    financingDaysIfUsedToday: daysBetween(today, estimatedPaymentDueDate),
  }
}

function buildRiskLevel(args: {
  utilizationRate: number
  availableCredit: number
  creditLimit: number
  daysUntilPayment: number
  nextPaymentAmount: number
}) {
  const paymentPressureRate = args.creditLimit > 0 ? args.nextPaymentAmount / args.creditLimit : 0

  if (
    args.utilizationRate >= 0.7 ||
    args.daysUntilPayment < 7 ||
    args.availableCredit <= Math.max(1000, args.creditLimit * 0.1) ||
    paymentPressureRate >= 0.25
  ) {
    return 'high' as const
  }

  if (
    args.utilizationRate >= 0.4 ||
    args.daysUntilPayment < 14 ||
    args.availableCredit <= Math.max(3000, args.creditLimit * 0.25) ||
    paymentPressureRate >= 0.12
  ) {
    return 'medium' as const
  }

  return 'low' as const
}

function scoreCard(args: {
  financingDaysIfUsedToday: number
  utilizationRate: number
  availableCredit: number
  creditLimit: number
  daysUntilPayment: number
  nextPaymentAmount: number
}) {
  let score = 0
  const reasons: string[] = []
  const availableRate = args.creditLimit > 0 ? args.availableCredit / args.creditLimit : 0
  const paymentPressureRate = args.creditLimit > 0 ? args.nextPaymentAmount / args.creditLimit : 0

  score += Math.min(55, args.financingDaysIfUsedToday)
  if (args.financingDaysIfUsedToday >= 40) reasons.push('Mayor ventana de financiamiento.')
  else if (args.financingDaysIfUsedToday >= 25) reasons.push('Buena ventana para pagar.')
  else reasons.push('Ventana de financiamiento corta.')

  if (args.utilizationRate < 0.3) {
    score += 25
    reasons.push('Baja utilización.')
  } else if (args.utilizationRate < 0.7) {
    score += 10
    reasons.push('Utilización moderada.')
  } else {
    score -= 35
    reasons.push('Utilización mayor a 70%.')
  }

  if (availableRate >= 0.5) {
    score += 20
    reasons.push('Buen disponible para absorber la compra.')
  } else if (availableRate >= 0.2) {
    score += 8
    reasons.push('Disponible aceptable.')
  } else {
    score -= 25
    reasons.push('Disponible bajo.')
  }

  if (args.daysUntilPayment >= 14) {
    score += 15
    reasons.push('Pago próximo lejano.')
  } else if (args.daysUntilPayment < 7) {
    score -= 30
    reasons.push('Pago próximo en menos de 7 días.')
  }

  if (paymentPressureRate >= 0.25) {
    score -= 25
    reasons.push('Pago para no generar intereses alto.')
  } else if (args.nextPaymentAmount <= 0) {
    score += 8
    reasons.push('Sin pago inmediato registrado.')
  }

  return { score: Math.round(score), reasons }
}

export function adviseCreditCards(
  cards: CreditCardAdvisorInput[],
  referenceDate = new Date()
): CardAdvisorResult[] {
  const results = cards
    .filter((card) => !isExcludedFromAdvisor(card))
    .map((card) => {
      const currentBalance = Math.max(0, Number(card.current_balance || 0))
      const creditLimit = Number(card.credit_limit || 0)
      const availableCredit = Math.max(0, creditLimit - currentBalance)
      const utilizationRate = creditLimit > 0 ? currentBalance / creditLimit : 1
      const nextPaymentAmount = Number(card.no_interest_payment || card.minimum_payment || 0)
      const dates = getCardFinancingDates(card, referenceDate)
      const riskLevel = buildRiskLevel({
        utilizationRate,
        availableCredit,
        creditLimit,
        daysUntilPayment: dates.daysUntilPayment,
        nextPaymentAmount,
      })
      const scored = scoreCard({
        financingDaysIfUsedToday: dates.financingDaysIfUsedToday,
        utilizationRate,
        availableCredit,
        creditLimit,
        daysUntilPayment: dates.daysUntilPayment,
        nextPaymentAmount,
      })

      const recommendation: CardAdvisorResult['recommendation'] =
        riskLevel === 'high' || scored.score < 35
          ? 'avoid'
          : scored.score >= 75
            ? 'best'
            : 'usable'

      return {
        cardId: card.id,
        cardName: card.name,
        estimatedCutoffDate: dates.estimatedCutoffDate,
        estimatedPaymentDueDate: dates.estimatedPaymentDueDate,
        daysUntilCutoff: dates.daysUntilCutoff,
        daysUntilPayment: dates.daysUntilPayment,
        financingDaysIfUsedToday: dates.financingDaysIfUsedToday,
        currentBalance,
        availableCredit,
        utilizationRate,
        nextPaymentAmount,
        riskLevel,
        recommendation,
        score: scored.score,
        reasons: scored.reasons,
      }
    })
    .sort((a, b) => b.score - a.score)

  return results.map((result, index) => ({
    ...result,
    recommendation:
      index === 0 && result.recommendation !== 'avoid'
        ? 'best'
        : result.recommendation === 'best'
          ? 'usable'
          : result.recommendation,
  }))
}
