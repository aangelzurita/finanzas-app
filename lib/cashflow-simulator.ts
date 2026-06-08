import {
  buildCashflowProjection,
  type CashflowProjectionSummary,
} from '@/lib/cashflow-projection'
import type { FinancialCalendarEvent } from '@/lib/financial-calendar'
import {
  getCardFinancingDates,
  isExcludedFromAdvisor,
  type CreditCardAdvisorInput,
} from '@/lib/credit-card-advisor'

export type SimulationType =
  | 'cash_expense'
  | 'credit_card_purchase'
  | 'installment_purchase'
  | 'debt_payment'
  | 'extra_income'

export type SimulationInput = {
  amount: number
  date: string
  type: SimulationType
  title?: string
  accountId?: string
  creditCardId?: string
  debtId?: string
  months?: number
}

export type SimulationResult = {
  baseSummary: CashflowProjectionSummary
  simulatedSummary: CashflowProjectionSummary
  impactToday: number
  impactEndBalance: number
  impactLowestBalance: number
  lowestBalanceDate: string
  warnings: string[]
  recommendation: 'safe' | 'caution' | 'avoid'
  simulatedEvents: FinancialCalendarEvent[]
}

export type SmartPurchaseCardInput = CreditCardAdvisorInput

export type SmartPurchaseCardAnalysis = {
  cardId: string
  cardName: string
  cutoffDate: string
  paymentDueDate: string
  daysUntilCutoff: number
  daysUntilPayment: number
  financingDays: number
  currentBalance: number
  balanceAfterPurchase: number
  creditLimit: number
  currentUtilizationRate: number
  utilizationAfterPurchaseRate: number
  availableCredit: number
  availableAfterPurchase: number
  currentNoInterestPayment: number
  estimatedNoInterestPaymentAfterPurchase: number
  additionalPaymentEstimate: number
  projectedEndBalance: number
  impactEndBalance: number
  futureCommitmentImpact: number
  score: number
  recommendation: 'best' | 'usable' | 'avoid'
  reasons: string[]
  simulatedEvents: FinancialCalendarEvent[]
}

export type SmartPurchaseAdvisorResult = {
  amount: number
  purchaseDate: string
  isInstallment: boolean
  months: number
  bestOption?: SmartPurchaseCardAnalysis
  cardAnalyses: SmartPurchaseCardAnalysis[]
  recommendationText: string
  msiOptions: {
    months: number
    monthlyAmount: number
    impactEndBalance: number
    projectedEndBalance: number
    futureCommitmentImpact: number
    recommendation: 'safe' | 'caution' | 'avoid'
  }[]
  warnings: string[]
}

type BuildSimulationResultInput = {
  currentBalance: number
  baseEvents: FinancialCalendarEvent[]
  projectionStartDate: string | Date
  projectionEndDate: string | Date
  simulation: SimulationInput
  cautionBuffer?: number
}

function parseDateOnly(value: string | Date) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  return new Date(`${value}T12:00:00`)
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function safeDayForMonth(year: number, month: number, preferredDay: number) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return Math.min(preferredDay, lastDay)
}

