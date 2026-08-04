'use client'

import Link from 'next/link'
import {
  Bell,
  FolderTree,
  PiggyBank,
  Tags,
  Wallet,
} from 'lucide-react'
import { MainNavigation } from '@/components/ui/MainNavigation'

const sections = [
  {
    title: 'Cuentas',
    description: 'Saldos, cuentas externas y cuentas propias.',
    href: '/cuentas',
    icon: Wallet,
  },
  {
    title: 'Ingresos programados',
    description: 'Sueldos, bonos y entradas esperadas para proyectar flujo.',
    href: '/ingresos',
    icon: PiggyBank,
  },
  {
    title: 'Categorías',
    description: 'Clasificación de gastos e ingresos.',
    href: '/categorias',
    icon: Tags,
  },
  {
    title: 'Recordatorios',
    description: 'Alertas financieras y no financieras.',
    href: '/recordatorios',
    icon: Bell,
  },
]

export default function MasPage() {
  return (
    <main className="min-h-screen bg-[#eef3f8] pb-28 md:pb-12">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Más</p>
          <h1 className="mt-3 text-5xl font-black tracking-tight text-slate-950">Administrar la app</h1>
          <p className="mt-3 max-w-2xl text-lg font-semibold text-slate-500">
            Configuración operativa, cuentas y datos de soporte. Las acciones del día a día viven en Hoy.
          </p>
        </div>
      </section>

      <section className="relative z-20 mx-auto max-w-7xl px-6 -mt-8">
        <MainNavigation />

        <div className="finance-card-strong rounded-[2rem] p-6 md:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <FolderTree size={24} />
            </span>
            <div>
              <h2 className="text-2xl font-black text-slate-950">Módulos administrativos</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Accesos para mantener limpia la información que alimenta tus decisiones financieras.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sections.map((section) => {
              const Icon = section.icon

              return (
                <Link key={section.href} href={section.href} className="finance-hover rounded-[1.5rem] border border-slate-100 bg-white p-5">
                  <Icon size={24} className="text-slate-400" />
                  <h3 className="mt-4 text-xl font-black text-slate-950">{section.title}</h3>
                  <p className="mt-2 text-sm font-semibold text-slate-500">{section.description}</p>
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}
