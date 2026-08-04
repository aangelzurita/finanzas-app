'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarClock,
  CircleDollarSign,
  Gauge,
  MoreHorizontal,
  ReceiptText,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Hoy', hint: 'Estado actual', icon: Gauge },
  { href: '/flujo', label: 'Planificar', hint: 'Flujo futuro', icon: CalendarClock },
  { href: '/obligaciones', label: 'Obligaciones', hint: 'Pagos', icon: ReceiptText },
  { href: '/gastos', label: 'Gastos', hint: 'Fugas', icon: CircleDollarSign },
  { href: '/mas', label: 'Más', hint: 'Administrar', icon: MoreHorizontal },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MainNavigation() {
  const pathname = usePathname()

  return (
    <>
      <nav className="sticky top-3 z-40 mb-8 hidden rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-2 shadow-xl shadow-slate-900/8 backdrop-blur md:block">
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
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
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-black uppercase tracking-wide transition active:scale-95 ${
                  active
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <Icon size={18} className={active ? 'text-emerald-300' : 'text-slate-400'} />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
