import assert from 'node:assert/strict'
import { test } from 'node:test'
import { estimateSuggestedBudget } from '../../lib/budget-suggestion.ts'

test('weights recent, medium, and annual spending history, then rounds up to $50', () => {
  const suggestion = estimateSuggestedBudget({
    average3Months: 300,
    average6Months: 250,
    average12Months: 175,
    futureInstallmentSpend: 0,
    recurringProjected: 0,
  })

  assert.equal(suggestion, 300)
})

test('adds upcoming MSI and recurring commitments before rounding', () => {
  const suggestion = estimateSuggestedBudget({
    average3Months: 100,
    average6Months: 100,
    average12Months: 100,
    futureInstallmentSpend: 49,
    recurringProjected: 26,
  })

  assert.equal(suggestion, 200)
})
