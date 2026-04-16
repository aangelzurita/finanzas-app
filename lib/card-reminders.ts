import type { SupabaseClient } from '@supabase/supabase-js'

type CreditCardLite = {
  id: string
  name: string
  statement_cutoff_day: number
  payment_due_day: number
}

function nextDateForDay(day: number) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  let target = new Date(year, month, day, 9, 0, 0, 0)

  if (target <= now) {
    target = new Date(year, month + 1, day, 9, 0, 0, 0)
  }

  return target.toISOString()
}

export async function syncCardReminders(
  supabase: SupabaseClient,
  userId: string,
  cards: CreditCardLite[]
) {
  for (const card of cards) {
    const cutoffTitle = `Corte ${card.name}`
    const paymentTitle = `Pago ${card.name}`

    const cutoffDueDate = nextDateForDay(card.statement_cutoff_day)
    const paymentDueDate = nextDateForDay(card.payment_due_day)

    const { data: existingReminders, error: existingError } = await supabase
      .from('reminders')
      .select('id, title')
      .eq('user_id', userId)
      .eq('related_entity_type', 'credit_card')
      .eq('related_entity_id', card.id)

    if (existingError) {
      throw existingError
    }

    const existingCutoff = existingReminders?.find((r) => r.title === cutoffTitle)
    const existingPayment = existingReminders?.find((r) => r.title === paymentTitle)

    if (existingCutoff) {
      const { error } = await supabase
        .from('reminders')
        .update({
          due_date: cutoffDueDate,
          frequency: 'monthly',
          status: 'pending',
          notify_email: true,
          notify_push: false,
          notes: `Recordatorio automático de corte para ${card.name}`,
        })
        .eq('id', existingCutoff.id)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('reminders')
        .insert({
          user_id: userId,
          title: cutoffTitle,
          reminder_type: 'custom',
          related_entity_type: 'credit_card',
          related_entity_id: card.id,
          due_date: cutoffDueDate,
          amount: null,
          frequency: 'monthly',
          status: 'pending',
          notify_email: true,
          notify_push: false,
          notes: `Recordatorio automático de corte para ${card.name}`,
        })

      if (error) throw error
    }

    if (existingPayment) {
      const { error } = await supabase
        .from('reminders')
        .update({
          due_date: paymentDueDate,
          frequency: 'monthly',
          status: 'pending',
          notify_email: true,
          notify_push: false,
          notes: `Recordatorio automático de pago para ${card.name}`,
        })
        .eq('id', existingPayment.id)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('reminders')
        .insert({
          user_id: userId,
          title: paymentTitle,
          reminder_type: 'credit_card_payment',
          related_entity_type: 'credit_card',
          related_entity_id: card.id,
          due_date: paymentDueDate,
          amount: null,
          frequency: 'monthly',
          status: 'pending',
          notify_email: true,
          notify_push: false,
          notes: `Recordatorio automático de pago para ${card.name}`,
        })

      if (error) throw error
    }
  }
}
