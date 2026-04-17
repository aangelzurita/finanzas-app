'use client'

import React from 'react'

interface CardFormProps {
    title: string
    subtitle: string
    submitLabel: string
    values: {
        name: string
        bank: string
        creditLimit: string
        currentBalance: string
        statementCutoffDay: string
        paymentDueDay: string
        minimumPayment: string
        noInterestPayment: string
        annualInterestRate: string
    }
    onChange: (field: string, value: string) => void
    onSave: (e: React.FormEvent) => void
    saving: boolean
    message: string
    messageType: 'error' | 'success' | ''
}

export function CardForm({
    title,
    subtitle,
    submitLabel,
    values,
    onChange,
    onSave,
    saving,
    message,
    messageType,
}: CardFormProps) {
    return (
        <form onSubmit={onSave} className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
                <p className="text-slate-500 mt-1">{subtitle}</p>
            </div>

            <div className="space-y-8">
                {/* Sección: Identificación */}
                <section>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 px-1">
                        Información de la tarjeta
                    </h3>
                    <div className="grid gap-5 md:grid-cols-2">
                        <FormField label="Nombre personalizado">
                            <input
                                className="form-input"
                                value={values.name}
                                onChange={(e) => onChange('name', e.target.value)}
                                placeholder="Ej. Mi Tarjeta Favorita"
                            />
                        </FormField>

                        <FormField label="Banco / Institución">
                            <input
                                className="form-input"
                                value={values.bank}
                                onChange={(e) => onChange('bank', e.target.value)}
                                placeholder="Ej. BBVA, Santander, Nu..."
                            />
                        </FormField>
                    </div>
                </section>

                {/* Sección: Fechas Clave */}
                <section>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 px-1">
                        Fechas y Ciclo
                    </h3>
                    <div className="grid gap-5 md:grid-cols-2">
                        <FormField label="Día de corte" helper="El día que se cierra tu estado de cuenta">
                            <input
                                type="number"
                                min="1"
                                max="31"
                                className="form-input font-mono"
                                value={values.statementCutoffDay}
                                onChange={(e) => onChange('statementCutoffDay', e.target.value)}
                                placeholder="1 al 31"
                            />
                        </FormField>

                        <FormField label="Día límite de pago" helper="Fecha máxima para pagar sin recargos">
                            <input
                                type="number"
                                min="1"
                                max="31"
                                className="form-input font-mono"
                                value={values.paymentDueDay}
                                onChange={(e) => onChange('paymentDueDay', e.target.value)}
                                placeholder="1 al 31"
                            />
                        </FormField>
                    </div>
                </section>

                {/* Sección: Montos y Límites */}
                <section>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 px-1">
                        Límites y Pagos
                    </h3>
                    <div className="grid gap-5 md:grid-cols-2">
                        <FormField label="Línea de crédito total">
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-input pl-8 font-mono"
                                    value={values.creditLimit}
                                    onChange={(e) => onChange('creditLimit', e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                        </FormField>

                        <FormField label="Saldo actual de la tarjeta" helper="Puede ser negativo si tienes saldo a favor por reembolsos o sobrepagos">
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-input pl-8 font-mono text-rose-600 focus:text-rose-700"
                                    value={values.currentBalance}
                                    onChange={(e) => onChange('currentBalance', e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                        </FormField>

                        <FormField label="Pago mínimo">
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-input pl-8 font-mono"
                                    value={values.minimumPayment}
                                    onChange={(e) => onChange('minimumPayment', e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                        </FormField>

                        <FormField label="Para no generar intereses">
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-input pl-8 font-mono text-emerald-600 focus:text-emerald-700 font-bold"
                                    value={values.noInterestPayment}
                                    onChange={(e) => onChange('noInterestPayment', e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                        </FormField>

                        <FormField label="Tasa de interés anual (%)" helper="Para cálculos informativos">
                            <input
                                type="number"
                                step="0.0001"
                                className="form-input font-mono"
                                value={values.annualInterestRate}
                                onChange={(e) => onChange('annualInterestRate', e.target.value)}
                                placeholder="0.00%"
                            />
                        </FormField>
                    </div>
                </section>
            </div>

            <div className="mt-12 flex flex-col gap-4">
                <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-2xl bg-slate-900 hover:bg-black text-white py-4 font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? 'Procesando...' : submitLabel}
                </button>

                {message && (
                    <div className={`p-4 rounded-xl text-center font-medium animate-in fade-in slide-in-from-top-2 ${messageType === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>
                        {message}
                    </div>
                )}
            </div>

            <style jsx>{`
        .form-input {
          width: 100%;
          background-color: #f8fafc;
          border: 2px solid transparent;
          border-radius: 1rem;
          padding: 0.875rem 1rem;
          font-size: 1rem;
          color: #1e293b;
          transition: all 0.2s ease;
        }
        .form-input:focus {
          outline: none;
          background-color: #ffffff;
          border-color: #0f172a;
          box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.05);
        }
        .form-input::placeholder {
          color: #94a3b8;
        }
      `}</style>
        </form>
    )
}

function FormField({
    label,
    helper,
    children,
}: {
    label: string
    helper?: string
    children: React.ReactNode
}) {
    return (
        <div className="group">
            <label className="block text-sm font-bold text-slate-700 mb-1.5 transition-colors group-focus-within:text-black">
                {label}
            </label>
            {children}
            {helper && <p className="mt-1.5 text-xs text-slate-400 font-medium">{helper}</p>}
        </div>
    )
}
