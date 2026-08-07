'use client'

import { useState, useSyncExternalStore } from 'react'
import { clearSimulatedDate, getSimulatedDate, setSimulatedDate } from '@/lib/app-date'

function subscribeToSimulatedDate(callback: () => void) {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

function getServerSimulatedDateSnapshot() {
  return null
}

export function DateSimulator() {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV
  const canSimulateDate = appEnv === 'local' || appEnv === 'staging'
  const simulatedDate = useSyncExternalStore(
    subscribeToSimulatedDate,
    getSimulatedDate,
    getServerSimulatedDateSnapshot
  )
  const [draftValue, setDraftValue] = useState<string | null>(null)
  const value = draftValue ?? simulatedDate?.slice(0, 10) ?? ''
  const enabled = Boolean(value)

  if (!canSimulateDate) return null

  const handleSave = () => {
    if (!value) return
    setSimulatedDate(value)
    window.location.reload()
  }

  const handleReset = () => {
    clearSimulatedDate()
    window.location.reload()
  }

  const currentAppDate = simulatedDate ? new Date(`${simulatedDate.slice(0, 10)}T12:00:00`) : new Date()

  return (
    <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-amber-800">
            {appEnv} · modo simulación de fecha
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Fecha activa de la app: {currentAppDate.toLocaleDateString('es-MX')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="rounded-xl border border-amber-300 px-3 py-2 text-sm"
            value={value}
            onChange={(e) => {
              setDraftValue(e.target.value)
            }}
          />

          <button
            onClick={handleSave}
            disabled={!enabled}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Aplicar fecha
          </button>

          <button
            onClick={handleReset}
            className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800"
          >
            Volver a hoy
          </button>
        </div>
      </div>
    </div>
  )
}
