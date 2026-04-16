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
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className={`mt-3 text-4xl font-bold tracking-tight ${valueClassName ?? 'text-slate-900'}`}>
                {value}
            </p>
            {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
        </div>
    )
}
