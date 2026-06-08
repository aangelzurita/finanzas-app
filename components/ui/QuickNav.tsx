import Link from 'next/link'

const quickLinks = [
  { href: '/cuentas', label: 'Cuentas', hint: 'Saldos' },
  { href: '/movimientos', label: 'Movimientos', hint: 'Registro' },
  { href: '/tarjetas', label: 'Tarjetas', hint: 'Crédito' },
  { href: '/deudas', label: 'Deudas', hint: 'Pagos' },
  { href: '/flujo', label: 'Flujo', hint: 'Proyección' },
  { href: '/ingresos', label: 'Ingresos', hint: 'Esperados' },
  { href: '/recurrentes', label: 'Recurrentes', hint: 'Fijos' },
  { href: '/recordatorios', label: 'Recordatorios', hint: 'Alertas' },
  { href: '/presupuesto', label: 'Presupuesto', hint: 'Control' },
]

export function QuickNav() {
  return (
    <nav className="finance-card-strong finance-scrollbar mb-8 overflow-x-auto rounded-[2rem] p-2">
      <div className="flex min-w-max gap-2 lg:grid lg:min-w-0 lg:grid-cols-9">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group rounded-[1.35rem] border border-transparent bg-white/70 px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-slate-200 hover:bg-slate-950 hover:text-white active:scale-95"
          >
            <span className="block leading-tight">{link.label}</span>
            <span className="mt-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-300">
              {link.hint}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
