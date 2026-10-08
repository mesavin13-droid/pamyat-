export default function PaymentReturn(){
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#f4f1e9'}}>
    <section style={{maxWidth:520,background:'#fffdf8',border:'1px solid #e2ddd1',borderRadius:20,padding:24}}>
      <div style={{letterSpacing:'.12em',fontWeight:800,fontSize:13}}>ПАМЯТЬ</div>
      <h1 style={{fontFamily:'Georgia,serif',fontWeight:500}}>Возвращение из оплаты</h1>
      <p style={{color:'#72776d',lineHeight:1.5}}>Статус заказа обновляется отдельно после подтверждения платежа. Можно вернуться в личный кабинет.</p>
      <a href="/" style={{display:'inline-block',background:'#3c5b47',color:'#fff',padding:'12px 15px',borderRadius:12,textDecoration:'none'}}>Вернуться в ПАМЯТЬ</a>
    </section>
  </main>
}
