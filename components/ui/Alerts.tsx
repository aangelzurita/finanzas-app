/**
 * Componente para mostrar píldoras de alerta con diferentes niveles
 */

interface AlertPillProps {
    level: 'info' | 'warning' | 'danger'
    text: string
}

export function AlertPill({ level, text }: AlertPillProps) {
    const styles = {
        info: 'bg-sky-50 border-sky-200 text-sky-700',
        warning: 'bg-amber-50 border-amber-200 text-amber-700',
        danger: 'bg-rose-50 border-rose-200 text-rose-700',
    }

    return (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${styles[level]}`}>
            {text}
        </div>
    )
}

/**
 * Componente para mostrar una fila de alerta con título de tarjeta
 */

interface AlertRowProps {
    cardName: string
    text: string
    level: 'info' | 'warning' | 'danger'
}

export function AlertRow({ cardName, text, level }: AlertRowProps) {
    const styles = {
        info: 'bg-sky-50 border-sky-200 text-sky-700',
        warning: 'bg-amber-50 border-amber-200 text-amber-700',
        danger: 'bg-rose-50 border-rose-200 text-rose-700',
    }

    return (
        <div className={`rounded-2xl border px-4 py-3 ${styles[level]}`}>
            <p className="font-semibold">{cardName}</p>
            <p className="text-sm mt-1">{text}</p>
        </div>
    )
}
