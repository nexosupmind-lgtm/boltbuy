/* Interaction feedback only; persistence and permissions remain in their owners. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const admin = document.body.classList.contains('buy-admin-app');
  if (!admin && !document.body.classList.contains('delivery-shop')) return;
  const animate = (element, frames, duration = 300) => {
    if (!reduced.matches && element?.animate) element.animate(frames, {duration, easing:'cubic-bezier(.2,.8,.2,1)'});
  };
  // Shop buttons already receive touch feedback from buy-delight.js.
  if (admin) document.addEventListener('click', event => {
    const button = event.target.closest('button,.btn');
    if (!button || button.disabled) return;
    animate(button, [{scale:1},{scale:.95},{scale:1}], 240);
  });
  const root = document.querySelector(admin ? '.main' : '.shopbody');
  if (root) new MutationObserver(records => {
    for (const record of records) {
      const target = record.target;
      if (record.oldValue?.split(' ').includes('hide') && !target.classList.contains('hide')) {
        animate(target, [{opacity:.4,translate:'0 10px'},{opacity:1,translate:'0 0'}]);
      }
    }
  }).observe(root, {subtree:true,attributes:true,attributeFilter:['class'],attributeOldValue:true});
  if (admin) {
    const markToast = () => {
      const toast = document.getElementById('toast');
      if (toast && !toast.hasAttribute('role')) {
        toast.setAttribute('role','status');
        toast.setAttribute('aria-live','polite');
        toast.setAttribute('aria-atomic','true');
      }
    };
    markToast();
    new MutationObserver(markToast).observe(document.body,{childList:true});
    window.addEventListener('buy-product-saved', () => {
      const form = document.getElementById('productForm');
      animate(form, [{opacity:.65},{opacity:1}], 350);
      const panel = form?.closest('.panel');
      if (panel && !reduced.matches) {
        panel.classList.remove('buy-save-success');
        void panel.offsetWidth;
        panel.classList.add('buy-save-success');
        setTimeout(() => panel.classList.remove('buy-save-success'),700);
      }
    });
  }
})();

/* Customer details are local to this storefront, never a substitute for authentication. */
(() => {
 if(!document.body.classList.contains('delivery-shop'))return;
 const dialog=document.getElementById('buy-profile'),form=document.getElementById('buy-profile-form'),open=document.getElementById('buy-profile-open');
 if(!dialog||!form||!open)return;
 const key='buy_customer_profile_'+(new URLSearchParams(location.search).get('tenant')||'salgaditos');
 const fields=['customer','phone','address'],status=document.getElementById('buy-profile-status');
 let remembered=false;
 try{
  const saved=JSON.parse(localStorage.getItem(key)||'null');
  if(saved&&typeof saved==='object'){
   for(const name of fields){const target=document.getElementById(name);if(target&&!target.value&&typeof saved[name]==='string')target.value=saved[name].slice(0,name==='address'?500:name==='phone'?30:120);}
   remembered=true;
  }
 }catch{}
 open.addEventListener('click',()=>{
  for(const name of fields)form.elements[name].value=document.getElementById(name)?.value||'';
  form.elements.remember.checked=remembered;status.textContent='';dialog.showModal();
 });
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 form.addEventListener('submit',e=>{
  e.preventDefault();
  const values=Object.fromEntries(fields.map(name=>[name,form.elements[name].value.trim()]));
  if(!values.customer||values.phone.replace(/\D/g,'').length<10){status.textContent='Informe seu nome e um WhatsApp com DDD.';return;}
  for(const name of fields){const target=document.getElementById(name);if(target){target.value=values[name];target.dispatchEvent(new Event('input',{bubbles:true}));}}
  try{
   if(form.elements.remember.checked)localStorage.setItem(key,JSON.stringify(values));else localStorage.removeItem(key);
   remembered=form.elements.remember.checked;
   status.textContent=remembered?'Dados salvos neste aparelho.':'Dados atualizados para seu pedido.';
  }catch{status.textContent='Dados aplicados ao pedido, mas não foi possível lembrá-los neste aparelho.';}
 });
})();
