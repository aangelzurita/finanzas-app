import type { SupabaseClient } from '@supabase/supabase-js'

export async function syncRecurringReminders(
    supabase: SupabaseClient,
    userId: string,
    chargeId: string
) {
    // Get the recurring charge details
    const { data: charge, error: chargeError } = await supabase
        .from('recurring_charges')
        .select('*')
        .eq('id', chargeId)
        .single()

    if (chargeError || !charge) {
        throw new Error(`Cargo no encontrado: ${chargeError?.message || 'Sin datos'}`)
    }

    if (!charge.create_reminder || !charge.is_active) {
        // If it shouldn't have a reminder or is inactive, remove any existing reminder
        await supabase
            .from('reminders')
            .delete()
            .eq('user_id', userId)
            .eq('related_entity_type', 'recurring_charge')
            .eq('related_entity_id', chargeId)
        return
    }

    // Use maybeSingle to avoid throw on 0 rows
    const { data: existing, error: existingError } = await supabase
        .from('reminders')
        .select('id')
        .eq('user_id', userId)
        .eq('related_entity_type', 'recurring_charge')
        .eq('related_entity_id', chargeId)
        .maybeSingle()

    if (existingError) {
        throw new Error(`Error buscando recordatorio existente: ${existingError.message}`)
    }

    const reminderData = {
        user_id: userId,
        title: charge.name,
        reminder_type: 'subscription',
        related_entity_type: 'recurring_charge',
        related_entity_id: chargeId,
        due_date: charge.next_charge_date,
        amount: charge.amount,
        frequency: charge.frequency,
        status: 'pending',
        notes: charge.description || `Pago recurrente de ${charge.name}`,
        notify_email: true,
        notify_push: false // Ensuring consistency with table expectations
    }

    if (existing) {
        const { error: updateError } = await supabase
            .from('reminders')
            .update(reminderData)
            .eq('id', existing.id)
        if (updateError) throw new Error(`Error actualizando recordatorio: ${updateError.message}`)
    } else {
        const { error: insertError } = await supabase
            .from('reminders')
            .insert(reminderData)
        if (insertError) throw new Error(`Error insertando recordatorio: ${insertError.message}`)
    }
}
