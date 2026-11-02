/* Aplica a identidade configurada no Studio à vitrine existente. */
(()=>{'use strict';const slug=new URLSearchParams(location.search).get('tenant')||'salgaditos';let c={};try{c=JSON.parse(localStorage.getItem('bolt_studio_'+slug)||'{}')}catch{};const t=window.BOLT_TENANT||{};
function apply(){let isShop=location.pathname.includes('cliente.html');if(!isShop)return;
const set=(sel,text)=>document.querySelectorAll(sel).forEach(el=>{if(text)el.textContent=text});
set('#bannerTitle',c.bannerTitle);set('#bannerSubtitle',c.bannerSubtitle);set('.hero-cta',c.cta);
if(c.banner){let el=document.querySelector('.banner-zone');if(el){el.style.backgroundImage=`linear-gradient(90deg,#080f24dc,#080f2477),url("${c.banner}")`;el.style.backgroundSize='cover';el.style.backgroundPosition='center'}}
if(c.avatar)document.querySelectorAll('.brand-avatar img').forEach(e=>e.src=c.avatar);
if(t.logo)document.querySelectorAll('.shophero img,.banner-mark img,.splash img').forEach(e=>e.src=t.logo);
if(t.tagline){set('.shophero .hero-copy h2',t.tagline);set('.splash span',t.tagline)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);else apply();
})();
