import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateCreditCardStatementPreview } from '../../lib/credit-card-statements.ts'

test('calculates the statement balance from the prior statement, current charges, and payments', () => {
  const preview = calculateCreditCardStatementPreview({
    card: {
      current_balance: 0,
      statement_cutoff_day: 17,
      payment_due_day: 7,
    },
    transactions: [
      {
        id: 'purchase',
        transaction_type: 'credit_card_purchase',
        amount: 1000,
        transaction_date: '2026-08-05',
      },
      {
        id: 'payment',
        transaction_type: 'credit_card_payment',
        amount: 250,
        transaction_date: '2026-08-06',
      },
      {
        id: 'refund',
        transaction_type: 'credit_card_refund',
        amount: 50,
        transaction_date: '2026-08-07',
      },
    ],
    installments: [],
    cutoffDate: '2026-08-17',
    previousStatementBalance: 1200,
  })

  assert.equal(preview.previousStatementBalance, 1200)
  assert.equal(preview.payments, 250)
  assert.equal(preview.refunds, 50)
  assert.equal(preview.estimatedNoInterestPayment, 1900)
})

test('rejects a negative prior statement balance', () => {
  assert.throws(
    () => calculateCreditCardStatementPreview({
      card: {
        current_balance: 0,
        statement_cutoff_day: 17,
        payment_due_day: 7,
      },
      transactions: [],
      installments: [],
      cutoffDate: '2026-08-17',
      previousStatementBalance: -1,
    }),
    RangeError
  )
})

test('includes a UTC timestamp on its Mexico local calendar date', () => {
  const previousTimeZone = process.env.TZ
  process.env.TZ = 'America/Mexico_City'

  try {
    const preview = calculateCreditCardStatementPreview({
      card: {
        current_balance: 0,
        statement_cutoff_day: 12,
        payment_due_day: 2,
      },
      transactions: [
        {
          id: 'purchase',
          transaction_type: 'credit_card_purchase',
          amount: 100,
          transaction_date: '2026-10-12T15:00:00.000Z',
        },
        {
          id: 'payment',
          transaction_type: 'credit_card_payment',
          amount: 1000,
          transaction_date: '2026-10-13T00:28:00.000Z',
        },
      ],
      installments: [],
      cutoffDate: '2026-10-12',
      previousStatementBalance: 1000,
    })

    assert.equal(preview.payments, 1000)
    assert.equal(preview.estimatedNoInterestPayment, 100)
  } finally {
    if (previousTimeZone === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = previousTimeZone
    }
  }
})
