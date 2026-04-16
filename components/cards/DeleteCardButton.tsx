'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

interface DeleteCardButtonProps {
    cardId: string
    accountId: string
    cardName: string
}

export function DeleteCardButton({
    cardId,
    accountId,
    cardName,
}: DeleteCardButtonProps) {
    const supabase = createClient()
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async () => {
        const ok = window.confirm(
            `¿Seguro que quieres eliminar/archivar la tarjeta "${cardName}"? Se mantendrá el historial de movimientos pero ya no aparecerá en tus listas activas.`
        )

        if (!ok) return

        setDeleting(true)

        // 1. Soft delete the card
        const { error: cardError } = await supabase
            .from('credit_cards')
            .update({ is_active: false })
            .eq('id', cardId)

        if (cardError) {
            alert(`Error al archivar tarjeta: ${cardError.message}`)
            setDeleting(false)
            return
        }

        // 2. Soft delete the associated account
        const { error: accountError } = await supabase
            .from('accounts')
            .update({ is_active: false })
            .eq('id', accountId)

        if (accountError) {
            console.error('Error al archivar cuenta:', accountError.message)
        }

        // 3. Remove pending reminders for this card
        const { error: reminderError } = await supabase
            .from('reminders')
            .delete()
            .eq('related_entity_type', 'credit_card')
            .eq('related_entity_id', cardId)

        if (reminderError) {
            console.error('Error al limpiar recordatorios:', reminderError.message)
        }

        window.location.reload()
    }

    return (
        <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-2xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition disabled:opacity-60"
        >
            {deleting ? 'Eliminando...' : 'Eliminar'}
        </button>
    )
}