function addMonthsKeepingDay(value: Date, months: number) {
  const day = value.getDate()
  const target = new Date(value)
  target.setMonth(target.getMonth() + months)
  return new Date(target.getFullYear(), target.getMonth(), safeDayForMonth(target.getFullYear(), target.getMonth(), day))
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function buildPaymentEventsForPurchase(args: {
  card: SmartPurchaseCardInput
  amount: number
  purchaseDate: string
  isInstallment: boolean
  months: number
}): FinancialCalendarEvent[] {
  const purchaseDate = parseDateOnly(args.purchaseDate)
  const dates = getCardFinancingDates(args.card, purchaseDate)
  const firstPaymentDate = dates.estimatedPaymentDueDate

  if (!args.isInstallment) {
    return [{
      id: `smart-purchase-card-payment-${args.card.id}-${args.purchaseDate}`,
      date: formatDateOnly(firstPaymentDate),
      title: `Pago estimado por compra: ${args.card.name}`,
      amount: args.amount,
      direction: 'outflow',
      sourceType: 'credit_card_payment',
      creditCardId: args.card.id,
      confidence: 'estimated',
      affectsCash: true,
      affectsBudget: false,
      eventStatus: 'estimated',
    }]
  }

  const months = Math.max(1, Math.floor(Number(args.months || 1)))
  const monthlyAmount = roundMoney(args.amount / months)

  return Array.from({ length: months }, (_, index) => {
    const eventDate = addMonthsKeepingDay(firstPaymentDate, index)
    return {
      id: `smart-purchase-msi-${args.card.id}-${args.purchaseDate}-${index + 1}`,
      date: formatDateOnly(eventDate),
      title: `MSI simulado ${args.card.name} ${index + 1}/${months}`,
      amount: monthlyAmount,
      direction: 'outflow' as const,
      sourceType: 'installment' as const,
      creditCardId: args.card.id,
      confidence: 'estimated' as const,
      affectsCash: true,
      affectsBudget: true,
      eventStatus: 'estimated' as const,
    }
  })
}

function scorePurchaseCard(args: {
  financingDays: number
  utilizationAfterPurchaseRate: number
  availableAfterPurchase: number
  creditLimit: number
  impactEndBalance: number
  futureCommitmentImpact: number
}) {
  let score = 45
  const reasons: string[] = []
  const availableRate = args.creditLimit > 0 ? args.availableAfterPurchase / args.creditLimit : 0

  score += clamp(args.financingDays, 0, 55) * 0.55
  if (args.financingDays >= 40) reasons.push(`Te da aproximadamente ${args.financingDays} días para pagar.`)
  else if (args.financingDays >= 25) reasons.push(`Te da ${args.financingDays} días para pagar.`)
  else reasons.push(`Solo te da ${args.financingDays} días para pagar.`)

  if (args.utilizationAfterPurchaseRate < 0.15) {
    score += 18
    reasons.push('Mantiene utilización por debajo de 15%.')
  } else if (args.utilizationAfterPurchaseRate < 0.3) {
    score += 12
    reasons.push('Mantiene utilización saludable.')
  } else if (args.utilizationAfterPurchaseRate < 0.7) {
    score -= 4
    reasons.push('Deja una utilización moderada.')
  } else {
    score -= 28
    reasons.push('Deja una utilización alta.')
  }

  if (availableRate >= 0.5) {
    score += 15
    reasons.push('Conserva buen disponible restante.')
  } else if (availableRate >= 0.2) {
    score += 5
    reasons.push('Conserva disponible aceptable.')
  } else {
    score -= 22
    reasons.push('Deja poco disponible restante.')
  }

  if (args.impactEndBalance < 0) {
    score -= Math.min(20, Math.abs(args.impactEndBalance) / 1000)
    reasons.push('Reduce tu cierre proyectado cuando toque pagarse.')
  } else {
    reasons.push('No compromete significativamente tu flujo proyectado en el periodo visible.')
  }

  if (args.futureCommitmentImpact > args.creditLimit * 0.15) {
    score -= 10
    reasons.push('Aumenta de forma relevante tus compromisos futuros.')
  }

  const finalScore = clamp(Math.round(score), 0, 100)
  const recommendation = finalScore < 45 ? 'avoid' as const : finalScore >= 75 ? 'best' as const : 'usable' as const

  return { score: finalScore, recommendation, reasons }
}

function defaultTitle(input: SimulationInput) {
  if (input.title?.trim()) return input.title.trim()

  const labels: Record<SimulationType, string> = {
    cash_expense: 'Gasto simulado',
    credit_card_purchase: 'Compra con tarjeta simulada',
    installment_purchase: 'Compra MSI simulada',
    debt_payment: 'Pago extra a deuda simulado',
    extra_income: 'Ingreso extra simulado',
  }

  return labels[input.type]
}

export function buildSimulationEvents(input: SimulationInput): {
  events: FinancialCalendarEvent[]
  warnings: string[]
} {
  const warnings: string[] = []
  const amount = Number(input.amount || 0)
  const date = input.date
  const title = defaultTitle(input)

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      events: [],
      warnings: ['Ingresa un monto mayor a cero para simular.'],
    }
  }

  if (!date) {
    return {
      events: [],
      warnings: ['Elige una fecha para la simulación.'],
    }
  }

  if (input.type === 'cash_expense' || input.type === 'debt_payment') {
    return {
      events: [{
        id: `simulation-${input.type}-${date}`,
        date,
        title,
        amount,
        direction: 'outflow',
        sourceType: input.type === 'debt_payment' ? 'debt_payment' : 'transaction',
        accountId: input.accountId,
        debtId: input.type === 'debt_payment' ? input.debtId : undefined,
        confidence: 'manual',
        affectsCash: true,
        affectsBudget: input.type === 'cash_expense',
      }],
      warnings,
    }
  }

  if (input.type === 'extra_income') {
    return {
      events: [{
        id: `simulation-extra-income-${date}`,
        date,
        title,
        amount,
        direction: 'inflow',
        sourceType: 'income_schedule',
        accountId: input.accountId,
        confidence: 'manual',
        affectsCash: true,
        affectsBudget: false,
      }],
      warnings,
    }
  }

  if (input.type === 'credit_card_purchase') {
    warnings.push('Esta compra no reduce tu efectivo hoy, pero aumenta el saldo de tu tarjeta y tus compromisos futuros.')
    return {
      events: [{
        id: `simulation-credit-card-purchase-${date}`,
        date,
        title,
        amount,
        direction: 'outflow',
        sourceType: 'credit_card_payment',
        creditCardId: input.creditCardId,
        confidence: 'estimated',
        affectsCash: false,
        affectsBudget: true,
      }],
      warnings,
    }
  }

  const months = Math.max(1, Math.floor(Number(input.months || 0)))
  const monthlyAmount = roundMoney(amount / months)
  warnings.push('Esta compra no reduce tu efectivo hoy, pero aumenta el saldo de tu tarjeta y tus compromisos futuros.')
  warnings.push(`En MSI comprometería aproximadamente ${monthlyAmount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} al mes por ${months} meses.`)

  const start = parseDateOnly(date)
  return {
    events: Array.from({ length: months }, (_, index) => {
      const eventDate = addMonthsKeepingDay(start, index)
      return {
        id: `simulation-installment-${date}-${index + 1}`,
        date: formatDateOnly(eventDate),
        title: `${title} ${index + 1}/${months}`,
        amount: monthlyAmount,
        direction: 'outflow' as const,
        sourceType: 'installment' as const,
        creditCardId: input.creditCardId,
        confidence: 'estimated' as const,
        affectsCash: true,
        affectsBudget: true,
      }
    }),
    warnings,
  }
}

