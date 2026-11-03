/* Shared install experience and support. No private state is cached by the service worker. */
(()=>{'use strict';
const q=new URLSearchParams(location.search),cleanPath=location.pathname.replace(/\/+$/,'').replace(/\.html$/,'')||'/',path=({'/admin':'/Salgaditos/admin','/shop':'/Salgaditos/cliente'}[cleanPath]||cleanPath),master=document.documentElement.dataset.boltApp==='master'||['/','/index'].includes(path),family=path==='/family',member=path==='/member';
const product=master?'master':family||path.startsWith('/Boltclass')?'class':member||path.startsWith('/Boltchurch')?'church':path.includes('/Salgaditos/')?'buy':q.get('product');
if(!['master','buy','class','church'].includes(product))return;
const surface=master?'master':family?'family':member?'member':product==='buy'&&path.endsWith('/cliente')?'consumer':'admin',slug=product==='buy'?(q.get('tenant')||'salgaditos'):q.get('slug');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const face=()=>'<svg class="bolt-shared-face" viewBox="0 0 1584 1068" aria-hidden="true"><defs><clipPath id="bolt-shared-cut"><path clip-rule="evenodd" d="M0 0H1584V1068H0Z M450 350H680V725H450Z M905 350H1135V725H905Z"/></clipPath></defs><image href="/Boltclass/assets/bolt-avatar.png" width="1584" height="1068" clip-path="url(#bolt-shared-cut)"/><g class="bolt-shared-eyes" fill="white"><rect x="472" y="376" width="185" height="327" rx="92"/><rect x="926" y="376" width="186" height="327" rx="93"/></g></svg>';
async function session(){
 if(surface==='family'||surface==='member'){const cfg=window.BOLT_CONFIG||{};const sb=window.supabase?.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{storageKey:(surface==='family'?'bolt-family-session-':'bolt-church-member-')+slug,detectSessionInUrl:false}});return (await sb?.auth.getSession())?.data?.session}
 const sb=product==='class'||product==='church'?window.BOLT_WORKSPACE?.client():window.BOLT_SUPABASE;return (await sb?.auth.getSession())?.data?.session;
}
async function api(method,body){const s=await session();const r=await fetch('/api/platform?action=support'+(method==='GET'?'&product='+product+'&slug='+encodeURIComponent(slug)+'&source='+surface:''),{method,headers:{'content-type':'application/json',...(s?{authorization:'Bearer '+s.access_token}:{})},...(body?{body:JSON.stringify({...body,product,slug,source:surface})}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível confirmar o chamado.');return data}
function support(){
 if(document.getElementById('bolt-support-dialog'))return;
 const dialog=document.createElement('dialog');dialog.id='bolt-support-dialog';dialog.className='bolt-shell-dialog';dialog.innerHTML=`<header><div><small>ATENDIMENTO BOLT</small><h2>Como podemos ajudar?</h2></div><button type="button" data-close aria-label="Fechar suporte">×</button></header><p>Seu chamado será encaminhado à equipe BOLT com a identificação deste cliente.</p><form id="bolt-support-form"><label>Seu nome<input name="name" required maxlength="120" autocomplete="name"></label><label>E-mail ou WhatsApp<input name="contact" required maxlength="180" autocomplete="email"></label><label>Assunto<input name="subject" required minlength="3" maxlength="120"></label><label>Mensagem<textarea name="message" required minlength="10" maxlength="3000" rows="4"></textarea></label><button type="submit">Enviar chamado</button></form><p id="bolt-support-status" role="status"></p><div id="bolt-support-history"></div>`;document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});dialog.showModal();
 const status=dialog.querySelector('#bolt-support-status'),form=dialog.querySelector('form'),history=dialog.querySelector('#bolt-support-history');
 const states={open:'Aberto',in_progress:'Em atendimento',resolved:'Resolvido',closed:'Encerrado'};
 async function load(){if(surface==='consumer')return;try{const s=await session();if(!s?.user)return;if(s?.user){form.elements.name.value=s.user.user_metadata?.full_name||'';form.elements.contact.value=s.user.email||''}const d=await api('GET');history.innerHTML='<h3>Meus chamados</h3>'+d.tickets.map(t=>`<article><strong>${esc(t.subject)}</strong><small>${esc(states[t.status])} · ${new Date(t.created_at).toLocaleDateString('pt-BR')}</small><p>${esc(t.response||'Aguardando atendimento.')}</p></article>`).join('')}catch(e){status.textContent=e.message}}
 form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;status.textContent='Enviando…';try{const d=await api('POST',Object.fromEntries(new FormData(form)));form.reset();status.textContent='Chamado enviado. Protocolo: '+d.id;if(surface!=='consumer'&&(await session())?.user)await load()}catch(err){status.textContent=err.message}finally{b.disabled=false}};void load();
}
window.BOLT_OPEN_SUPPORT=support;
function setup(){
 document.documentElement.dataset.boltProduct=product;
 if(!document.querySelector('link[href="/bolt-shell.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/bolt-shell.css';document.head.append(css);}
 if(master||slug){document.querySelectorAll('link[rel="manifest"]').forEach(e=>e.remove());const manifest=document.createElement('link');manifest.rel='manifest';manifest.href='/api/app-manifest?product='+product+'&surface='+surface+(slug?'&slug='+encodeURIComponent(slug):'');document.head.append(manifest);const icon=document.createElement('link');icon.rel='apple-touch-icon';icon.href='/assets/apps/'+product+'-192.png';document.head.append(icon);
 if(family&&slug){
  const branded=document.createElement('img');
  branded.onload=()=>{
   try{
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=192;
    canvas.getContext('2d').drawImage(branded,0,0,192,192);
    icon.href=canvas.toDataURL('image/png');
   }catch{}
  };
  branded.src='/api/family-icon?slug='+encodeURIComponent(slug);
 }
 }
 for(const [name,content]of [['theme-color','#0b1020'],['apple-mobile-web-app-capable','yes'],['apple-mobile-web-app-status-bar-style','black-translucent']]){if(!document.querySelector('meta[name="'+name+'"]')){const m=document.createElement('meta');m.name=name;m.content=content;document.head.append(m)}}
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
 let deferred=null;const install=document.createElement('button');install.type='button';install.className='bolt-install';install.textContent='Instalar aplicativo';install.hidden=true;document.body.append(install);
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;install.hidden=false});window.addEventListener('appinstalled',()=>{install.hidden=true;deferred=null});install.onclick=async()=>{if(deferred){await deferred.prompt();await deferred.userChoice;install.hidden=true;deferred=null}};
 const online=document.createElement('div');online.className='bolt-connection';online.setAttribute('role','status');online.textContent='Sem conexão · Aguarde para salvar alterações.';document.body.append(online);const update=()=>online.hidden=navigator.onLine;window.addEventListener('online',update);window.addEventListener('offline',update);update();
 let help=null;
 if(!master&&slug&&!q.has('preview')){help=document.createElement('button');help.type='button';help.className='bolt-help-trigger';help.textContent='Suporte';help.onclick=support;document.body.append(help);}
 function placeSupport(){
  if(!help)return;
  const locked=document.documentElement.classList.contains('bolt-locked');
  const host=document.querySelector('#bolt-auth-root:not([hidden]) .bolt-login-bottom, #bolt-auth-root:not([hidden]) .bolt-master-card, .member-login, .card.login, [data-bolt-login-card]')||(path==='/portal'?document.querySelector('main'):null);
  const login=!!host;
  const cls=login?'bolt-login-help':'bolt-help-trigger';if(help.className!==cls)help.className=cls;
  const text=login?'Precisa de ajuda? Fale com o suporte':'Suporte';if(help.textContent!==text)help.textContent=text;
  const parent=host||document.body;if(help.parentElement!==parent)parent.append(help);
  const waiting=family&&!document.querySelector('.shell')&&!host||member&&!document.querySelector('.member-shell')&&!host;
  help.hidden=locked&&!host||waiting||(product==='class'&&(family||surface==='admin')&&!login);
  const universal=document.querySelector('.bolt-universal-assistant');if(universal)universal.hidden=login||waiting;
  if(login)return;
  const anchor=document.querySelector('.assistant-fab, #mascotWidget, .bolt-universal-assistant');
  const rect=anchor?.getBoundingClientRect();
  const right=rect&&rect.width&&rect.left>150?Math.max(12,window.innerWidth-rect.left+12):20;
  const dock=document.querySelector('.mobile-dock, .mobile-bottomnav');const dockRect=dock?.getBoundingClientRect();
  const floor=dockRect?.height&&dockRect.top<window.innerHeight?window.innerHeight-dockRect.top+12:20;
  const bottom=Math.max(floor,rect?.height?window.innerHeight-rect.bottom:100);
  help.style.setProperty('--bolt-help-right',right+'px');help.style.setProperty('--bolt-help-bottom',bottom+'px');
 }
 window.addEventListener('resize',placeSupport);window.addEventListener('scroll',placeSupport,{passive:true});
 const applyFace=()=>{const m=document.getElementById('boltFace');if(m&&!m.dataset.shared){m.dataset.shared='1';m.innerHTML=face();m.classList.add('bolt-face-button');m.setAttribute('aria-label','Conversar com Bolt')}
 const delivery=document.getElementById('mascotToggle');if(delivery&&!delivery.dataset.shared){delivery.dataset.shared='1';delivery.innerHTML=face()+'<span>Bolt</span>';delivery.classList.add('bolt-face-button');document.querySelector('#assistantPanel strong')?.replaceChildren(document.createTextNode('Bolt'));const actions=document.querySelector('#assistantPanel .assistant-quick');if(actions){const b=document.createElement('button');b.textContent='Solicitar suporte';b.onclick=support;actions.append(b)}document.getElementById('developerContact')?.remove()}};
 applyFace();new MutationObserver(()=>{applyFace();placeSupport()}).observe(document.body,{childList:true,subtree:true});
 new MutationObserver(placeSupport).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 if(!master&&product!=='class'&&!document.getElementById('mascotToggle')&&path!=='/portal'){const b=document.createElement('button');b.className='bolt-universal-assistant bolt-face-button';b.type='button';b.innerHTML=face()+'<span>Bolt</span>';b.setAttribute('aria-label','Bolt · ajuda e suporte');b.onclick=support;document.body.append(b)}
 placeSupport();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
