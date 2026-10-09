'use client'
import {useEffect,useMemo,useState,type FormEvent} from 'react'
import {supabase,hasSupabase} from '@/lib/supabase'

type Mode='client'|'executor'|'admin'
type Care='regular'|'three_to_six_months'|'six_to_twelve_months'|'over_year'|'unknown'
type Memorial={id:string;name:string;cemetery:string;sector:string;row:string;place:string;lastCare:string;care?:Care|null}
type Cemetery={id:string;name:string}
type Order={id:string;memorial:string;service:string;amount:number;date:string;status:string;care:Care}
type CareOpt={code:Care;title:string;description:string;price:number}

const CARE:CareOpt[]=[
{code:'regular',title:'Ухаживаем регулярно',description:'Обычная уборка и поддержание порядка.',price:2990},
{code:'three_to_six_months',title:'3–6 месяцев назад',description:'Полноценный уход и освежение места.',price:4290},
{code:'six_to_twelve_months',title:'6–12 месяцев назад',description:'Более тщательная уборка участка.',price:5990},
{code:'over_year',title:'Больше года назад',description:'Глубокий уход для давно неубранного места.',price:7900},
{code:'unknown',title:'Не знаю',description:'Берём средний объём работ.',price:4290},
]
const LABEL:Record<Care,string>={regular:'Ухаживаем регулярно',three_to_six_months:'3–6 месяцев назад',six_to_twelve_months:'6–12 месяцев назад',over_year:'Больше года назад',unknown:'Не знаю'}
const STATUS:Record<string,string>={draft:'Черновик',awaiting_payment:'Ожидает оплаты',paid:'Оплачен',assigned:'Назначен',before_photos:'Фото ДО',in_progress:'В работе',after_photos:'Фото ПОСЛЕ',review:'Проверка',completed:'Завершён',cancelled:'Отменён'}
const demoCemeteries:Cemetery[]=[{id:'demo-kleshch',name:'Клещихинское кладбище'},{id:'demo-zael',name:'Заельцовское кладбище'},{id:'demo-gusin',name:'Гусинобродское кладбище'}]
const demoMemorial:Memorial={id:'demo',name:'Мария Ивановна',cemetery:'Клещихинское кладбище',sector:'24',row:'8',place:'17',lastCare:'12.09.2026',care:'regular'}
const demoOrders:Order[]=[
{id:'P-1047',memorial:'Мария Ивановна',service:'Полный уход',amount:4290,date:'12.09.2026',status:'completed',care:'three_to_six_months'},
{id:'P-0991',memorial:'Мария Ивановна',service:'Лёгкий уход',amount:2990,date:'18.05.2026',status:'completed',care:'regular'}
]
const money=(n:number)=>n.toLocaleString('ru-RU')+' ₽'
const careTitle=(c:Care)=>CARE.find(x=>x.code===c)?.title??LABEL[c]

