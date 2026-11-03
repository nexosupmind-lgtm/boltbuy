/* Salgaditos v12: uploads de imagens em modo de testes local */
(()=>{
const $=id=>document.getElementById(id);
const photo=(file,maxEdge=1000)=>window.BOLT_UPLOAD.dataURL(file,{maxEdge,maxBytes:300000});
const preview=(src)=>src?`<img src="${src}" alt="Foto cadastrada" style="max-width:190px;max-height:110px;object-fit:cover;border-radius:12px;margin-top:9px">`:'';
let images=[],avatar=null;
function setup(){const d=load();avatar=d.storeAvatar||null;$('avatarMediaPreview').innerHTML=preview(avatar);images=(d.promotions||[]).map(p=>p.image||null);draw()}
function draw(){const lines=$('vitrinePromos').value.split('\n').filter(x=>x.trim()).slice(0,8);$('promoImageInputs').innerHTML=lines.map((line,i)=>`<div class="media-upload-row"><b>Banner ${i+1}: ${line.split('|')[0].replace(/</g,'&lt;')}</b><input type="file" accept="image/*" data-promo="${i}"><div id="promoPreview${i}">${preview(images[i])}</div><button type="button" class="btn small" data-remove="${i}">Remover foto</button></div>`).join('')||'<p class="hint">Escreva uma promoção acima para adicionar uma foto.</p>'}
$('vitrinePromos').addEventListener('input',draw);
$('promoImageInputs').addEventListener('change',async e=>{if(!e.target.matches('[data-promo]'))return;const i=+e.target.dataset.promo;try{images[i]=await photo(e.target.files[0]);$('promoPreview'+i).innerHTML=preview(images[i])}catch(err){alert(err.message)}});
$('promoImageInputs').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;const i=+b.dataset.remove;images[i]=null;$('promoPreview'+i).innerHTML=''});
$('storeAvatarFile').addEventListener('change',async e=>{if(!e.target.files[0])return;try{avatar=await photo(e.target.files[0],500);$('avatarMediaPreview').innerHTML=preview(avatar)}catch(err){alert(err.message)}});
$('removeAvatar').onclick=()=>{avatar=null;$('storeAvatarFile').value='';$('avatarMediaPreview').innerHTML=''};
$('vitrineForm').addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();const d=load();d.bannerTitle=$('vitrineTitle').value.trim();d.bannerSubtitle=$('vitrineSubtitle').value.trim();d.storeAvatar=avatar;d.promotions=$('vitrinePromos').value.split('\n').filter(x=>x.trim()).slice(0,8).map((line,i)=>{const [title,subtitle,emoji]=line.split('|').map(x=>x.trim());return {title:title||'Promoção',subtitle:subtitle||'Confira nossas ofertas',emoji:emoji||'🥟',image:images[i]||null}});try{save(d);notify('Fotos e vitrine salvas!');setup()}catch(err){alert('Espaço do navegador insuficiente. Use fotos menores.')}},true);
setup();
})();