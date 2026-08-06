const STORAGE_KEY = 'finanzas_app_simulated_date'

function parseDateOnly(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`)
}

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime())
}

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

export function clearSimulatedDate() {
  setSimulatedDate(null)
}

export function isUsingSimulatedDate() {
  return Boolean(getSimulatedDate())
}

export function getAppDate(): Date {
  if (typeof window === 'undefined') {
    return new Date()
  }

  const simulated = getSimulatedDate()
  if (!simulated) return new Date()

  const parsed = parseDateOnly(simulated)
  if (!isValidDate(parsed)) return new Date()

  return parsed
}

export function getAppTodayISO(): string {
  return getAppDate().toISOString().slice(0, 10)
}
