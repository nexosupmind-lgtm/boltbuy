/* Tenant identity. Missing identity uses neutral UI; never another business's assets. */
(()=>{'use strict';
const slug=new URLSearchParams(location.search).get('tenant')||'salgaditos',legacy=slug==='salgaditos';
let list=[];try{list=JSON.parse(localStorage.getItem('bolt_tenants_v1')||'[]')}catch{}
const cached=list.find(x=>x.slug===slug)||{};
const t=window.BOLT_TENANT={slug,name:cached.name||slug,owner:cached.owner||'',primary:cached.primary||'#475569',background:cached.background||'#0f172a',logo:cached.logo||'',tagline:cached.tagline||'',plan:cached.plan||''};
const imageURL=s=>/^https:\/\//.test(s||'')||/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(s||'');
function apply(){
 const color=/^#[0-9a-f]{6}$/i.test(t.primary)?t.primary:'#475569',bg=/^#[0-9a-f]{6}$/i.test(t.background)?t.background:'#0f172a';
 for(const key of ['--red','--accent','--brand-primary'])document.documentElement.style.setProperty(key,color);document.documentElement.style.setProperty('--navy',bg);
 document.title=t.name+' • '+(location.pathname.includes('cliente')?'Loja':'Gestão');
 document.querySelectorAll('.brand-text strong,.brand strong').forEach(e=>e.textContent=t.name);
 document.querySelectorAll('.brand-avatar img,.brand img,.banner-mark img,.splash img,.shophero img,.hero img').forEach(img=>{if(imageURL(t.logo)){img.src=t.logo;img.hidden=false}else if(!legacy){img.removeAttribute('src');img.hidden=true}});
 if(!legacy){const style=document.getElementById('bolt-neutral-style')||document.head.appendChild(Object.assign(document.createElement('style'),{id:'bolt-neutral-style'}));style.textContent=':root{--red:'+color+';--accent:'+color+';--brand-primary:'+color+';--navy:'+bg+'}.splash,.sidebar,.shophead,.shophero{background:'+bg+'!important}.banner-zone,.hero{background:linear-gradient(120deg,'+bg+','+color+')!important}.splash-glow{display:none}.hero-cta,.btn.red{background:'+color+'!important}';
  const text=(sel,value)=>document.querySelectorAll(sel).forEach(e=>e.textContent=value);
  text('.topbar h1','Bem-vindo ao '+t.name);text('.topbar > div > p',t.tagline);text('.hero h2',t.name);text('.hero > div > p','Gestão do estabelecimento');text('.banner-kicker',t.name);text('.shophero .hero-copy h2',t.tagline||t.name);text('.splash span',t.name);
 }
 const a=document.querySelector('.top-actions a[href^="cliente.html"]');if(a)a.href='cliente.html?tenant='+encodeURIComponent(slug);
 const icon=document.querySelector('link[rel="icon"]');if(icon&&!legacy){if(imageURL(t.logo))icon.href=t.logo;else icon.removeAttribute('href')}
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',bg);
}
document.addEventListener('DOMContentLoaded',async()=>{apply();try{
 const cfg=window.BOLT_CONFIG;if(!cfg||!window.supabase)return;
 const sb=window.BOLT_SUPABASE||window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
 const r=await sb.from('bolt_tenants').select('id,name,owner_name,primary_color,background_color,logo_url,tagline,plan').eq('slug',slug).single();if(r.error||!r.data)throw Error('Identidade da empresa indisponível.');
 Object.assign(t,{name:r.data.name,owner:r.data.owner_name||'',primary:r.data.primary_color||'#475569',background:r.data.background_color||'#0f172a',logo:r.data.logo_url||'',tagline:r.data.tagline||'',plan:r.data.plan});apply();
 const storefront=await sb.from('bolt_delivery_storefronts').select('settings').eq('tenant_id',r.data.id).maybeSingle();
 if(!storefront.error&&storefront.data){const c=storefront.data.settings||{},d=load();for(const k of ['bannerTitle','bannerSubtitle','promotions'])if(k in c)d[k]=c[k];if('avatar' in c)d.storeAvatar=c.avatar;save(d);
  if(imageURL(c.avatar))document.querySelectorAll('.brand-avatar img').forEach(e=>{e.src=c.avatar;e.hidden=false});
  if(imageURL(c.banner)){const e=document.querySelector('.banner-zone');if(e){e.style.setProperty('background-image','linear-gradient(90deg,#0f172acc,#0f172a44),url("'+c.banner+'")','important');e.style.backgroundSize='cover';e.style.backgroundPosition='center'}}
  if(c.cta)document.querySelectorAll('.hero-cta').forEach(e=>e.textContent=c.cta);
  if(typeof renderPromos==='function')renderPromos();if(typeof renderShop==='function')renderShop();
 }
 window.dispatchEvent(new Event('bolt-tenant-ready'));
 }catch(e){console.warn('BOLT: '+e.message)}
});
})();

document.addEventListener('DOMContentLoaded',()=>{
const p=JSON.parse(localStorage.getItem('bolt_plans_v2')||'null')||[];
const current=p.find(x=>x.name===window.BOLT_TENANT.plan);
if(!location.pathname.includes('admin.html'))return;
const mappings={pdv:'pos',products:'products',orders:'orders',ifood:'platform',reports:'reports',banners:'settings',customers:'customers',stock:'stock'};
const blocked=current?Object.entries(mappings).filter(([f])=>!current.features.includes(f)).map(([,id])=>id):[];
const lock=()=>{
document.querySelectorAll('.menu button,.menu a').forEach(el=>{let handler=el.getAttribute('onclick')||'';if(blocked.some(id=>handler.includes("'"+id+"'"))) {el.style.opacity='.35';el.title='Não incluído no plano '+current.name;el.onclick=(ev)=>{ev.preventDefault();alert('Recurso indisponível no plano '+current.name)};}});
};
lock();

});
