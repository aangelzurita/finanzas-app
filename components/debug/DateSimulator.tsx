'use client'

import { useState } from 'react'
import { clearSimulatedDate, getAppDate, getSimulatedDate, setSimulatedDate } from '@/lib/app-date'

export function DateSimulator() {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV
  const canSimulateDate = appEnv === 'local' || appEnv === 'staging'
  const initialSimulatedDate = getSimulatedDate()
  const [value, setValue] = useState(() => initialSimulatedDate?.slice(0, 10) || '')
  const [enabled, setEnabled] = useState(() => Boolean(initialSimulatedDate))

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

  const currentAppDate = getAppDate()

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
              setValue(e.target.value)
              setEnabled(Boolean(e.target.value))
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
