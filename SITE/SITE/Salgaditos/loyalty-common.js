
const loyaltyDefault={enabled:true,target:5,reward:10};
function getLoyalty(d){return {...loyaltyDefault,...(d.loyalty||{})}}
function normPhone(v){return String(v||'').replace(/\D/g,'')}
function validCoupon(d,code,subtotal,phone){
 const c=(d.coupons||[]).find(x=>x.code===String(code||'').trim().toUpperCase());
 if(!c)return {error:'Cupom não encontrado.'};
 if(!c.active)return {error:'Cupom desativado.'};
 if(c.expires&&new Date(c.expires+'T23:59:59').getTime()<Date.now())return {error:'Cupom expirado.'};
 if(subtotal<Number(c.min||0))return {error:'Pedido mínimo: '+money(c.min)};
 if(c.limit>0&&Number(c.used||0)>=c.limit)return {error:'Cupom esgotado.'};
 if(c.loyaltyPhone&&c.loyaltyPhone!==normPhone(phone))return {error:'Recompensa vinculada a outro telefone.'};
 if(c.loyaltyPhone&& (d.orders||[]).some(o=>o.coupon===c.code&&o.status!=='cancelado'))return {error:'Recompensa já utilizada.'};
 let discount=c.type==='percent'?subtotal*Number(c.value)/100:Number(c.value);
 return {coupon:c,discount:Math.round(Math.min(subtotal,Math.max(0,discount))*100)/100};
}
function eligibleOrders(d,phone){const key=normPhone(phone);return (d.orders||[]).filter(o=>normPhone(o.phone)===key&&key.length>=10&&['entregue','concluido'].includes(o.status)&&o.channel==='Site'&&!o.loyaltyRewardRedeemed)}
function loyaltyInfo(d,phone){const cfg=getLoyalty(d),orders=eligibleOrders(d,phone);return {cfg,count:orders.length,progress:orders.length%cfg.target,available:Math.floor(orders.length/cfg.target)}}
