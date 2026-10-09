'use client'

import {Suspense,useEffect,useState} from 'react'
import {useSearchParams} from 'next/navigation'
import {supabase} from '@/lib/supabase'

const labels:Record<string,string>={
  draft:'Черновик',
  awaiting_payment:'Ожидаем подтверждение оплаты',
  paid:'Оплата подтверждена',
  assigned:'Исполнитель назначен',
  before_photos:'Исполнитель начал подготовку',
  in_progress:'Заказ выполняется',
  after_photos:'Фото ПОСЛЕ загружено',
  review:'Заказ на проверке',
  completed:'Заказ завершён',
  cancelled:'Платёж отменён',
  login:'Войдите в кабинет, чтобы проверить заказ',
  unavailable:'Не удалось проверить статус заказа'
}

export default function PaymentReturn(){
 return <Suspense fallback={<main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#f4f1e9'}}>Проверяем оплату…</main>}><PaymentReturnContent /></Suspense>
}

function PaymentReturnContent(){
 const params=useSearchParams()
 const orderId=params.get('order_id')
 const[status,setStatus]=useState('awaiting_payment')
 const[loading,setLoading]=useState(true)

 useEffect(()=>{
  let stopped=false
  let timer:ReturnType<typeof setTimeout>|undefined
  let attempts=0

  async function check(){
   if(!orderId||!supabase){setStatus('unavailable');setLoading(false);return}
   const user=await supabase.auth.getUser()
   if(!user.data.user){setStatus('login');setLoading(false);return}
   const r=await supabase.from('orders').select('status').eq('id',orderId).eq('client_id',user.data.user.id).maybeSingle()
   if(!stopped&&r.data?.status){
    setStatus(r.data.status)
    setLoading(false)
    if(['paid','assigned','before_photos','in_progress','after_photos','review','completed','cancelled'].includes(r.data.status)) return
   }
   attempts+=1
   if(!stopped&&attempts<8) timer=setTimeout(check,2000)
   else if(!stopped){setStatus('unavailable');setLoading(false)}
  }

  void check()
  return()=>{stopped=true;if(timer)clearTimeout(timer)}
 },[orderId])

 const label=labels[status]??'Проверяем заказ'

 return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#f4f1e9'}}>
   <section style={{width:'min(520px,100%)',background:'#fffdf8',border:'1px solid #e2ddd1',borderRadius:20,padding:24}}>
    <div style={{letterSpacing:'.12em',fontWeight:800,fontSize:13}}>ПАМЯТЬ</div>
    <h1 style={{fontFamily:'Georgia,serif',fontWeight:500}}>Оплата</h1>
    <p style={{color:'#72776d',lineHeight:1.5}}>{loading?'Проверяем подтверждение платежа…':status==='cancelled'?'Платёж отменён. Заказ сохранён в кабинете, его можно оплатить повторно.':status==='paid'?'Платёж подтверждён. Заказ появится в истории кабинета.':label+'.'}</p>
    <div style={{display:'inline-flex',borderRadius:999,padding:'7px 10px',background:status==='paid'?'#e8eee8':'#f4f1ea',color:status==='paid'?'#3c5b47':'#72776d',fontSize:12,fontWeight:700}}>{label}</div>
    <div style={{marginTop:20}}>
      <a href="/" style={{display:'inline-block',background:'#3c5b47',color:'#fff',padding:'12px 15px',borderRadius:12,textDecoration:'none'}}>Вернуться в ПАМЯТЬ</a>
    </div>
   </section>
 </main>
}