export function PamyatApp(){
 const[mode,setMode]=useState<Mode>('client'),[role,setRole]=useState<Mode|null>(null),[memorial,setMemorial]=useState<Memorial|null>(hasSupabase?null:demoMemorial),[memorials,setMemorials]=useState<Memorial[]>(hasSupabase?[]:[demoMemorial]),[cemeteries,setCemeteries]=useState<Cemetery[]>(hasSupabase?[]:demoCemeteries),[orders,setOrders]=useState<Order[]>(hasSupabase?[]:demoOrders),[care,setCare]=useState<Care>('three_to_six_months'),[modal,setModal]=useState<'order'|'login'|'memorial'|null>(null),[notice,setNotice]=useState(''),[email,setEmail]=useState(''),[busy,setBusy]=useState(false)
 const selected=useMemo(()=>CARE.find(x=>x.code===care)!,[care])

 useEffect(()=>{void load()},[])
 async function load(){
  if(!supabase)return
  const publicCemeteries=await supabase.from('cemeteries').select('id,name').eq('active',true).order('name')
  if(publicCemeteries.data)setCemeteries(publicCemeteries.data as Cemetery[])
  const u=await supabase.auth.getUser()
  if(!u.data.user){setMemorial(null);setOrders([]);return}
  const profile=await supabase.from('profiles').select('role').eq('id',u.data.user.id).maybeSingle()
  const userRole=(profile.data?.role as Mode|undefined) ?? 'client'
  setRole(userRole); setMode(userRole)
  const [m,o]=await Promise.all([supabase.from('memorials').select('id,name,sector,row,place,last_care_at,care_level,cemeteries(name)').eq('client_id',u.data.user.id).order('created_at',{ascending:false}),supabase.from('orders').select('id,status,visit_date,amount_rub,care_level,services(name),memorials(name)').eq('client_id',u.data.user.id).order('created_at',{ascending:false})])
  const mappedMemorials=(m.data??[]).map((mm:any)=>({id:mm.id,name:mm.name,sector:mm.sector??'',row:mm.row??'',place:mm.place??'',lastCare:mm.last_care_at?new Date(mm.last_care_at).toLocaleDateString('ru-RU'):'—',cemetery:mm.cemeteries?.name??'Кладбище',care:mm.care_level??null} as Memorial))
  setMemorials(mappedMemorials)
  setMemorial(current=>mappedMemorials.find(x=>x.id===current?.id)??mappedMemorials[0]??null)
  if(o.data)setOrders(o.data.map((x:any)=>({id:x.id,memorial:x.memorials?.name??'Место памяти',service:x.services?.name??'Уход',amount:Number(x.amount_rub),date:x.visit_date?new Date(x.visit_date).toLocaleDateString('ru-RU'):'—',status:x.status,care:x.care_level??'unknown'})))
 }

 async function createMemorial(e:FormEvent){
  e.preventDefault()
  const fd=new FormData(e.currentTarget as HTMLFormElement)
  const name=String(fd.get('name')||'').trim()
  const cemeteryId=String(fd.get('cemetery_id')||'')
  if(!name||!cemeteryId){setNotice('Укажите имя и кладбище.');return}
  if(!supabase){
   const added:Memorial={id:'demo-'+Date.now(),name,cemetery:cemeteries.find(x=>x.id===cemeteryId)?.name??'Кладбище',sector:String(fd.get('sector')||''),row:String(fd.get('row')||''),place:String(fd.get('place')||''),lastCare:'—'};setMemorial(added);setMemorials(items=>[added,...items.filter(x=>x.id!==added.id)])
   setModal(null);setNotice('Место памяти добавлено. Теперь можно оформить заказ.');return
  }
  const u=await supabase.auth.getUser()
  if(!u.data.user){setModal('login');setNotice('Сначала войдите в аккаунт, затем добавьте место памяти.');return}
  setBusy(true)
  try{
   const r=await supabase.from('memorials').insert({client_id:u.data.user.id,cemetery_id:cemeteryId,name,sector:String(fd.get('sector')||''),row:String(fd.get('row')||''),place:String(fd.get('place')||'')}).select('id,name,sector,row,place,cemeteries(name)').single()
   if(r.error)throw r.error
   const x:any=r.data
   const added:Memorial={id:x.id,name:x.name,sector:x.sector??'',row:x.row??'',place:x.place??'',lastCare:'—',cemetery:x.cemeteries?.name??'Кладбище'};setMemorial(added);setMemorials(items=>[added,...items.filter(item=>item.id!==added.id)])
   setModal(null);setNotice('Место памяти сохранено. Теперь можно оформить заказ.')
  }catch(err){setNotice(err instanceof Error?err.message:'Не удалось сохранить место памяти')}finally{setBusy(false)}
 }

 async function login(e:FormEvent){e.preventDefault();if(!supabase){setNotice('Демо-режим: Supabase ещё не подключён.');return}setBusy(true);const r=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}});setBusy(false);setNotice(r.error?.message??'Ссылка для входа отправлена на почту.')}
 async function createOrder(e:FormEvent){e.preventDefault();const fd=new FormData(e.currentTarget as HTMLFormElement);if(!memorial){setModal('memorial');return}const visitDate=String(fd.get('visit_date')||'')||null;const comment=String(fd.get('comment')||'');if(!supabase){setOrders(x=>[{id:'DEMO-'+Date.now().toString().slice(-5),memorial:memorial.name,service:selected.code==='regular'?'Лёгкий уход':selected.code==='three_to_six_months'?'Полный уход':selected.code==='six_to_twelve_months'?'Тщательный уход':selected.code==='over_year'?'Глубокий уход':'Полный уход',amount:selected.price,date:new Date().toLocaleDateString('ru-RU'),status:'awaiting_payment',care},...x]);setModal(null);setNotice('Заявка создана. Предварительная стоимость '+money(selected.price)+'.');return}
 const u=await supabase.auth.getUser();if(!u.data.user){setModal('login');return}
 setBusy(true)
 try{
  const r=await supabase.from('orders').insert({client_id:u.data.user.id,memorial_id:memorial.id,care_level:care,service_id:null,amount_rub:selected.price,status:'draft',visit_date:visitDate,comment}).select().single()
  if(r.error)throw r.error
  const payment=await supabase.functions.invoke('create-yookassa-payment',{body:{order_id:r.data.id}})
  if(payment.error)throw payment.error
  if(payment.data?.confirmation_url){ window.location.href=payment.data.confirmation_url; return }
  setNotice('Заявка создана. Ссылка на оплату пока недоступна.');setModal(null);await load()
 }catch(err){setNotice(err instanceof Error?err.message:'Не удалось создать заказ')}finally{setBusy(false)}
 }
 return <div><header className="top"><div className="container topin"><a className="brandmark" href="/" aria-label="ПАМЯТЬ"><img src="/logo.svg" alt="ПАМЯТЬ" /></a><button className="mode" onClick={()=>{if(supabase&&role!==null){void supabase.auth.signOut();setRole(null);setMode('client');setMemorial(null);setMemorials([]);setOrders([])}else setModal('login')}}>{hasSupabase?(role!==null?'Выйти':'Войти'):'DEMO MODE'}</button></div></header>
 <main className="container"><section className="hero"><div className="eyebrow">Новосибирск</div><h1>Уход за местом памяти, когда вы не можете приехать сами.</h1><p className="lead">Уборка, фото ДО/ПОСЛЕ и история посещений в одном месте. Фото клиента необязательно.</p><div className="switcher">{hasSupabase ? <span className="status green">Режим: {role==='admin'?'Администратор':role==='executor'?'Исполнитель':'Клиент'}</span> : <><button className={mode==='client'?'primary':'secondary'} onClick={()=>setMode('client')}>Клиент</button><button className={mode==='executor'?'primary':'secondary'} onClick={()=>setMode('executor')}>Исполнитель</button><button className={mode==='admin'?'primary':'secondary'} onClick={()=>setMode('admin')}>Администратор</button></>}</div></section>{mode==='client'?<ClientView memorial={memorial} orders={orders} care={care} setCare={setCare} selected={selected} onOrder={()=>setModal('order')} onAddMemorial={()=>setModal('memorial')} memorials={memorials} onSelectMemorial={setMemorial} />:mode==='executor'?<ExecutorView notice={setNotice}/>:<AdminView orders={orders} />}</main>
 {notice&&<div className="modalbg" onClick={()=>setNotice('')}><div className="modal" onClick={e=>e.stopPropagation()}><h3>Готово</h3><p className="lead">{notice}</p><button className="primary" onClick={()=>setNotice('')}>Понятно</button></div></div>}
 {modal==='login'&&<div className="modalbg" onClick={()=>setModal(null)}><form className="modal form" onSubmit={login} onClick={e=>e.stopPropagation()}><h3>Вход</h3><div className="field"><span>Email</span><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div><button className="primary" disabled={busy}>{busy?'Отправляем…':'Получить ссылку для входа'}</button></form></div>}
 {modal==='memorial'&&<div className="modalbg" onClick={()=>setModal(null)}><form className="modal form" onSubmit={createMemorial} onClick={e=>e.stopPropagation()}><h3>Добавить место памяти</h3><p className="muted">Укажите данные, которые помогут исполнителю найти захоронение.</p><div className="field"><span>Имя или подпись места</span><input name="name" required placeholder="Например, Мария Ивановна"/></div><div className="field"><span>Кладбище</span><select name="cemetery_id" required defaultValue=""><option value="" disabled>Выберите кладбище</option>{cemeteries.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="meta"><div className="field"><span>Сектор</span><input name="sector" placeholder="24"/></div><div className="field"><span>Ряд</span><input name="row" placeholder="8"/></div><div className="field"><span>Место</span><input name="place" placeholder="17"/></div></div><button className="primary" disabled={busy}>{busy?'Сохраняем…':'Сохранить место'}</button></form></div>}
 {modal==='order'&&memorial&&<div className="modalbg" onClick={()=>setModal(null)}><form className="modal form" onSubmit={createOrder} onClick={e=>e.stopPropagation()}><h3>Заказать уход</h3><p className="muted">Для «{memorial.name}» · {memorial.cemetery}</p>{CARE.map(x=><button type="button" key={x.code} className={'choice '+(x.code===care?'sel':'')} onClick={()=>setCare(x.code)}><b>{x.title}</b><div className="small muted">{x.description}</div><div className="price">{money(x.price)}</div></button>)}<div className="field"><span>Дата выезда</span><input type="date" name="visit_date" required/></div><div className="field"><span>Комментарий</span><textarea name="comment" rows={3} placeholder="Например, на месте есть цветы или нужен полив"/></div><div className="price-total">{money(selected.price)}</div><div className="small muted">Предварительная стоимость. Если фактический объём изменит цену, новую сумму подтвердим до начала работ.</div><button className="primary" disabled={busy}>{busy?'Создаём…':'Продолжить'}</button></form></div>}
 <footer className="footer"><div className="container">ПАМЯТЬ · уход за местами захоронения · Новосибирск</div></footer></div>
}

