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
        <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-sm">
            <p className="mb-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
            <p className={`font-black tracking-tight ${valueClassName}`}>{value}</p>
            {subvalue && <p className="mt-1 text-xs font-semibold text-slate-500">{subvalue}</p>}
        </div>
    )
}
