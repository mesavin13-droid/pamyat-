import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type' }

Deno.serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors})
  try{
    const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'')
    if(!token) throw new Error('Unauthorized')
    const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
    const adminKey=secretKeys.default
    if(!adminKey) throw new Error('Supabase secret key is not configured')
    const sb=createClient(Deno.env.get('SUPABASE_URL')!,adminKey)
    const {data:{user},error:authError}=await sb.auth.getUser(token)
    if(authError||!user) throw new Error('Unauthorized')

    const body=await req.json() as {order_id?:string}
    if(!body.order_id) throw new Error('order_id is required')
    const {data:order,error:orderError}=await sb.from('orders').select('id,client_id,amount_rub,status').eq('id',body.order_id).single()
    if(orderError||!order) throw new Error('Order not found')
    if(order.client_id!==user.id) throw new Error('Forbidden')
    if(!['draft','awaiting_payment'].includes(order.status)) throw new Error('Order cannot be paid')

    const idem=crypto.randomUUID()
    const shop=Deno.env.get('YOOKASSA_SHOP_ID')
    const secret=Deno.env.get('YOOKASSA_SECRET_KEY')
    const site=Deno.env.get('SITE_URL')
    if(!shop||!secret||!site) throw new Error('Payment secrets are not configured')

    const yk=await fetch('https://api.yookassa.ru/v3/payments',{
      method:'POST',
      headers:{'Authorization':'Basic '+btoa(shop+':'+secret),'Idempotence-Key':idem,'Content-Type':'application/json'},
      body:JSON.stringify({
        amount:{value:Number(order.amount_rub).toFixed(2),currency:'RUB'},
        capture:true,
        confirmation:{type:'redirect',return_url:site+'/payment/return'},
        description:'Оплата ухода за местом памяти',
        metadata:{order_id:order.id}
      })
    })
    const payment=await yk.json()
    if(!yk.ok) throw new Error(payment.description||'YooKassa error')

    await sb.from('payments').insert({
      order_id:order.id,
      provider:'yookassa',
      provider_payment_id:payment.id,
      idempotency_key:idem,
      amount_rub:order.amount_rub,
      status:payment.status??'pending',
      confirmation_url:payment.confirmation?.confirmation_url??null
    })
    await sb.from('orders').update({status:'awaiting_payment'}).eq('id',order.id)
    return new Response(JSON.stringify({payment_id:payment.id,confirmation_url:payment.confirmation?.confirmation_url}),{headers:{...cors,'Content-Type':'application/json'}})
  }catch(e){
    return new Response(JSON.stringify({error:e instanceof Error?e.message:'Payment error'}),{status:400,headers:{...cors,'Content-Type':'application/json'}})
  }
})