function ClientView(p:{memorial:Memorial|null;memorials:Memorial[];onSelectMemorial:(m:Memorial)=>void;orders:Order[];care:Care;setCare:(x:Care)=>void;selected:CareOpt;onOrder:()=>void;onAddMemorial:()=>void}){
 return <section className="grid">
  {p.memorials.length>1&&<div className="card"><div className="label">Мои места памяти</div><div className="switcher">{p.memorials.map(m=><button key={m.id} className={p.memorial?.id===m.id?'primary':'secondary'} onClick={()=>p.onSelectMemorial(m)}>{m.name}</button>)}</div></div>}
  {p.memorial?<div className="card"><div className="cardhead"><div><div className="label">Место памяти</div><div className="name">{p.memorial.name}</div></div><span className="tag">{p.memorial.lastCare==='—'?'Новый заказ':'На контроле'}</span></div><div className="muted">{p.memorial.cemetery}</div><div className="meta"><div><span className="label">Сектор</span><b>{p.memorial.sector||'—'}</b></div><div><span className="label">Ряд</span><b>{p.memorial.row||'—'}</b></div><div><span className="label">Место</span><b>{p.memorial.place||'—'}</b></div></div><div className="actions"><button className="primary" onClick={p.onOrder}>Заказать уход</button><button className="secondary" onClick={p.onAddMemorial}>Добавить ещё место</button></div></div>:<div className="card"><div className="label">Личный кабинет</div><div className="name">Добавьте место памяти</div><p className="muted">Сохраните кладбище и данные захоронения, чтобы оформить заказ и вести историю посещений.</p><button className="primary" onClick={p.onAddMemorial}>Добавить место памяти</button></div>}
  <div className="card"><div className="cardhead"><h3>Как давно ухаживали?</h3><span className="status green">{money(p.selected.price)}</span></div>{CARE.map(x=><button key={x.code} className={'choice '+(p.care===x.code?'sel':'')} onClick={()=>p.setCare(x.code)}><b>{x.title}</b><div className="small muted">{x.description}</div></button>)}<p className="small muted">Фото места добавлять не нужно. После визита исполнитель загрузит обязательные фото ДО/ПОСЛЕ.</p></div>
  <div className="card"><div className="cardhead"><h3>История</h3><span className="status">Фото ДО/ПОСЛЕ</span></div>{p.orders.length===0?<p className="muted">История заказов появится здесь после первого заказа.</p>:<div className="timeline">{p.orders.map(o=><div className="event" key={o.id}><strong>{o.service} · {money(o.amount)}</strong><span className="small muted">{o.date} · {STATUS[o.status]}</span></div>)}</div>}</div>
  <div className="card"><div className="cardhead"><h3>Что будет дальше</h3><span className="status green">Без лишних звонков</span></div><p className="muted">После заказа мы подтверждаем стоимость, назначаем исполнителя, сохраняем фотоотчёт и переносим дату последнего ухода в историю места.</p></div>
 </section>
}

