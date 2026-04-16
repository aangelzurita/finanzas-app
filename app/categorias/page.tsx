'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type Category = {
    id: string
    name: string
    category_type: string
    color: string | null
    icon: string | null
    is_active: boolean
}

export default function CategoriasPage() {
    const supabase = createClient()

    const [loading, setLoading] = useState(true)
    const [categories, setCategories] = useState<Category[]>([])
    const [loadingAction, setLoadingAction] = useState(false)
    const [message, setMessage] = useState('')

    // Form states for new/edit
    const [editingId, setEditingId] = useState<string | null>(null)
    const [name, setName] = useState('')
    const [categoryType, setCategoryType] = useState('expense')

    useEffect(() => {
        void loadCategories()
    }, [])

    const loadCategories = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('is_active', true)
            .order('category_type', { ascending: false })
            .order('name')

        if (error) {
            setMessage(error.message)
        } else {
            setCategories((data as Category[]) ?? [])
        }
        setLoading(false)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        setLoadingAction(true)
        setMessage('')

        const { data: sessionData } = await supabase.auth.getSession()
        const userId = sessionData.session?.user?.id

        if (!userId) {
            setMessage('No hay sesión activa.')
            setLoadingAction(false)
            return
        }

        if (editingId) {
            const { error } = await supabase
                .from('categories')
                .update({ name: name.trim(), category_type: categoryType })
                .eq('id', editingId)

            if (error) setMessage(error.message)
            else {
                setEditingId(null)
                setName('')
                void loadCategories()
            }
        } else {
            const { error } = await supabase
                .from('categories')
                .insert({
                    user_id: userId,
                    name: name.trim(),
                    category_type: categoryType,
                    is_active: true
                })

            if (error) setMessage(error.message)
            else {
                setName('')
                void loadCategories()
            }
        }
        setLoadingAction(false)
    }

    const handleEdit = (cat: Category) => {
        setEditingId(cat.id)
        setName(cat.name)
        setCategoryType(cat.category_type)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que quieres archivar esta categoría? Los movimientos existentes se mantendrán pero ya no podrás elegirla para nuevos registros.')) return

        setLoadingAction(true)
        const { error } = await supabase
            .from('categories')
            .update({ is_active: false })
            .eq('id', id)
        if (error) setMessage(error.message)
        else void loadCategories()
        setLoadingAction(false)
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                    <p className="text-slate-600 font-medium">Cargando categorías...</p>
                </div>
            </main>
        )
    }

    return (
        <main className="min-h-screen bg-slate-100 pb-12">
            <section className="bg-slate-950 text-white">
                <div className="max-w-4xl mx-auto px-6 py-12">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <nav className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                                <Link href="/" className="hover:text-white transition">Home</Link>
                                <span>/</span>
                                <span className="text-slate-200 font-medium">Categorías</span>
                            </nav>
                            <h1 className="text-5xl font-extrabold tracking-tight">Categorías</h1>
                            <p className="text-slate-400 mt-3 text-lg">
                                Organiza tus finanzas con etiquetas personalizadas.
                            </p>
                        </div>

                        <Link
                            href="/"
                            className="rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 transition-all active:scale-95 shadow-lg"
                        >
                            Volver
                        </Link>
                    </div>
                </div>
            </section>

            <section className="max-w-4xl mx-auto px-6 -mt-8">
                <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl mb-8">
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-6">
                        {editingId ? 'Editar Categoría' : 'Nueva Categoría'}
                    </h2>

                    <form onSubmit={handleSave} className="flex flex-col gap-4 md:flex-row md:items-end">
                        <div className="flex-1">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Nombre</label>
                            <input
                                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 placeholder:text-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none transition-all"
                                placeholder="Ej. Comida, Transporte, Sueldo..."
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div className="w-full md:w-48">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Tipo</label>
                            <select
                                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-5 py-4 font-bold text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none transition-all appearance-none"
                                value={categoryType}
                                onChange={(e) => setCategoryType(e.target.value)}
                            >
                                <option value="expense">Gasto</option>
                                <option value="income">Ingreso</option>
                            </select>
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={loadingAction}
                                className="rounded-2xl bg-slate-900 px-8 py-4 font-bold text-white shadow-lg hover:bg-black transition active:scale-95 whitespace-nowrap disabled:opacity-50"
                            >
                                {editingId ? 'Guardar' : 'Agregar'}
                            </button>
                            {editingId && (
                                <button
                                    type="button"
                                    onClick={() => { setEditingId(null); setName(''); }}
                                    className="rounded-2xl border border-slate-200 px-6 py-4 font-bold text-slate-400 hover:bg-slate-50 transition active:scale-95"
                                >
                                    Cancelar
                                </button>
                            )}
                        </div>
                    </form>

                    {message && (
                        <p className="mt-4 text-sm font-bold text-rose-600">{message}</p>
                    )}
                </div>

                <div className="rounded-[2.5rem] border border-slate-100 bg-white shadow-xl overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
                        <h2 className="text-2xl font-extrabold text-slate-900">Categorías activas</h2>
                    </div>

                    <div className="divide-y divide-slate-50">
                        {categories.map((cat) => (
                            <div key={cat.id} className="px-8 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                                <div className="flex items-center gap-4">
                                    <div className={`w-3 h-3 rounded-full ${cat.category_type === 'income' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
                                    <div>
                                        <p className="font-bold text-slate-950">{cat.name}</p>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            {cat.category_type === 'income' ? 'Ingreso' : 'Gasto'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleEdit(cat)}
                                        className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
                                        title="Editar"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(cat.id)}
                                        className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                        title="Eliminar"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}

                        {categories.length === 0 && (
                            <div className="px-8 py-20 text-center text-slate-400 italic">
                                No hay categorías registradas.
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </main>
    )
}
