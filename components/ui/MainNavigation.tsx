'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CreditCard,
  CalendarClock,
  Gauge,
  MoreHorizontal,
  ReceiptText,
  Wallet,
  CircleDollarSign,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Hoy', mobileLabel: 'Hoy', icon: Gauge },
  { href: '/movimientos', label: 'Movimientos', mobileLabel: 'Movs.', icon: ReceiptText },
  { href: '/cuentas', label: 'Cuentas', mobileLabel: 'Ctas.', icon: Wallet },
  { href: '/tarjetas', label: 'Tarjetas', mobileLabel: 'TDC', icon: CreditCard },
  { href: '/flujo', label: 'Planificar', mobileLabel: 'Plan', icon: CalendarClock },
  { href: '/gastos', label: 'Gastos', mobileLabel: 'Gastos', icon: CircleDollarSign },
  { href: '/mas', label: 'Más', mobileLabel: 'Más', icon: MoreHorizontal },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  if (href === '/mas') {
    const administrativeRoutes = [
      '/ingresos',
      '/categorias',
      '/recordatorios',
      '/compartidos',
      '/diagnostico',
      '/obligaciones',
      '/presupuesto',
      '/deudas',
      '/recurrentes',
    ]

    return pathname === href || administrativeRoutes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    )
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MainNavigation({ global = false }: { global?: boolean }) {
  const pathname = usePathname()

  if (global && pathname === '/') return null

  return (
    <>
      <nav className="sticky top-3 z-40 mb-8 hidden rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-2 shadow-xl shadow-slate-900/8 backdrop-blur md:block">
        <div className="grid grid-cols-7 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`group flex items-center justify-center gap-3 rounded-[1.1rem] px-3 py-3 text-center transition active:scale-95 lg:justify-start lg:px-4 ${
                  active
                    ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <Icon size={19} className={active ? 'text-emerald-300' : 'text-slate-400 group-hover:text-slate-950'} />
                <span className="text-xs font-black uppercase tracking-widest lg:text-sm lg:normal-case lg:tracking-tight">
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-2xl shadow-slate-950/15 backdrop-blur md:hidden">
        <div className="grid grid-cols-7 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-black uppercase tracking-wide transition active:scale-95 ${
                  active
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <Icon size={18} className={active ? 'text-emerald-300' : 'text-slate-400'} />
                <span className="max-w-full truncate">{item.mobileLabel}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
