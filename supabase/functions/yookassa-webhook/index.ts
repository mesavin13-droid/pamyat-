import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: jsonHeaders })
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405)

  try {
    const event = await req.json()
    const paymentId = event?.object?.id
    if (!paymentId || typeof paymentId !== 'string') return response({ ok: true })

    const shopId = Deno.env.get('YOOKASSA_SHOP_ID')
    const secret = Deno.env.get('YOOKASSA_SECRET_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    const adminKey = secretKeys.default
    if (!shopId || !secret || !supabaseUrl || !adminKey) {
      throw new Error('Server credentials are not configured')
    }

    // Never trust webhook body status or amount: re-fetch the payment from YooKassa.
    const check = await fetch('https://api.yookassa.ru/v3/payments/' + encodeURIComponent(paymentId), {
      headers: { Authorization: 'Basic ' + btoa(shopId + ':' + secret) },
    })
    const payment = await check.json()
    if (!check.ok) throw new Error(payment?.description || 'Payment provider lookup failed')

    const orderId = payment?.metadata?.order_id
    if (!orderId || typeof orderId !== 'string') return response({ ok: true })

    const sb = createClient(supabaseUrl, adminKey, { auth: { persistSession: false } })
    const { data: order, error: orderError } = await sb
      .from('orders')
      .select('id,amount_rub,status')
      .eq('id', orderId)
      .maybeSingle()
    if (orderError) throw orderError
    if (!order) return response({ error: 'Order not found' }, 404)

    const amountCents = Math.round(Number(payment.amount?.value) * 100)
    if (payment.amount?.currency !== 'RUB' || amountCents !== order.amount_rub * 100) {
      return response({ error: 'Payment amount or currency does not match the order' }, 409)
    }

    const { data: storedPayment, error: storedPaymentError } = await sb
      .from('payments')
      .select('id,order_id,amount_rub')
      .eq('provider_payment_id', paymentId)
      .maybeSingle()
    if (storedPaymentError) throw storedPaymentError
    if (!storedPayment || storedPayment.order_id !== order.id ||
        storedPayment.amount_rub !== order.amount_rub) {
      return response({ error: 'Payment is not linked to this order' }, 409)
    }

    const status = payment.status === 'succeeded'
      ? 'succeeded'
      : payment.status === 'canceled'
        ? 'canceled'
        : payment.status === 'waiting_for_capture'
          ? 'waiting_for_capture'
          : 'pending'

    const { error: updatePaymentError } = await sb.from('payments')
      .update({ status, confirmation_url: payment?.confirmation?.confirmation_url ?? null })
      .eq('id', storedPayment.id)
    if (updatePaymentError) throw updatePaymentError

    if (payment.status === 'succeeded') {
      const { error } = await sb.from('orders').update({ status: 'paid' })
        .eq('id', order.id).in('status', ['draft', 'awaiting_payment'])
      if (error) throw error
    } else if (payment.status === 'canceled') {
      const { error } = await sb.from('orders').update({ status: 'cancelled' })
        .eq('id', order.id).in('status', ['draft', 'awaiting_payment'])
      if (error) throw error
    }

    return response({ ok: true })
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Webhook error' }, 400)
  }
})
