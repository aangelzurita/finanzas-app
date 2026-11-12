import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calculateDefaultFirstInstallmentChargeDate,
  getInstallmentAmount,
  getInstallmentChargeDate,
  getPendingInstallmentAmount,
  validateInstallmentAmountSchedule,
} from '../../lib/credit-card-installments.ts'

test('defaults the first MSI charge to the purchase date, not the card due date', () => {
  assert.equal(
    calculateDefaultFirstInstallmentChargeDate('2026-08-24T11:00'),
    '2026-08-24'
  )
})

test('keeps the monthly charge day and clamps it in shorter months', () => {
  const plan = {
    start_date: '2026-01-31',
    charge_day: 31,
  }

  const februaryCharge = getInstallmentChargeDate(plan, 2)
  assert.equal(februaryCharge.getFullYear(), 2026)
  assert.equal(februaryCharge.getMonth(), 1)
  assert.equal(februaryCharge.getDate(), 28)
})

test('adjusts the final charge so installment amounts equal the purchase total', () => {
  const beautyTech = {
    total_amount: 5990,
    monthly_amount: 1996.67,
    total_months: 3,
  }
  const tapetes = {
    total_amount: 796.24,
    monthly_amount: 265.41,
    total_months: 3,
  }

  assert.equal(getInstallmentAmount(beautyTech, 3), 1996.66)
  assert.equal(getInstallmentAmount(tapetes, 3), 265.42)
  assert.equal(validateInstallmentAmountSchedule(2307.63, 384.61, 6), null)
  assert.notEqual(validateInstallmentAmountSchedule(2307.63, 380, 6), null)
  assert.equal(
    [1, 2, 3].reduce((sum, number) => sum + getInstallmentAmount(beautyTech, number), 0),
    5990
  )
})

test('calculates pending amounts using the adjusted final installment', () => {
  const plan = {
    status: 'active',
    total_amount: 5990,
    monthly_amount: 1996.67,
    total_months: 3,
    current_installment_number: 3,
    remaining_installments: 1,
    last_processed_installment_number: 2,
    start_date: '2026-08-24',
    charge_day: 24,
  }

  assert.equal(getPendingInstallmentAmount(plan, new Date(2026, 9, 25)), 1996.66)
  assert.equal(getPendingInstallmentAmount({ ...plan, status: 'completed' }, new Date(2026, 9, 25)), 0)
})
