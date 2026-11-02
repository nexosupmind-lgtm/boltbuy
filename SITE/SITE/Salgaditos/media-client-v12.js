/* Salgaditos v12: exibição das fotos do administrador */
(()=>{
function refresh(){const d=load();if(d.storeAvatar){document.querySelectorAll('.brand-avatar img').forEach(x=>x.src=d.storeAvatar)}else{document.querySelectorAll('.brand-avatar img').forEach(x=>x.src='assets/logo-transparente.png')}
const slides=document.querySelectorAll('#promoCarousel .promo-slide');(d.promotions||[]).forEach((p,i)=>{const slide=slides[i];if(!slide)return;slide.style.backgroundImage=p.image?`linear-gradient(90deg,rgba(4,13,28,.82),rgba(4,13,28,.2)),url("${p.image}")`:'';slide.style.backgroundSize=p.image?'cover':'';slide.style.backgroundPosition='center';const icon=slide.querySelector('.promo-icon');if(icon)icon.style.display=p.image?'none':''})}
const previous=window.renderPromos;if(typeof previous==='function'){window.renderPromos=function(){previous();refresh()}};
refresh();window.addEventListener('storage',e=>{if(e.key===KEY)refresh()});
})();