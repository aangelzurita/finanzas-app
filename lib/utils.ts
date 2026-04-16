/**
 * Utilidades compartidas para la aplicación de finanzas
 */

export const formatMoney = (value: number) =>
    value.toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 2,
    })

export const formatDate = (value: string) =>
    new Date(value).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })

export const formatDateTime = (value: string) =>
    new Date(value).toLocaleString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })

export const daysUntilDayOfMonth = (day: number) => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    let target = new Date(currentYear, currentMonth, day)

    if (target < now) {
        target = new Date(currentYear, currentMonth + 1, day)
    }

    const diff = target.getTime() - now.getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export const friendlyAccountType = (type: string) => {
    const map: Record<string, string> = {
        cash: 'Efectivo',
        debit: 'Débito',
        savings: 'Ahorro',
        investment: 'Inversión',
        credit_card: 'Tarjeta de crédito',
    }
    return map[type] || type
}

export const friendlyTransactionType = (type: string) => {
    const map: Record<string, string> = {
        income: 'Ingreso',
        expense: 'Gasto',
        transfer: 'Transferencia',
        credit_card_purchase: 'Compra con TDC',
        credit_card_payment: 'Pago de TDC',
        debt_payment: 'Pago de deuda',
    }
    return map[type] || type
}
export const friendlyFrequency = (freq: string) => {
    const map: Record<string, string> = {
        weekly: 'Semanal',
        biweekly: 'Quincenal',
        monthly: 'Mensual',
        quarterly: 'Trimestral',
        yearly: 'Anual',
    }
    return map[freq] || freq
}
