/**
 * Utilidades específicas para la gestión de tarjetas de crédito
 */

export interface CardFormValues {
    name: string
    bank: string
    creditLimit: string | number
    currentBalance: string | number
    statementCutoffDay: string | number
    paymentDueDay: string | number
    minimumPayment: string | number
    noInterestPayment: string | number
    annualInterestRate: string | number
}

/**
 * Valida los campos obligatorios y rangos de una tarjeta
 */
export const validateCard = (values: CardFormValues): { ok: boolean; error?: string } => {
    if (!values.name.trim()) return { ok: false, error: 'Ingresa el nombre de la tarjeta.' }

    const limit = Number(values.creditLimit)
    if (!values.creditLimit || limit <= 0) return { ok: false, error: 'Ingresa una línea de crédito válida.' }

    const cutoff = Number(values.statementCutoffDay)
    if (!values.statementCutoffDay || cutoff < 1 || cutoff > 31) {
        return { ok: false, error: 'La fecha de corte debe estar entre 1 y 31.' }
    }

    const due = Number(values.paymentDueDay)
    if (!values.paymentDueDay || due < 1 || due > 31) {
        return { ok: false, error: 'La fecha límite de pago debe estar entre 1 y 31.' }
    }

    if (values.currentBalance && Number(values.currentBalance) < 0) {
        return { ok: false, error: 'El saldo usado no puede ser negativo.' }
    }

    if (values.minimumPayment && Number(values.minimumPayment) < 0) {
        return { ok: false, error: 'El pago mínimo no puede ser negativo.' }
    }

    if (values.noInterestPayment && Number(values.noInterestPayment) < 0) {
        return { ok: false, error: 'El pago para no generar intereses no puede ser negativo.' }
    }

    if (values.annualInterestRate && Number(values.annualInterestRate) < 0) {
        return { ok: false, error: 'La tasa anual no puede ser negativa.' }
    }

    return { ok: true }
}

/**
 * Parsea los valores del formulario a tipos numéricos para la base de datos
 */
export const parseCardData = (values: CardFormValues) => {
    return {
        name: values.name.trim(),
        bank: values.bank.trim() || null,
        statement_cutoff_day: Number(values.statementCutoffDay),
        payment_due_day: Number(values.paymentDueDay),
        annual_interest_rate: Number(values.annualInterestRate || 0),
        minimum_payment: Number(values.minimumPayment || 0),
        no_interest_payment: Number(values.noInterestPayment || 0),
        credit_limit: Number(values.creditLimit),
        current_balance: Number(values.currentBalance || 0),
    }
}
