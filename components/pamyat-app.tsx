'use client'
import {useEffect,useMemo,useState,type FormEvent} from 'react'
import {supabase,hasSupabase} from '@/lib/supabase'

type Mode='client'|'executor'|'admin'
type Care='regular'|'three_to_six_months'|'six_to_twelve_months'|'over_year'|'unknown'
type Memorial={id:string;name:string;cemetery:string;sector:string;row:string;place:string;lastCare:string;care?:Care|null}
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
const STATUS:Record<string,string>={draft:'Черновик',awaiting_payment:'Ожидает оплаты',paid:'Оплачен',assigned:'Назначен',before_photos:'Фото ДО',in_progress:'В работе',after_photos:'Фото ПОСЛЕ',review:'Проверка',completed:'Завершён'}
const demoMemorial:Memorial={id:'demo',name:'Мария Ивановна',cemetery:'Клещихинское кладбище',sector:'24',row:'8',place:'17',lastCare:'12.09.2026',care:'regular'}
const demoOrders:Order[]=[
{id:'P-1047',memorial:'Мария Ивановна',service:'Полный уход',amount:4290,date:'12.09.2026',status:'completed',care:'three_to_six_months'},
{id:'P-0991',memorial:'Мария Ивановна',service:'Лёгкий уход',amount:2990,date:'18.05.2026',status:'completed',care:'regular'}
]
const money=(n:number)=>n.toLocaleString('ru-RU')+' ₽'
const careTitle=(c:Care)=>CARE.find(x=>x.code===c)?.title??LABEL[c]

