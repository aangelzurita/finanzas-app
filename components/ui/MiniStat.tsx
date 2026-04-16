/**
 * Componente para mostrar estadísticas pequeñas en una cuadrícula
 */

interface MiniStatProps {
    label: string
    value: string
    subvalue?: string
    valueClassName?: string
}

export function MiniStat({
    label,
    value,
    subvalue,
    valueClassName = 'text-slate-900',
}: MiniStatProps) {
    return (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</p>
            <p className={`font-bold ${valueClassName}`}>{value}</p>
            {subvalue && <p className="text-xs text-slate-500 mt-1">{subvalue}</p>}
        </div>
    )
}