export function simulateCashflowDecision({
  currentBalance,
  baseEvents,
  projectionStartDate,
  projectionEndDate,
  simulation,
  cautionBuffer,
}: BuildSimulationResultInput): SimulationResult {
  const baseProjection = buildCashflowProjection({
    currentBalance,
    events: baseEvents,
    startDate: projectionStartDate,
    endDate: projectionEndDate,
    cautionBuffer,
  })
  const { events: simulatedEvents, warnings } = buildSimulationEvents(simulation)
  const simulatedProjection = buildCashflowProjection({
    currentBalance,
    events: [...baseEvents, ...simulatedEvents],
    startDate: projectionStartDate,
    endDate: projectionEndDate,
    cautionBuffer,
  })

  const today = formatDateOnly(parseDateOnly(projectionStartDate))
  const baseToday = baseProjection.points.find((point) => point.date === today)
  const simulatedToday = simulatedProjection.points.find((point) => point.date === today)
  const impactToday = roundMoney((simulatedToday?.endingBalance ?? currentBalance) - (baseToday?.endingBalance ?? currentBalance))
  const impactEndBalance = roundMoney(simulatedProjection.summary.projectedEndBalance - baseProjection.summary.projectedEndBalance)
  const impactLowestBalance = roundMoney(simulatedProjection.summary.lowestBalance - baseProjection.summary.lowestBalance)
  const cautionThreshold = Math.max(0, cautionBuffer ?? Number(currentBalance || 0) * 0.1)
  const nextWarnings = [...warnings]
  const isCardDebtSimulation =
    simulation.type === 'credit_card_purchase' ||
    simulation.type === 'installment_purchase'

  let recommendation: SimulationResult['recommendation'] = 'safe'
  if (!isCardDebtSimulation && simulatedProjection.summary.lowestBalance < 0) {
    recommendation = 'avoid'
    nextWarnings.push(`Esto te dejaría negativo el día ${simulatedProjection.summary.lowestBalanceDate}.`)
  } else if (!isCardDebtSimulation && simulatedProjection.summary.lowestBalance < cautionThreshold) {
    recommendation = 'caution'
    nextWarnings.push('Puedes hacerlo, pero tu saldo quedaría muy cerca de tu margen mínimo.')
  } else if (!isCardDebtSimulation && impactLowestBalance < 0) {
    nextWarnings.push(`Puedes hacerlo, pero tu saldo más bajo bajaría a ${simulatedProjection.summary.lowestBalance.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.`)
  }

  return {
    baseSummary: baseProjection.summary,
    simulatedSummary: simulatedProjection.summary,
    impactToday,
    impactEndBalance,
    impactLowestBalance,
    lowestBalanceDate: simulatedProjection.summary.lowestBalanceDate,
    warnings: nextWarnings,
    recommendation,
    simulatedEvents,
  }
}

