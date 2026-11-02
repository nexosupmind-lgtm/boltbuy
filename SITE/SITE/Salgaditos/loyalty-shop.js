
let appliedCode='';
function customerReward(d,phone){
 const key=normPhone(phone);
 return (d.coupons||[]).find(c=>c.loyaltyPhone===key&&c.active&&!c.used&&!d.orders.some(o=>o.coupon===c.code&&o.status!=='cancelado'));
}
function calculateDiscount(d,t){
 if(!appliedCode)return {discount:0};
 const result=validCoupon(d,appliedCode,t.subtotal,el('phone').value);
 return result.error?{discount:0,error:result.error}:result;
}
function applyCoupon(){
 const d=load(),code=el('couponCode').value.trim().toUpperCase(),t=totals(d),result=validCoupon(d,code,t.subtotal,el('phone').value);
 if(result.error){appliedCode='';el('couponFeedback').textContent=result.error;renderShop();return}
 appliedCode=code;el('couponFeedback').textContent='Cupom '+code+' aplicado: '+money(result.discount)+' de desconto!';renderShop();
}
const originalShopRender=renderShop;
renderShop=function(){
 originalShopRender();
 const d=load(),t=totals(d),discount=calculateDiscount(d,t);
 el('cartDiscount').textContent='− '+money(discount.discount||0);
 el('cartTotal').textContent=money(Math.max(0,t.subtotal+t.fee-(discount.discount||0)));
 if(discount.error)el('couponFeedback').textContent=discount.error;
 const phone=el('phone').value,cfg=getLoyalty(d),info=loyaltyInfo(d,phone),reward=customerReward(d,phone);
 el('loyaltyProgress').textContent=!cfg.enabled?'Programa de fidelidade indisponível.':normPhone(phone).length<10?'🏆 Informe seu WhatsApp para consultar seus pontos.':`🏆 ${info.progress} de ${cfg.target} compras concluídas para o próximo prêmio.${reward?' Você tem um prêmio! Use '+reward.code:''}`;
};
el('phone').addEventListener('input',()=>renderShop());
el('couponCode').addEventListener('input',()=>{if(el('couponCode').value.trim().toUpperCase()!==appliedCode)appliedCode=''});
const originalCheckout=el('checkout').onsubmit;
el('checkout').onsubmit=function(e){
 e.preventDefault();
 const d=load(),t=totals(d);
 if(!t.items.length)return notify('Adicione produtos ao carrinho.');
 const coupon=calculateDiscount(d,t);
 if(coupon.error)return notify(coupon.error);
 const id='S'+Date.now(),phone=normPhone(el('phone').value);
 if(phone.length<10)return notify('Informe um WhatsApp válido com DDD.');
 const o={id,date:stamp(),customer:el('customer').value.trim(),phone,address:el('mode').value==='delivery'?el('address').value.trim():'',mode:el('mode').value,channel:'Site',payment:el('payment').value,items:t.items.map(({p,qty})=>({id:p.id,name:p.name,qty,price:p.price})),subtotal:t.subtotal,fee:t.fee,discount:coupon.discount||0,coupon:coupon.coupon?.code||'',status:'recebido',history:[{status:'recebido',date:stamp()}]};
 if(!o.customer)return notify('Informe seu nome.');
 if(o.mode==='delivery'&&!o.address)return notify('Informe o endereço de entrega.');
 if(coupon.coupon){const current=(d.coupons||[]).find(c=>c.code===coupon.coupon.code);current.used=(current.used||0)+1}
 d.orders.push(o);save(d);saveIds([...myIds(),id]);cart={};appliedCode='';el('couponCode').value='';el('couponFeedback').textContent='';el('checkout').reset();seenStatus[id]='recebido';view('orders');notify('Pedido enviado! Acompanhe o status aqui.');
};
renderShop();
