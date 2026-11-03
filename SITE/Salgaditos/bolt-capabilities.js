(()=>{'use strict';
let features=null,attempt=null;
const mapping={pos:'pdv',products:'products',orders:'orders',platform:'ifood',reports:'reports',customers:'customers',coupons:'banners',loyalty:'customers',stock:'stock'};
const original=window.showPage;window.showPage=function(id,...args){const feature=mapping[id];if(features&&feature&&!features.includes(feature)){alert('Este módulo não está incluído no plano contratado. Solicite suporte para alterar seu plano.');return}return original.call(this,id,...args)};
function hide(){if(!features)return;document.querySelectorAll('[data-page]').forEach(b=>{const f=mapping[b.dataset.page];b.hidden=!!f&&!features.includes(f);if(b.hidden)b.style.display='none'});}
async function load(){if(attempt)return;attempt=true;try{const s=(await window.BOLT_SUPABASE?.auth.getSession())?.data?.session;if(!s)return;const slug=new URLSearchParams(location.search).get('tenant')||'salgaditos',r=await fetch('/api/platform?action=capabilities&product=buy&slug='+encodeURIComponent(slug),{headers:{authorization:'Bearer '+s.access_token}});if(!r.ok)throw Error();features=(await r.json()).features;hide()}catch{const e=document.createElement('p');e.className='bolt-capability-error';e.textContent='Não foi possível atualizar os módulos do plano. Tente entrar novamente.';document.querySelector('.topbar')?.after(e)}finally{attempt=false}}
new MutationObserver(hide).observe(document.body,{childList:true,subtree:true});
const observer=new MutationObserver(()=>{if(!document.documentElement.classList.contains('bolt-locked'))void load()});observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
})();
