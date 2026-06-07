export function validateDebtAmounts(values: {
  totalAmount: number
  currentBalance: number
  monthlyPayment?: number | null
}) {
  if (!Number.isFinite(values.totalAmount) || values.totalAmount <= 0) {
    return 'El monto total debe ser mayor a cero.'
  }

  if (!Number.isFinite(values.currentBalance) || values.currentBalance < 0) {
    return 'El saldo pendiente no puede ser negativo.'
  }

  if (values.currentBalance > values.totalAmount) {
    return 'El saldo pendiente no puede ser mayor al monto total.'
  }

  if (
    values.monthlyPayment !== null &&
    values.monthlyPayment !== undefined &&
    (!Number.isFinite(values.monthlyPayment) || values.monthlyPayment < 0)
  ) {
    return 'La mensualidad no puede ser negativa.'
  }

  return null
}
