
let appliedCode='';
function customerReward(d,phone){
 const key=normPhone(phone);
 return (d.coupons||[]).find(c=>normPhone(c.loyaltyPhone)===key&&c.active&&!c.used&&!d.orders.some(o=>o.coupon===c.code&&o.status!=='cancelado'));
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
// Checkout is handled exclusively by buy-commerce after server confirmation.

renderShop();
