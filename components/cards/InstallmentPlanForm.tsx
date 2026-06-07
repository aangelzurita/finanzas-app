'use client'

import type React from 'react'

type InstallmentPlanValues = {
  description: string
  categoryId: string
  totalAmount: string
  monthlyAmount: string
  totalMonths: string
  currentInstallmentNumber: string
  chargeDay: string
  startDate: string
  notes: string
  status: 'active' | 'completed' | 'canceled'
}

type CategoryOption = {
  id: string
  name: string
}

interface InstallmentPlanFormProps {
  title: string
  subtitle: string
  submitLabel: string
  values: InstallmentPlanValues
  categories: CategoryOption[]
  monthlyAmountPreview: number
  totalAmountPreview: number
  remainingInstallmentsPreview: number
  onChange: (field: keyof InstallmentPlanValues, value: string) => void
  onSubmit: (e: React.FormEvent) => void
  saving: boolean
  message: string
  messageType: 'error' | 'success' | ''
  allowStatus?: boolean
}

export function InstallmentPlanForm({
  title,
  subtitle,
  submitLabel,
  values,
  categories,
  monthlyAmountPreview,
  totalAmountPreview,
  remainingInstallmentsPreview,
  onChange,
  onSubmit,
  saving,
  message,
  messageType,
  allowStatus = false,
}: InstallmentPlanFormProps) {
  return (
    <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl">
      <div className="mb-8 border-b border-slate-100 pb-6">
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{title}</h2>
        <p className="text-slate-400 text-sm mt-1">{subtitle}</p>
        <p className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-xs font-bold text-sky-700">
          En MSI, el saldo usado de la tarjeta aumenta por el total de la compra y el presupuesto mensual se afecta por la mensualidad.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-6">
          <Field label="Descripción">
            <input
              autoFocus
              className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 placeholder:text-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
              placeholder="Ej. TV Samsung, iPhone, Laptop..."
              value={values.description}
              onChange={(e) => onChange('description', e.target.value)}
            />
          </Field>

          <Field label="Categoría">
            <select
              className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
              value={values.categoryId}
              onChange={(e) => onChange('categoryId', e.target.value)}
            >
              <option value="">Selecciona una categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Monto total" helper="Si no lo tienes, captura la mensualidad y calculamos el total.">
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 pl-10 pr-5 py-4 font-black text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                  placeholder="0.00"
                  value={values.totalAmount}
                  onChange={(e) => onChange('totalAmount', e.target.value)}
                />
              </div>
            </Field>

            <Field label="Meses totales">
              <input
                type="number"
                min="1"
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-black text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                placeholder="12"
                value={values.totalMonths}
                onChange={(e) => onChange('totalMonths', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Mensualidad">
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 pl-10 pr-5 py-4 font-black text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                  placeholder="0.00"
                  value={values.monthlyAmount}
                  onChange={(e) => onChange('monthlyAmount', e.target.value)}
                />
              </div>
            </Field>

            <Field label="Próxima mensualidad" helper="Si ya pagaste 5, aquí va 6.">
              <input
                type="number"
                min="1"
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-black text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                placeholder="1"
                value={values.currentInstallmentNumber}
                onChange={(e) => onChange('currentInstallmentNumber', e.target.value)}
              />
            </Field>

            <Field label="Día de cargo">
              <input
                type="number"
                min="1"
                max="31"
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-black text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                placeholder="15"
                value={values.chargeDay}
                onChange={(e) => onChange('chargeDay', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Fecha de inicio (opcional)" helper="Si la dejas vacía, se infiere según la próxima mensualidad.">
              <input
                type="date"
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                value={values.startDate}
                onChange={(e) => onChange('startDate', e.target.value)}
              />
            </Field>

            {allowStatus ? (
              <Field label="Estado">
                <select
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                  value={values.status}
                  onChange={(e) => onChange('status', e.target.value)}
                >
                  <option value="active">Activo</option>
                  <option value="completed">Completado</option>
                  <option value="canceled">Cancelado</option>
                </select>
              </Field>
            ) : (
              <Field label="Mensualidades pendientes">
                <div className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-black text-slate-900">
                  {remainingInstallmentsPreview}
                </div>
              </Field>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Total calculado">
              <div className="w-full rounded-2xl border-2 border-sky-100 bg-sky-50/60 px-5 py-4 font-black text-sky-700">
                ${totalAmountPreview.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </Field>

            <Field label="Mensualidad calculada">
              <div className="w-full rounded-2xl border-2 border-emerald-100 bg-emerald-50/60 px-5 py-4 font-black text-emerald-700">
                ${monthlyAmountPreview.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </Field>

            <Field label="Mensualidades pendientes">
              <div className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-black text-slate-900">
                {remainingInstallmentsPreview}
              </div>
            </Field>
          </div>

          <Field label="Notas (opcional)">
            <textarea
              rows={4}
              className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-medium text-slate-700 placeholder:text-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none transition-all resize-none"
              placeholder="Ticket, comercio, promo, referencia..."
              value={values.notes}
              onChange={(e) => onChange('notes', e.target.value)}
            />
          </Field>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-slate-900 hover:bg-black text-white py-4 font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Procesando...' : submitLabel}
          </button>
        </div>

        {message && (
          <div className={`rounded-2xl border px-5 py-4 text-sm font-medium ${messageType === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {message}
          </div>
        )}
      </form>
    </div>
  )
}

function Field({
  label,
  helper,
  children,
}: {
  label: string
  helper?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-2">{label}</label>
      {children}
      {helper ? <p className="mt-2 text-xs text-slate-400">{helper}</p> : null}
    </div>
  )
}