function ExecutorView({notice}:{notice:(x:string)=>void}){
 const[items,setItems]=useState<any[]>([]),[selectedId,setSelectedId]=useState<string|null>(null),[step,setStep]=useState<'before'|'start'|'after'|'review'>('before'),[before,setBefore]=useState<File|null>(null),[after,setAfter]=useState<File|null>(null),[busy,setBusy]=useState(false)
 const current=items.find(x=>x.id===selectedId)??items[0]??null
 useEffect(()=>{void load()},[])
 async function load(){
  if(!supabase)return
  const u=await supabase.auth.getUser(); if(!u.data.user)return
  const q=await supabase.from('orders').select('id,status,visit_date,amount_rub,care_level,comment,memorials(name,sector,row,place,cemeteries(name)),services(name)').eq('executor_id',u.data.user.id).in('status',['assigned','before_photos','in_progress','after_photos','review']).order('visit_date')
  if(q.data){setItems(q.data);if(q.data[0]){setSelectedId(q.data[0].id);syncStep(q.data[0].status)}}
 }
 function syncStep(status:string){setStep(status==='assigned'?'before':status==='before_photos'?'start':status==='in_progress'?'after':status==='after_photos'||status==='review'?'review':'before')}
 async function upload(kind:'before'|'after',file:File){
  if(!current||!supabase){
   if(kind==='before'){setBefore(file);setStep('start');notice('Фото ДО сохранено в демо-режиме.')}else{setAfter(file);setStep('review');notice('Фото ПОСЛЕ сохранено в демо-режиме.')}
   return
  }
  setBusy(true)
  try{
   const ext=file.name.split('.').pop()?.toLowerCase()||'jpg'
   const path=current.id+'/'+kind+'/'+crypto.randomUUID()+'.'+ext
   const up=await supabase.storage.from('order-photos').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'})
   if(up.error)throw up.error
   const row=await supabase.from('order_photos').insert({order_id:current.id,kind,storage_path:path})
   if(row.error)throw row.error
   const nextStatus=kind==='before'?'before_photos':'review'
   const upd=await supabase.from('orders').update({status:nextStatus}).eq('id',current.id)
   if(upd.error)throw upd.error
   if(kind==='before'){setBefore(file);setStep('start');notice('Фото ДО сохранено. Теперь можно начинать работу.')}else{setAfter(file);setStep('review');notice('Фото ПОСЛЕ сохранено. Заказ передан на проверку.')}
   await load()
  }catch(err){notice(err instanceof Error?err.message:'Не удалось сохранить фото')}finally{setBusy(false)}
 }
 async function startWork(){
  if(!current||!supabase){setStep('after');return}
  setBusy(true);const r=await supabase.from('orders').update({status:'in_progress'}).eq('id',current.id);setBusy(false)
  if(r.error){notice(r.error.message);return}setStep('after');await load()
 }
 return <section className="grid">
  <div className="card">
   <div className="cardhead"><div><div className="label">Назначенные заказы</div><div className="name">Сегодня</div></div><span className="status green">{items.length}</span></div>
   {items.length===0?<p className="muted">Пока нет назначенных заказов.</p>:<div className="timeline">{items.map((o:any)=><button key={o.id} className={'choice '+((current?.id===o.id)?'sel':'')} onClick={()=>{setSelectedId(o.id);syncStep(o.status)}}><b>{o.memorials?.name??'Место памяти'}</b><div className="small muted">{o.memorials?.cemeteries?.name??'Кладбище'} · сектор {o.memorials?.sector??'—'} · ряд {o.memorials?.row??'—'} · место {o.memorials?.place??'—'}</div><div className="small muted">{o.services?.name??'Уход'} · {money(Number(o.amount_rub))}</div></button>)}</div>}
  </div>
  {current&&<div className="card">
   <div className="label">Текущий заказ</div><div className="name">{current.memorials?.name??'Место памяти'}</div><div className="muted">{current.memorials?.cemeteries?.name??'Кладбище'} · сектор {current.memorials?.sector??'—'} · ряд {current.memorials?.row??'—'} · место {current.memorials?.place??'—'}</div>
   <div className="meta"><div><span className="label">Услуга</span><b>{current.services?.name??'Уход'}</b></div><div><span className="label">Цена</span><b>{money(Number(current.amount_rub))}</b></div><div><span className="label">Этап</span><b>{step==='before'?'Фото ДО':step==='start'?'Готов к работе':step==='after'?'В работе':'Проверка'}</b></div></div>
   <div className="executor">
    <label className="upload">Фото ДО<input hidden type="file" accept="image/*" capture="environment" disabled={busy||step!=='before'} onChange={e=>{const file=e.target.files?.[0];if(file)void upload('before',file)}}/><div className="small">{before?.name??'Сделать или выбрать фото'}</div></label>
    <label className="upload">Фото ПОСЛЕ<input hidden type="file" accept="image/*" capture="environment" disabled={busy||step!=='after'} onChange={e=>{const file=e.target.files?.[0];if(file)void upload('after',file)}}/><div className="small">{after?.name??'Появится после работы'}</div></label>
   </div>
   <div className="actions">{step==='before'&&<button className="primary" disabled={busy||!before}>Выберите Фото ДО</button>}{step==='start'&&<button className="primary" disabled={busy} onClick={()=>void startWork()}>Начать работу</button>}{step==='after'&&<button className="primary" disabled={busy}>Загрузите Фото ПОСЛЕ</button>}{step==='review'&&<span className="status green">Готово к проверке</span>}</div>
  </div>}
  <div className="card"><h3>Правило работы</h3><div className="timeline"><div className="event"><strong>1. Фото ДО</strong><span className="small muted">Сначала фиксируем состояние места.</span></div><div className="event"><strong>2. Работа</strong><span className="small muted">После Фото ДО становится доступна кнопка начала работы.</span></div><div className="event"><strong>3. Фото ПОСЛЕ</strong><span className="small muted">После работы загружаем обязательное фото и передаём заказ на проверку.</span></div></div></div>
 </section>
}