export function PamyatApp(){
 const[mode,setMode]=useState<Mode>('client'),[memorial,setMemorial]=useState<Memorial>(demoMemorial),[orders,setOrders]=useState<Order[]>(demoOrders),[care,setCare]=useState<Care>('three_to_six_months'),[modal,setModal]=useState<'order'|'login'|null>(null),[notice,setNotice]=useState(''),[email,setEmail]=useState(''),[busy,setBusy]=useState(false)
 const selected=useMemo(()=>CARE.find(x=>x.code===care)!,[care])

 useEffect(()=>{void load()},[])
 async function load(){
  if(!supabase)return
  const u=await supabase.auth.getUser(); if(!u.data.user)return
  const m=await supabase.from('memorials').select('id,name,sector,row,place,last_care_at,care_level,cemeteries(name)').eq('client_id',u.data.user.id).order('created_at').limit(1)
  const o=await supabase.from('orders').select('id,status,visit_date,amount_rub,care_level,services(name),memorials(name)').eq('client_id',u.data.user.id).order('created_at',{ascending:false})
  const mm=m.data?.[0] as any
  if(mm)setMemorial({id:mm.id,name:mm.name,sector:mm.sector??'',row:mm.row??'',place:mm.place??'',lastCare:mm.last_care_at?new Date(mm.last_care_at).toLocaleDateString('ru-RU'):'—',cemetery:mm.cemeteries?.name??'Кладбище',care:mm.care_level??null})
  if(o.data)setOrders(o.data.map((x:any)=>({id:x.id,memorial:x.memorials?.name??'Место памяти',service:x.services?.name??'Уход',amount:Number(x.amount_rub),date:x.visit_date?new Date(x.visit_date).toLocaleDateString('ru-RU'):'—',status:x.status,care:x.care_level??'unknown'})))
 }
 async function login(e:FormEvent){e.preventDefault();if(!supabase){setNotice('Демо-режим: Supabase ещё не подключён.');return}setBusy(true);const r=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}});setBusy(false);setNotice(r.error?.message??'Ссылка для входа отправлена на почту.')}
 async function createOrder(e:FormEvent){e.preventDefault();if(!supabase){setOrders(x=>[{id:'DEMO-'+Date.now().toString().slice(-5),memorial:memorial.name,service:selected.code==='regular'?'Лёгкий уход':selected.code==='three_to_six_months'?'Полный уход':selected.code==='six_to_twelve_months'?'Тщательный уход':selected.code==='over_year'?'Глубокий уход':'Полный уход',amount:selected.price,date:new Date().toLocaleDateString('ru-RU'),status:'awaiting_payment',care},...x]);setModal(null);setNotice('Заявка создана. Предварительная стоимость '+money(selected.price)+'.');return}
 const u=await supabase.auth.getUser();if(!u.data.user){setModal('login');return}
 setBusy(true)
 try{
  const r=await supabase.from('orders').insert({client_id:u.data.user.id,memorial_id:memorial.id,care_level:care,service_id:null,amount_rub:selected.price,status:'draft',visit_date:(new FormData(e.currentTarget).get('visit_date')||null),comment:(new FormData(e.currentTarget).get('comment')||null)}).select().single()
  if(r.error)throw r.error
  setNotice('Заявка создана. Следующий шаг — оплата.');setModal(null);await load()
 }catch(err){setNotice(err instanceof Error?err.message:'Не удалось создать заказ')}finally{setBusy(false)}
 }
 return <div><header className="top"><div className="container topin"><a className="brandmark" href="/" aria-label="ПАМЯТЬ"><img src="/logo.svg" alt="ПАМЯТЬ" /></a><button className="mode" onClick={()=>setModal('login')}>{hasSupabase?'Войти':'DEMO MODE'}</button></div></header>
 <main className="container"><section className="hero"><div className="eyebrow">Новосибирск</div><h1>Уход за местом памяти, когда вы не можете приехать сами.</h1><p className="lead">Уборка, фото ДО/ПОСЛЕ и история посещений в одном месте. Фото клиента необязательно.</p><div className="switcher"><button className={mode==='client'?'primary':'secondary'} onClick={()=>setMode('client')}>Клиент</button><button className={mode==='executor'?'primary':'secondary'} onClick={()=>setMode('executor')}>Исполнитель</button><button className={mode==='admin'?'primary':'secondary'} onClick={()=>setMode('admin')}>Администратор</button></div></section>{mode==='client'?<ClientView memorial={memorial} orders={orders} care={care} setCare={setCare} selected={selected} onOrder={()=>setModal('order')} />:mode==='executor'?<ExecutorView notice={setNotice}/>:<AdminView orders={orders} />}</main>
 {notice&&<div className="modalbg" onClick={()=>setNotice('')}><div className="modal" onClick={e=>e.stopPropagation()}><h3>Готово</h3><p className="lead">{notice}</p><button className="primary" onClick={()=>setNotice('')}>Понятно</button></div></div>}
 {modal==='login'&&<div className="modalbg" onClick={()=>setModal(null)}><form className="modal form" onSubmit={login} onClick={e=>e.stopPropagation()}><h3>Вход</h3><div className="field"><span>Email</span><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div><button className="primary" disabled={busy}>{busy?'Отправляем…':'Получить ссылку для входа'}</button></form></div>}
 {modal==='order'&&<div className="modalbg" onClick={()=>setModal(null)}><form className="modal form" onSubmit={createOrder} onClick={e=>e.stopPropagation()}><h3>Заказать уход</h3><p className="muted">Для «{memorial.name}» · {memorial.cemetery}</p>{CARE.map(x=><button type="button" key={x.code} className={'choice '+(x.code===care?'sel':'')} onClick={()=>setCare(x.code)}><b>{x.title}</b><div className="small muted">{x.description}</div><div className="price">{money(x.price)}</div></button>)}<div className="field"><span>Дата выезда</span><input type="date" name="visit_date" required/></div><div className="field"><span>Комментарий</span><textarea name="comment" rows={3} placeholder="Например, на месте есть цветы или нужен полив"/></div><div className="price-total">{money(selected.price)}</div><div className="small muted">Предварительная стоимость. Если фактический объём изменит цену, новую сумму подтвердим до начала работ.</div><button className="primary" disabled={busy}>{busy?'Создаём…':'Продолжить'}</button></form></div>}
 <footer className="footer"><div className="container">ПАМЯТЬ · уход за местами захоронения · Новосибирск</div></footer></div>
}

