
navItems.splice(navItems.findIndex(x=>x[0]==='settings'),0,['loyalty','🎟️','Cupons & Fidelidade']);
const oldRender=render;render=function(){oldRender();if(page==='loyalty')renderLoyaltyAdmin()};
function renderLoyaltyAdmin(){
 const d=load(),l=getLoyalty(d);
 el('loyaltyEnabled').value=String(l.enabled);el('loyaltyTarget').value=l.target;el('loyaltyReward').value=l.reward;
 el('couponList').innerHTML='<h4>Cupons cadastrados</h4>'+(d.coupons||[]).map(c=>`<div class="cartline"><div><b>${safe(c.code)}</b> · ${c.type==='percent'?c.value+'%':money(c.value)}<br><small>${c.used||0} usos${c.limit?' / '+c.limit:''} · mínimo ${money(c.min)} · ${c.expires||'sem validade'} · ${c.active?'Ativo':'Inativo'}</small></div><button class="btn small" onclick="toggleCoupon('${safe(c.code)}')">${c.active?'Desativar':'Ativar'}</button></div>`).join('')||'<p>Nenhum cupom.</p>';
 const finished=d.orders.filter(o=>o.channel==='Site'&&['entregue','concluido'].includes(o.status));
 el('loyaltyStats').innerHTML=`<p class="hint">Pedidos online concluídos: <b>${finished.length}</b> · Meta: <b>${l.target}</b> compras · Recompensa: <b>${money(l.reward)}</b></p>`;
}
function toggleCoupon(code){let d=load(),c=(d.coupons||[]).find(x=>x.code===code);if(c){c.active=!c.active;save(d)}}
el('couponForm').onsubmit=e=>{
 e.preventDefault();let d=load(),code=el('cpCode').value.trim().toUpperCase(),type=el('cpType').value,value=Number(el('cpValue').value),min=Number(el('cpMin').value||0),limit=Number(el('cpLimit').value||0),expires=el('cpExpiry').value;
 if(!/^[A-Z0-9_-]{3,24}$/.test(code)||value<=0||min<0||limit<0||!Number.isInteger(limit)||(type==='percent'&&value>100))return notify('Confira código, valor e limites do cupom.');
 d.coupons=d.coupons||[];
 const previous=d.coupons.find(c=>c.code===code);
 if(previous&&previous.loyaltyPhone)return notify('Código reservado para recompensa de fidelidade.');
 const next={code,type,value,min,limit,expires,active:true,used:previous?.used||0};
 if(previous)Object.assign(previous,next);else d.coupons.push(next);
 save(d);el('couponForm').reset();notify('Cupom '+code+' salvo.');
};
el('loyaltyForm').onsubmit=e=>{
 e.preventDefault();const d=load(),target=Number(el('loyaltyTarget').value),reward=Number(el('loyaltyReward').value);
 if(!Number.isInteger(target)||target<2||target>50||reward<=0)return notify('Informe meta e recompensa válidas.');
 d.loyalty={enabled:el('loyaltyEnabled').value==='true',target,reward};save(d);notify('Programa de fidelidade salvo.');
};
showPage('dashboard');

const originalChangeStatus=changeStatus;
changeStatus=function(id,status){
 const before=load().orders.find(o=>o.id===id);
 const wasFinished=before&&['entregue','concluido'].includes(before.status);
 originalChangeStatus(id,status);
 if(wasFinished||!['entregue','concluido'].includes(status))return;
 const d=load(),o=d.orders.find(x=>x.id===id),cfg=getLoyalty(d);
 if(!cfg.enabled||!o||o.channel!=='Site'||normPhone(o.phone).length<10)return;
 const phone=normPhone(o.phone),count=eligibleOrders(d,phone).length;
 if(count>0&&count%cfg.target===0){
  d.coupons=d.coupons||[];
  const code='PREMIO-'+o.id.replace(/[^a-z0-9]/gi,'').slice(-9).toUpperCase();
  if(!d.coupons.some(c=>c.code===code)){
   d.coupons.push({code,type:'fixed',value:cfg.reward,min:0,limit:1,used:0,active:true,expires:'',loyaltyPhone:phone});
   save(d);notify('🏆 Recompensa liberada para '+o.customer+': '+code);
  }
 }
};
