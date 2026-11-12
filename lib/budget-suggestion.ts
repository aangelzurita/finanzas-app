export type BudgetSuggestionInputs = {
  average3Months: number
  average6Months: number
  average12Months: number
  futureInstallmentSpend: number
  recurringProjected: number
}

export function estimateSuggestedBudget({
  average3Months,
  average6Months,
  average12Months,
  futureInstallmentSpend,
  recurringProjected,
}: BudgetSuggestionInputs) {
  const historicalBaseline = average3Months * 0.5 + average6Months * 0.3 + average12Months * 0.2
  const baseline = Math.max(historicalBaseline, average3Months * 0.85)
  const expectedMonthlySpend = baseline + futureInstallmentSpend + recurringProjected

  return Math.max(0, Math.ceil(expectedMonthlySpend / 50) * 50)
}
