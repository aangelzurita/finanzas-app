'use client'

import { useEffect, useState } from 'react'
import { getAppDate, getSimulatedDate, setSimulatedDate } from '@/lib/app-date'

export function DateSimulator() {
  const [value, setValue] = useState('')
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const simulated = getSimulatedDate()
    if (simulated) {
      setValue(simulated.slice(0, 10))
      setEnabled(true)
    }
  }, [])

  const handleSave = () => {
    if (!value) return
    const iso = new Date(`${value}T12:00:00`).toISOString()
    setSimulatedDate(iso)
    window.location.reload()
  }

  const handleReset = () => {
    setSimulatedDate(null)
    window.location.reload()
  }

  const currentAppDate = getAppDate()

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-800">Modo simulación de fecha</p>
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