function AdminView({orders}:{orders:Order[]}){
 const[liveOrders,setLiveOrders]=useState<Order[]>(orders),[executors,setExecutors]=useState<{id:string;full_name:string|null}[]>([]),[staff,setStaff]=useState<{id:string;full_name:string|null;role:Mode}[]>([]),[currentUserId,setCurrentUserId]=useState<string|null>(null),[busy,setBusy]=useState<string|null>(null),[photoUrls,setPhotoUrls]=useState<Record<string,{before?:string;after?:string}>>({})
 useEffect(()=>{void load()},[])
 async function load(){
  if(!supabase)return
  const me=await supabase.auth.getUser()
  setCurrentUserId(me.data.user?.id??null)
  const [oq,pq,photos]=await Promise.all([
   supabase.from('orders').select('id,status,visit_date,amount_rub,care_level,executor_id,memorials(name),services(name)').order('created_at',{ascending:false}),
   supabase.from('profiles').select('id,full_name,role').order('full_name'),
   supabase.from('order_photos').select('order_id,kind,storage_path').in('kind',['before','after'])
  ])
  if(oq.data)setLiveOrders(oq.data.map((x:any)=>({id:x.id,memorial:x.memorials?.name??'Место памяти',service:x.services?.name??'Уход',amount:Number(x.amount_rub),date:x.visit_date?new Date(x.visit_date).toLocaleDateString('ru-RU'):'—',status:x.status,care:x.care_level??'unknown'})))
  if(pq.data){
   const people=pq.data as {id:string;full_name:string|null;role:Mode}[]
   setStaff(people);setExecutors(people.filter(person=>person.role==='executor'))
  }
  if(photos.data){
   const results=await Promise.all(photos.data.map(async (p:any)=>{
    const signed=await supabase.storage.from('order-photos').createSignedUrl(p.storage_path,3600)
    return {orderId:p.order_id,kind:p.kind,url:signed.data?.signedUrl}
   }))
   const map:Record<string,{before?:string;after?:string}>={}
   for(const item of results){if(!item.url)continue;map[item.orderId]??={};if(item.kind==='before')map[item.orderId].before=item.url;if(item.kind==='after')map[item.orderId].after=item.url}
   setPhotoUrls(map)
  }
 }
 async function assign(orderId:string,executorId:string){
  if(!supabase)return
  setBusy(orderId)
  const q=await supabase.from('orders').update({executor_id:executorId||null,status:executorId?'assigned':'paid'}).eq('id',orderId).in('status',['paid','assigned'])
  setBusy(null)
  if(q.error)alert(q.error.message); else await load()
 }
 async function changeRole(userId:string,role:Mode){
  if(!supabase||userId===currentUserId)return
  setBusy('staff-'+userId)
  const q=await supabase.from('profiles').update({role}).eq('id',userId)
  setBusy(null)
  if(q.error)alert(q.error.message); else await load()
 }
 async function complete(orderId:string){
  if(!supabase)return
  setBusy(orderId)
  const q=await supabase.from('orders').update({status:'completed'}).eq('id',orderId).eq('status','review')
  setBusy(null)
  if(q.error)alert(q.error.message); else await load()
 }
 const source=hasSupabase?liveOrders:orders
 return <section>
  <div className="metricgrid"><div className="metric"><span className="label">Всего</span><b>{source.length}</b></div><div className="metric"><span className="label">В работе</span><b>{source.filter(x=>['assigned','before_photos','in_progress','after_photos','review'].includes(x.status)).length}</b></div><div className="metric"><span className="label">Завершено</span><b>{source.filter(x=>x.status==='completed').length}</b></div></div>
  <div className="card" style={{marginTop:12}}><div className="cardhead"><h3>Очередь заказов</h3><span className="status">Контроль исполнителей</span></div>{source.length===0?<p className="muted">Заказов пока нет.</p>:source.map(o=><div className="order" key={o.id}><div className="orderrow"><div><b>{o.id}</b><div className="small muted">{o.memorial} · {o.service} · {money(o.amount)}</div><div className="small muted">{o.date}</div></div><span className={'status '+(o.status==='completed'?'green':'')}>{STATUS[o.status]??o.status}</span></div>
   {hasSupabase&&['paid','assigned'].includes(o.status)&&<div className="actions"><select aria-label="Исполнитель" disabled={busy===o.id} defaultValue="" onChange={e=>void assign(o.id,e.target.value)}><option value="" disabled>{o.status==='assigned'?'Назначить заново':'Выбрать исполнителя'}</option>{executors.map(e=><option key={e.id} value={e.id}>{e.full_name||'Исполнитель'}</option>)}</select></div>}
   {hasSupabase&&o.status==='review'&&<><div className="photo-pair">{photoUrls[o.id]?.before&&<figure><img src={photoUrls[o.id].before} alt="Фото до"/><figcaption>Фото ДО</figcaption></figure>}{photoUrls[o.id]?.after&&<figure><img src={photoUrls[o.id].after} alt="Фото после"/><figcaption>Фото ПОСЛЕ</figcaption></figure>}</div><div className="actions"><button className="primary" disabled={busy===o.id||!photoUrls[o.id]?.before||!photoUrls[o.id]?.after} onClick={()=>void complete(o.id)}>{busy===o.id?'Сохраняем…':'Подтвердить и завершить'}</button></div></>}
  </div>)}</div>
  {hasSupabase&&<div className="card" style={{marginTop:12}}><div className="cardhead"><h3>Сотрудники и роли</h3><span className="status">{staff.length}</span></div><p className="small muted">Сотрудник сначала входит по ссылке из письма. После первого входа его профиль появится в этом списке, и здесь можно назначить роль.</p>{staff.map(person=><div className="order" key={person.id}><div className="orderrow"><div><b>{person.full_name||'Пользователь'}</b><div className="small muted">{person.id===currentUserId?'Ваш аккаунт':person.id.slice(0,8)+'…'}</div></div><select aria-label="Роль пользователя" value={person.role} disabled={busy==='staff-'+person.id||person.id===currentUserId} onChange={e=>void changeRole(person.id,e.target.value as Mode)}><option value="client">Клиент</option><option value="executor">Исполнитель</option><option value="admin">Администратор</option></select></div></div>)}</div>}
 </section>
}