export function buildSmartPurchaseAdvisor(args: {
  amount: number
  purchaseDate: string
  isInstallment: boolean
  months?: number
  cards: SmartPurchaseCardInput[]
  currentBalance: number
  baseEvents: FinancialCalendarEvent[]
  projectionStartDate: string | Date
  projectionEndDate: string | Date
  cautionBuffer?: number
}): SmartPurchaseAdvisorResult {
  const amount = Number(args.amount || 0)
  const months = Math.max(1, Math.floor(Number(args.months || 1)))
  const warnings: string[] = []

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      amount,
      purchaseDate: args.purchaseDate,
      isInstallment: args.isInstallment,
      months,
      cardAnalyses: [],
      recommendationText: 'Ingresa un monto mayor a cero para evaluar tus tarjetas.',
      msiOptions: [],
      warnings: ['Ingresa un monto mayor a cero para evaluar tus tarjetas.'],
    }
  }

  const baseProjection = buildCashflowProjection({
    currentBalance: args.currentBalance,
    events: args.baseEvents,
    startDate: args.projectionStartDate,
    endDate: args.projectionEndDate,
    cautionBuffer: args.cautionBuffer,
  })

  const eligibleCards = args.cards.filter((card) => !isExcludedFromAdvisor(card))
  if (eligibleCards.length === 0) {
    warnings.push('No hay tarjetas activas elegibles para comparar.')
  }

  const cardAnalyses = eligibleCards
    .map((card) => {
      const purchaseDate = parseDateOnly(args.purchaseDate)
      const dates = getCardFinancingDates(card, purchaseDate)
      const creditLimit = Number(card.credit_limit || 0)
      const currentBalance = Math.max(0, Number(card.current_balance || 0))
      const balanceAfterPurchase = currentBalance + amount
      const availableCredit = Math.max(0, creditLimit - currentBalance)
      const availableAfterPurchase = Math.max(0, creditLimit - balanceAfterPurchase)
      const currentUtilizationRate = creditLimit > 0 ? currentBalance / creditLimit : 1
      const utilizationAfterPurchaseRate = creditLimit > 0 ? balanceAfterPurchase / creditLimit : 1
      const currentNoInterestPayment = Number(card.no_interest_payment || card.minimum_payment || 0)
      const additionalPaymentEstimate = args.isInstallment ? roundMoney(amount / months) : amount
      const estimatedNoInterestPaymentAfterPurchase = currentNoInterestPayment + additionalPaymentEstimate
      const simulatedEvents = buildPaymentEventsForPurchase({
        card,
        amount,
        purchaseDate: args.purchaseDate,
        isInstallment: args.isInstallment,
        months,
      })
      const simulatedProjection = buildCashflowProjection({
        currentBalance: args.currentBalance,
        events: [...args.baseEvents, ...simulatedEvents],
        startDate: args.projectionStartDate,
        endDate: args.projectionEndDate,
        cautionBuffer: args.cautionBuffer,
      })
      const impactEndBalance = roundMoney(simulatedProjection.summary.projectedEndBalance - baseProjection.summary.projectedEndBalance)
      const futureCommitmentImpact = simulatedEvents.reduce((acc, event) => acc + Number(event.amount || 0), 0)
      const scored = scorePurchaseCard({
        financingDays: dates.financingDaysIfUsedToday,
        utilizationAfterPurchaseRate,
        availableAfterPurchase,
        creditLimit,
        impactEndBalance,
        futureCommitmentImpact,
      })

      if (creditLimit > 0 && balanceAfterPurchase > creditLimit) {
        scored.reasons.unshift('La compra rebasa el límite registrado.')
      }

      return {
        cardId: card.id,
        cardName: card.name,
        cutoffDate: formatDateOnly(dates.estimatedCutoffDate),
        paymentDueDate: formatDateOnly(dates.estimatedPaymentDueDate),
        daysUntilCutoff: dates.daysUntilCutoff,
        daysUntilPayment: dates.financingDaysIfUsedToday,
        financingDays: dates.financingDaysIfUsedToday,
        currentBalance,
        balanceAfterPurchase,
        creditLimit,
        currentUtilizationRate,
        utilizationAfterPurchaseRate,
        availableCredit,
        availableAfterPurchase,
        currentNoInterestPayment,
        estimatedNoInterestPaymentAfterPurchase,
        additionalPaymentEstimate,
        projectedEndBalance: simulatedProjection.summary.projectedEndBalance,
        impactEndBalance,
        futureCommitmentImpact,
        score: balanceAfterPurchase > creditLimit && creditLimit > 0 ? Math.min(scored.score, 30) : scored.score,
        recommendation: balanceAfterPurchase > creditLimit && creditLimit > 0 ? 'avoid' as const : scored.recommendation,
        reasons: scored.reasons,
        simulatedEvents,
      }
    })
    .sort((a, b) => b.score - a.score)
    .map((card, index) => ({
      ...card,
      recommendation:
        index === 0 && card.recommendation !== 'avoid'
          ? 'best' as const
          : card.recommendation === 'best'
            ? 'usable' as const
            : card.recommendation,
    }))

  const bestOption = cardAnalyses[0]
  const recommendationText = bestOption
    ? `Para esta compra de ${amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}, ${bestOption.cardName} es la mejor opción porque maximiza el tiempo de financiamiento y mantiene menor presión sobre tus líneas de crédito.`
    : 'Sin tarjetas suficientes para recomendar una opción.'

  const msiOptions = bestOption
    ? [3, 6, 9, 12].map((optionMonths) => {
      const simulatedEvents = buildPaymentEventsForPurchase({
        card: eligibleCards.find((card) => card.id === bestOption.cardId) || eligibleCards[0],
        amount,
        purchaseDate: args.purchaseDate,
        isInstallment: true,
        months: optionMonths,
      })
      const simulatedProjection = buildCashflowProjection({
        currentBalance: args.currentBalance,
        events: [...args.baseEvents, ...simulatedEvents],
        startDate: args.projectionStartDate,
        endDate: args.projectionEndDate,
        cautionBuffer: args.cautionBuffer,
      })
      const impactEndBalance = roundMoney(simulatedProjection.summary.projectedEndBalance - baseProjection.summary.projectedEndBalance)
      const monthlyAmount = roundMoney(amount / optionMonths)
      const recommendation =
        simulatedProjection.summary.lowestBalance < 0
          ? 'avoid' as const
          : simulatedProjection.summary.lowestBalance < Math.max(0, args.currentBalance * 0.1)
            ? 'caution' as const
            : 'safe' as const

      return {
        months: optionMonths,
        monthlyAmount,
        impactEndBalance,
        projectedEndBalance: simulatedProjection.summary.projectedEndBalance,
        futureCommitmentImpact: simulatedEvents.reduce((acc, event) => acc + Number(event.amount || 0), 0),
        recommendation,
      }
    })
    : []

  return {
    amount,
    purchaseDate: args.purchaseDate,
    isInstallment: args.isInstallment,
    months,
    bestOption,
    cardAnalyses,
    recommendationText,
    msiOptions,
    warnings,
  }
}
