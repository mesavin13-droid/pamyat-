import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405)

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return response({ error: 'Unauthorized' }, 401)

    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    const adminKey = secretKeys.default
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!adminKey || !supabaseUrl) throw new Error('Supabase server credentials are not configured')

    const sb = createClient(supabaseUrl, adminKey, { auth: { persistSession: false } })
    const { data: { user }, error: authError } = await sb.auth.getUser(token)
    if (authError || !user) return response({ error: 'Unauthorized' }, 401)

    const body = await req.json() as { order_id?: string }
    if (!body.order_id) return response({ error: 'order_id is required' }, 400)

    const { data: order, error: orderError } = await sb
      .from('orders')
      .select('id,client_id,amount_rub,status')
      .eq('id', body.order_id)
      .maybeSingle()
    if (orderError || !order) return response({ error: 'Order not found' }, 404)
    if (order.client_id !== user.id) return response({ error: 'Forbidden' }, 403)
    if (!['draft', 'awaiting_payment', 'cancelled'].includes(order.status)) {
      return response({ error: 'Order cannot be paid in its current status' }, 409)
    }

    if (order.status === 'cancelled') {
      const { data: canceledAttempt, error: canceledError } = await sb
        .from('payments')
        .select('id')
        .eq('order_id', order.id)
        .eq('status', 'canceled')
        .limit(1)
        .maybeSingle()
      if (canceledError) throw canceledError
      if (!canceledAttempt) {
        return response({ error: 'Only orders with a canceled payment can be paid again' }, 409)
      }
    }

    const { data: existing, error: existingError } = await sb
      .from('payments')
      .select('provider_payment_id,confirmation_url,status,amount_rub')
      .eq('order_id', order.id)
      .in('status', ['pending', 'waiting_for_capture'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      if (existing.confirmation_url && existing.amount_rub === order.amount_rub) {
        if (order.status === 'cancelled') {
          const { error: reopenError } = await sb.from('orders')
            .update({ status: 'awaiting_payment' })
            .eq('id', order.id)
            .eq('status', 'cancelled')
          if (reopenError) throw reopenError
        }
        return response({
          payment_id: existing.provider_payment_id,
          confirmation_url: existing.confirmation_url,
          reused: true,
        })
      }
      return response({ error: 'An active payment attempt already exists but cannot be resumed' }, 409)
    }

    // Keep one stable key per attempt. Retries reuse the next attempt number until its
    // payment row is stored; a later attempt after a canceled payment gets a fresh key.
    const { data: priorAttempts, error: attemptsError } = await sb
      .from('payments')
      .select('id')
      .eq('order_id', order.id)
    if (attemptsError) throw attemptsError
    const idempotencyKey = 'pamyat-order-' + order.id + '-' + ((priorAttempts?.length ?? 0) + 1)

    const shop = Deno.env.get('YOOKASSA_SHOP_ID')
    const secret = Deno.env.get('YOOKASSA_SECRET_KEY')
    const site = Deno.env.get('SITE_URL')
    if (!shop || !secret || !site) throw new Error('Payment provider secrets are not configured')

    const yk = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(shop + ':' + secret),
        'Idempotence-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { value: Number(order.amount_rub).toFixed(2), currency: 'RUB' },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: site + '/payment/return?order_id=' + encodeURIComponent(order.id),
        },
        description: 'Оплата ухода за местом памяти',
        metadata: { order_id: order.id },
      }),
    })

    const payment = await yk.json()
    if (!yk.ok) return response({ error: payment.description || 'Payment provider error' }, 502)
    if (payment.amount?.currency !== 'RUB' ||
        Math.round(Number(payment.amount?.value) * 100) !== order.amount_rub * 100) {
      throw new Error('Payment amount returned by provider does not match the order')
    }
    const confirmationUrl = payment.confirmation?.confirmation_url
    if (!confirmationUrl || !payment.id) throw new Error('Payment provider did not return a confirmation URL')

    const { error: insertError } = await sb.from('payments').insert({
      order_id: order.id,
      provider: 'yookassa',
      provider_payment_id: payment.id,
      idempotency_key: idempotencyKey,
      amount_rub: order.amount_rub,
      status: payment.status ?? 'pending',
      confirmation_url: confirmationUrl,
    })
    if (insertError) {
      // Recover only if this exact provider payment was already stored after a retry.
      const { data: stored, error: storedError } = await sb.from('payments')
        .select('id,order_id,amount_rub,confirmation_url')
        .eq('provider_payment_id', payment.id)
        .maybeSingle()
      if (storedError || !stored || stored.order_id !== order.id || stored.amount_rub !== order.amount_rub) {
        throw insertError
      }
    }

    const { error: updateOrderError } = await sb.from('orders')
      .update({ status: 'awaiting_payment' })
      .eq('id', order.id)
      .in('status', ['draft', 'awaiting_payment', 'cancelled'])
    if (updateOrderError) throw updateOrderError

    return response({ payment_id: payment.id, confirmation_url: confirmationUrl })
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Payment error' }, 400)
  }
})
