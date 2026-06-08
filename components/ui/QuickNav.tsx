import Link from 'next/link'

const quickLinks = [
  { href: '/cuentas', label: 'Cuentas' },
  { href: '/movimientos', label: 'Movimientos' },
  { href: '/tarjetas', label: 'Tarjetas' },
  { href: '/deudas', label: 'Deudas' },
  { href: '/flujo', label: 'Flujo' },
  { href: '/ingresos', label: 'Ingresos' },
  { href: '/recurrentes', label: 'Recurrentes' },
  { href: '/recordatorios', label: 'Recordatorios' },
  { href: '/presupuesto', label: 'Presupuesto' },
]

export function QuickNav() {
  return (
    <nav className="mb-8 overflow-x-auto rounded-[2rem] border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex min-w-max gap-2">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-950 hover:text-white active:scale-95"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
