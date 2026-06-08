/**
 * Componente para mostrar indicadores clave (KPI)
 */

interface KpiCardProps {
    title: string
    value: string
    subtitle?: string
    valueClassName?: string
}

export function KpiCard({
    title,
    value,
    subtitle,
    valueClassName,
}: KpiCardProps) {
    return (
        <div className="finance-card finance-hover finance-soft-pop relative overflow-hidden rounded-[2rem] p-6">
            <div className="absolute right-4 top-4 h-12 w-12 rounded-full bg-slate-100/70" />
            <p className="relative text-xs font-black uppercase tracking-[0.16em] text-slate-400">{title}</p>
            <p className={`relative mt-3 text-3xl font-black tracking-tight sm:text-4xl ${valueClassName ?? 'text-slate-900'}`}>
                {value}
            </p>
            {subtitle && <p className="relative mt-3 text-sm font-semibold leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
    )
}
