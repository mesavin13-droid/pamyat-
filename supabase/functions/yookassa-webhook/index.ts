import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const jsonHeaders={'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}

Deno.serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:{...jsonHeaders,'Access-Control-Allow-Headers':'content-type'}})
  if(req.method!=='POST') return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:jsonHeaders})
  try{
    const event=await req.json()
    const paymentId=event?.object?.id
    if(!paymentId) return new Response(JSON.stringify({ok:true}),{headers:jsonHeaders})

    const shopId=Deno.env.get('YOOKASSA_SHOP_ID')
    const secret=Deno.env.get('YOOKASSA_SECRET_KEY')
    if(!shopId||!secret) throw new Error('YooKassa secrets are not configured')

    const auth=btoa(shopId+':'+secret)
    const check=await fetch('https://api.yookassa.ru/v3/payments/'+encodeURIComponent(paymentId),{
      headers:{Authorization:'Basic '+auth}
    })
    const payment=await check.json()
    if(!check.ok) throw new Error(payment?.description||'YooKassa lookup failed')

    const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
    const adminKey=secretKeys.default
    if(!adminKey) throw new Error('Supabase secret key is not configured')
    const sb=createClient(Deno.env.get('SUPABASE_URL')!,adminKey)

    const orderId=payment?.metadata?.order_id
    if(!orderId) return new Response(JSON.stringify({ok:true}),{headers:jsonHeaders})

    const paymentStatus=payment.status==='succeeded'?'succeeded':payment.status==='canceled'?'canceled':'pending'
    const {error:updatePaymentError}=await sb.from('payments').update({status:paymentStatus,confirmation_url:payment?.confirmation?.confirmation_url??null}).eq('provider_payment_id',paymentId)
    if(updatePaymentError) throw updatePaymentError

    if(payment.status==='succeeded'){
      const {error}=await sb.from('orders').update({status:'paid'}).eq('id',orderId).in('status',['draft','awaiting_payment'])
      if(error) throw error
    }
    if(payment.status==='canceled'){
      const {error}=await sb.from('orders').update({status:'cancelled'}).eq('id',orderId).in('status',['draft','awaiting_payment'])
      if(error) throw error
    }

    return new Response(JSON.stringify({ok:true}),{headers:jsonHeaders})
  }catch(error){
    return new Response(JSON.stringify({error:error instanceof Error?error.message:'Webhook error'}),{status:400,headers:jsonHeaders})
  }
})