function ClientView(p:{memorial:Memorial;orders:Order[];care:Care;setCare:(x:Care)=>void;selected:CareOpt;onOrder:()=>void}){
 return <section className="grid"><div className="card"><div className="cardhead"><div><div className="label">Место памяти</div><div className="name">{p.memorial.name}</div></div><span className="tag">{p.memorial.lastCare==='—'?'Новый заказ':'На контроле'}</span></div><div className="muted">{p.memorial.cemetery}</div><div className="meta"><div><span className="label">Сектор</span><b>{p.memorial.sector}</b></div><div><span className="label">Ряд</span><b>{p.memorial.row}</b></div><div><span className="label">Место</span><b>{p.memorial.place}</b></div></div><div className="actions"><button className="primary" onClick={p.onOrder}>Заказать уход</button></div></div>
 <div className="card"><div className="cardhead"><h3>Как давно ухаживали?</h3><span className="status green">{money(p.selected.price)}</span></div>{CARE.map(x=><button key={x.code} className={'choice '+(p.care===x.code?'sel':'')} onClick={()=>p.setCare(x.code)}><b>{x.title}</b><div className="small muted">{x.description}</div></button>)}<p className="small muted">Фото места добавлять не нужно. После визита исполнитель загрузит обязательные фото ДО/ПОСЛЕ.</p></div>
 <div className="card"><div className="cardhead"><h3>История</h3><span className="status">Фото ДО/ПОСЛЕ</span></div><div className="timeline">{p.orders.map(o=><div className="event" key={o.id}><strong>{o.service} · {money(o.amount)}</strong><span className="small muted">{o.date} · {STATUS[o.status]}</span></div>)}</div></div>
 <div className="card"><div className="cardhead"><h3>Что будет дальше</h3><span className="status green">Без лишних звонков</span></div><p className="muted">После заказа мы подтверждаем стоимость, назначаем исполнителя, сохраняем фотоотчёт и переносим дату последнего ухода в историю места.</p></div></section>
}

function ExecutorView({notice}:{notice:(x:string)=>void}){
 const[step,setStep]=useState<'before'|'start'|'after'|'review'>('before'),[before,setBefore]=useState<File|null>(null),[after,setAfter]=useState<File|null>(null)
 return <section className="grid"><div className="card"><div className="label">Сегодня</div><div className="name">Мария Ивановна</div><div className="muted">Клещихинское · сектор 24 · ряд 8 · место 17</div><div className="meta"><div><span className="label">Услуга</span><b>Полный уход</b></div><div><span className="label">Цена</span><b>{money(4290)}</b></div><div><span className="label">Этап</span><b>{step==='before'?'Фото ДО':step==='start'?'В работе':step==='after'?'Фото ПОСЛЕ':'Проверка'}</b></div></div><div className="executor"><label className="upload">Фото ДО<input hidden type="file" accept="image/*" capture="environment" onChange={e=>setBefore(e.target.files?.[0]??null)}/><div className="small">{before?.name??'Сделать или выбрать фото'}</div></label><label className="upload">Фото ПОСЛЕ<input hidden type="file" accept="image/*" capture="environment" onChange={e=>setAfter(e.target.files?.[0]??null)}/><div className="small">{after?.name??'Появится после работы'}</div></label></div><div className="actions">{step==='before'&&<button className="primary" disabled={!before} onClick={()=>{setStep('start');notice('Фото ДО сохранено. Теперь можно начинать работу.')}}>Сохранить Фото ДО</button>}{step==='start'&&<button className="primary" onClick={()=>setStep('after')}>Начать работу</button>}{step==='after'&&<button className="primary" disabled={!after} onClick={()=>{setStep('review');notice('Фото ПОСЛЕ сохранено. Заказ передан на проверку.')}}>Сохранить Фото ПОСЛЕ</button>}{step==='review'&&<span className="status green">Готово к проверке</span>}</div></div><div className="card"><h3>Правило работы</h3><div className="timeline"><div className="event"><strong>1. Фото ДО</strong><span className="small muted">Фиксируем состояние места до начала работ.</span></div><div className="event"><strong>2. Работа</strong><span className="small muted">Выполняем только согласованный объём.</span></div><div className="event"><strong>3. Фото ПОСЛЕ</strong><span className="small muted">Клиент получает доказательство выполненной работы.</span></div></div></div></section>
}

function AdminView({orders}:{orders:Order[]}){
 return <section><div className="metricgrid"><div className="metric"><span className="label">Всего</span><b>{orders.length}</b></div><div className="metric"><span className="label">В работе</span><b>{orders.filter(x=>['assigned','before_photos','in_progress','after_photos'].includes(x.status)).length}</b></div><div className="metric"><span className="label">Завершено</span><b>{orders.filter(x=>x.status==='completed').length}</b></div></div><div className="card" style={{marginTop:12}}><div className="cardhead"><h3>Очередь</h3><span className="status">Контроль исполнителей</span></div>{orders.map(o=><div className="order" key={o.id}><div className="orderrow"><div><b>{o.id}</b><div className="small muted">{o.memorial} · {o.service}</div></div><span className={'status '+(o.status==='completed'?'green':'')}>{STATUS[o.status]}</span></div></div>)}</div></section>
}
