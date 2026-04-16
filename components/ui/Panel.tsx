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
        <div className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
            <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-900">{title}</h2>
                {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
            </div>
            {children}
        </div>
    )
}
