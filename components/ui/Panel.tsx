/**
 * Contenedor estándar para secciones del dashboard
 */

interface PanelProps {
    title: string
    subtitle?: string
    children: React.ReactNode
    className?: string
}

export function Panel({
    title,
    subtitle,
    children,
    className = "",
}: PanelProps) {
    return (
        <div className={`finance-card finance-soft-pop rounded-[2rem] p-5 sm:p-6 ${className}`}>
            <div className="mb-5 flex flex-col gap-1">
                <h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2>
                {subtitle && <p className="max-w-3xl text-sm font-medium leading-relaxed text-slate-500">{subtitle}</p>}
            </div>
            {children}
        </div>
    )
}
