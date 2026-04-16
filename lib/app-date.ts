const STORAGE_KEY = 'finanzas_app_simulated_date'

export function getSimulatedDate(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STORAGE_KEY)
}

export function setSimulatedDate(date: string | null) {
  if (typeof window === 'undefined') return
  if (!date) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, date)
}

export function getAppDate(): Date {
  if (typeof window === 'undefined') {
    return new Date()
  }

  const simulated = getSimulatedDate()
  if (!simulated) return new Date()

  const parsed = new Date(simulated)
  if (Number.isNaN(parsed.getTime())) return new Date()

  return parsed
}

export function getAppTodayISO(): string {
  return getAppDate().toISOString().slice(0, 10)
}
