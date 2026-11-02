(()=>{const slug=new URLSearchParams(location.search).get('tenant')||'salgaditos';let list=[];try{list=JSON.parse(localStorage.getItem('bolt_tenants_v1')||'[]')}catch(e){}const t=list.find(x=>x.slug===slug)||{slug,name:slug,owner:'',primary:'#7759e8',background:'#101e37',logo:'',status:'Ativo'};window.BOLT_TENANT=t;document.documentElement.style.setProperty('--red',t.primary||'#E33443');document.documentElement.style.setProperty('--accent',t.primary||'#E33443');document.documentElement.style.setProperty('--brand-primary',t.primary||'#E33443');document.documentElement.style.setProperty('--navy',t.background||'#06172b');document.addEventListener('DOMContentLoaded',()=>{document.title=t.name+' • '+(location.pathname.includes('cliente')?'Peça agora':'Gestão');document.querySelectorAll('.brand-text strong,.brand strong').forEach(e=>e.textContent=t.name);document.querySelectorAll('.brand-avatar img,.brand img,.banner-mark img,.splash img,.shophero img,.hero img').forEach(e=>{if(t.logo)e.src=t.logo});const title=document.querySelector('#pageTitle');if(title)title.textContent='Bem-vindo ao '+t.name+'!';const link=document.querySelector('.top-actions a[href^="cliente.html"]');if(link)link.href='cliente.html?tenant='+encodeURIComponent(slug);});})();
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

document.addEventListener('DOMContentLoaded',()=>{
 const t=window.BOLT_TENANT||{}, color=t.primary||'#E33443', bg=t.background||'#06172b', name=t.name||'Salgaditos';
 const tagline=t.tagline||'Seu delivery favorito';
 const css=document.createElement('style');
 css.textContent=`
 :root{--red:${color};--accent:${color};--brand-primary:${color};--navy:${bg}}
 .splash{background:${bg}!important}
 .splash-glow{background:radial-gradient(circle,${color}55,transparent 70%)!important}
 .splash img{max-width:min(55vw,260px);max-height:230px;object-fit:contain;filter:drop-shadow(0 0 24px ${color}66)}
 .splash span{color:white!important}
 .shophead,.shophero{background-color:${bg}}
 .banner-zone{background:linear-gradient(125deg,${bg},${color}77)!important}
 .hero-cta,.btn.red,.floating-cart{background:${color}!important}
 `;
 document.head.appendChild(css);
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',bg);
 document.querySelectorAll('#splash img,.brand-avatar img,.shophero img,.banner-mark img,.brand img,.hero img').forEach(img=>{if(t.logo){img.src=t.logo;img.alt='Logo '+name}});
 document.querySelectorAll('.brand-text strong,.brand strong').forEach(el=>el.textContent=name);
 const splashText=document.querySelector('#splash span');if(splashText)splashText.textContent=tagline.toUpperCase();
 const kicker=document.querySelector('.banner-kicker');if(kicker)kicker.textContent='✦ BEM-VINDO À '+name.toUpperCase();
 const heroTitle=document.querySelector('.hero-copy h2');if(heroTitle)heroTitle.textContent=tagline;
 const heroSmall=document.querySelector('.brand-text small');if(heroSmall)heroSmall.textContent='Delivery • Retirada';
 const icon=document.querySelector('link[rel="icon"]');if(icon&&t.logo)icon.href=t.logo;
 if(t.logo){const apple=document.createElement('link');apple.rel='apple-touch-icon';apple.href=t.logo;document.head.appendChild(apple)}
 // Manifest generated per tenant for browsers that support data manifests.
 const manifest={name:name,short_name:name.slice(0,12),start_url:location.pathname+'?tenant='+encodeURIComponent(t.slug||'salgaditos'),display:'standalone',background_color:bg,theme_color:color,icons:t.logo?[{src:t.logo,sizes:'any',type:t.logo.startsWith('data:image/png')?'image/png':'image/svg+xml',purpose:'any'}]:[]};
 const manifestLink=document.querySelector('link[rel="manifest"]');if(manifestLink)manifestLink.href='data:application/manifest+json,'+encodeURIComponent(JSON.stringify(manifest));
});

/* V20: nome e identidade da empresa vêm do banco, não do navegador. */
document.addEventListener('DOMContentLoaded',async()=>{try{const c=window.BOLT_CONFIG;if(!c||!window.supabase)return;const sb=window.BOLT_SUPABASE||window.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey);const slug=new URLSearchParams(location.search).get('tenant')||'salgaditos';const {data,error}=await sb.from('bolt_tenants').select('name,primary_color,background_color,logo_url').eq('slug',slug).single();if(error||!data)throw Error(error?.message||'Empresa não encontrada');document.documentElement.style.setProperty('--brand-primary',data.primary_color||'#ef652c');document.documentElement.style.setProperty('--accent',data.primary_color||'#ef652c');document.documentElement.style.setProperty('--navy',data.background_color||'#101e37');document.querySelectorAll('.brand-text strong,.brand strong').forEach(e=>e.textContent=data.name);if(data.logo_url)document.querySelectorAll('.brand-avatar img,.brand img').forEach(e=>e.src=data.logo_url);}catch(e){console.warn('BOLT tenant:',e.message)}});
