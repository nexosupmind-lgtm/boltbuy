/* Installation guidance and explicit, per-store notification subscriptions. */
(() => {
 const admin=document.body.classList.contains('buy-admin-app');
 if(!admin&&!document.body.classList.contains('delivery-shop'))return;
 if(new URLSearchParams(location.search).has('preview'))return;
 const slug=new URLSearchParams(location.search).get('tenant')||'salgaditos';
 const audience=admin?'admin':'customer',prefKey='buy_push_enabled_'+audience+'_'+slug;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const enabled=()=>{try{return localStorage.getItem(prefKey)==='true';}catch{return false;}};
 const setEnabled=v=>localStorage.setItem(prefKey,String(v));
 const supported=()=>isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 let prompt=null,busy=false,lastReceipt=null;
 const readReceipts=()=>{try{return Object.values(JSON.parse(localStorage.getItem('bolt_buy_receipts_'+slug)||'{}')).filter(x=>typeof x.token==='string').slice(-20);}catch{return [];}};
 const receipts=()=>[...new Map([...readReceipts(),...(lastReceipt?[lastReceipt]:[])].map(x=>[x.id,x])).values()];
 const banner=document.createElement('aside');banner.className='buy-install-invite';
 banner.innerHTML='<div><strong>'+ (admin?'Receba novos pedidos no celular':'Sua loja favorita, a um toque')+'</strong><p>'+(admin?'Adicione o app à Tela de Início e permita as notificações para acompanhar seus pedidos.':'Adicione o app à Tela de Início e permita notificações para acompanhar cada etapa do pedido.')+'</p></div><button type="button">Instalar e ativar</button>';
 const host=document.querySelector(admin?'.main':'#homeView');host?.prepend(banner);
 if(!admin){const n=banner.cloneNode(true);document.getElementById('ordersView')?.prepend(n);n.querySelector('button').onclick=()=>openGuide();}
 const dialog=document.createElement('dialog');dialog.className='buy-install-guide';dialog.setAttribute('aria-labelledby','buy-install-title');
 dialog.innerHTML='<header><div><small>APP DA LOJA</small><h2 id="buy-install-title">Pedidos sempre por perto</h2></div><button type="button" data-close aria-label="Fechar">×</button></header><section><h3>1. Adicione à Tela de Início</h3><div data-instructions></div><button type="button" data-install>Instalar aplicativo</button></section><section><h3>2. Permita as notificações</h3><p>'+(admin?'Receba um aviso quando um novo pedido for confirmado no sistema.':'Receba avisos quando a loja confirmar, preparar e enviar seu pedido.')+'</p><button type="button" data-enable>Ativar notificações</button><button type="button" data-disable>Desativar avisos desta loja</button><p data-status role="status" aria-live="polite"></p></section><p class="buy-install-note">Os avisos dependem da sua conexão e das permissões do celular. Você pode continuar usando o site normalmente.</p>';
 document.body.append(dialog);
 const status=dialog.querySelector('[data-status]'),enable=dialog.querySelector('[data-enable]'),disable=dialog.querySelector('[data-disable]'),install=dialog.querySelector('[data-install]');
 function update(){
  const instructions=dialog.querySelector('[data-instructions]');
  instructions.innerHTML=standalone()?'<p>Este app já está aberto pela Tela de Início.</p>':ios?'<ol><li>Abra esta loja no Safari e toque em <strong>Compartilhar</strong> (quadrado com seta para cima).</li><li>Escolha <strong>Adicionar à Tela de Início</strong>. Se aparecer, mantenha <strong>Abrir como App</strong> ativado.</li><li>Toque em <strong>Adicionar</strong> e abra o novo ícone na Tela de Início.</li><li>Volte a este convite e ative as notificações.</li></ol><p>É necessário iOS 16.4 ou superior. Faça seus próximos pedidos pelo app instalado para receber os avisos nele.</p>':'<ol><li>Toque em <strong>Instalar aplicativo</strong>, se o botão estiver disponível.</li><li>Ou abra o menu do navegador e escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Abra o app e permita as notificações.</li></ol>';
  install.hidden=standalone()||!prompt;
  enable.disabled=busy||(ios&&!standalone())||!supported();
  disable.hidden=!enabled();disable.disabled=busy;
  if(ios&&!standalone())status.textContent='Primeiro adicione à Tela de Início e abra o app pelo ícone.';
  else if(!supported())status.textContent='Este navegador não oferece notificações push. Abra em um navegador compatível e atualizado.';
 }
 function openGuide(){update();if(!dialog.open)dialog.showModal();}
 banner.querySelector('button').onclick=openGuide;
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;update();});
 window.addEventListener('appinstalled',()=>{prompt=null;update();});
 install.onclick=async()=>{if(!prompt)return;await prompt.prompt();await prompt.userChoice;prompt=null;update();};
 const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));
 async function api(action,body={}){
  const headers={'content-type':'application/json'};
  if(admin){const session=(await window.BOLT_SUPABASE?.auth.getSession())?.data?.session;if(!session)throw Error('Entre no administrativo antes de ativar os avisos.');headers.authorization='Bearer '+session.access_token;}
  const r=await fetch('/api/buy-commerce?tenant='+encodeURIComponent(slug),{method:'POST',headers,body:JSON.stringify({action,audience,...body})});
  const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Não foi possível ativar. Tente novamente.'),{status:r.status});return data;
 }
 async function registration(){await navigator.serviceWorker.register('/sw.js',{scope:'/'});return await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('O app está atualizando. Aguarde e tente novamente.')),12000))]);}
 async function bind(){
  const key=await api('push-key'),reg=await registration();
  let sub=await reg.pushManager.getSubscription();
  const wanted=bytes(key.publicKey);
  if(sub?.options?.applicationServerKey){const current=new Uint8Array(sub.options.applicationServerKey);if(current.length!==wanted.length||current.some((x,i)=>x!==wanted[i]))throw Error('Este navegador já recebe avisos de outro app neste domínio. Use outro perfil de navegador para não interromper esses avisos.');}
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:wanted});
  const body={subscription:sub.toJSON(),publicKey:key.publicKey};
  if(admin){await api('push-subscribe',body);return 1;}
  let count=0,failed=null;
  for(const receipt of receipts()){
   try{await api('push-subscribe',{...body,token:receipt.token});count++;}
   catch(e){if(receipt.id===lastReceipt?.id)throw e;if(![403,404].includes(e.status))failed=e;}
  }
  if(failed)throw failed;
  return count;
 }
 enable.onclick=async()=>{
  if(busy||!supported()||ios&&!standalone())return;
  busy=true;update();status.textContent='Ativando…';
  try{
   // Permission is requested directly from this user gesture (required by iOS).
   const permission=await Notification.requestPermission();
   if(permission!=='granted')throw Error('Permissão não concedida. Ative as notificações deste app nas configurações do celular ou navegador.');
   const count=await bind();setEnabled(true);
   status.textContent=admin?'Pronto! Este aparelho receberá novos pedidos.':count?'Pronto! Você receberá as atualizações dos seus pedidos neste aparelho.':'Permissão ativada. Os próximos pedidos feitos aqui serão vinculados automaticamente aos avisos.';
  }catch(e){status.textContent=e.message;}finally{busy=false;update();}
 };
 disable.onclick=async()=>{
  if(busy)return;busy=true;update();
  try{
   const reg=await registration(),sub=await reg.pushManager.getSubscription();
   if(sub){if(admin)await api('push-unsubscribe',{subscription:sub.toJSON()});else for(const receipt of receipts()){try{await api('push-unsubscribe',{subscription:sub.toJSON(),token:receipt.token});}catch(e){if(![403,404].includes(e.status))throw e;}}}
   setEnabled(false);status.textContent='Avisos desta loja desativados neste aparelho.';
  }catch(e){status.textContent=e.message;}finally{busy=false;update();}
 };
 async function sync(){
  if(!enabled()||!supported()||Notification.permission!=='granted'||ios&&!standalone())return;
  try{await bind();}catch{status.textContent='Não foi possível confirmar os avisos. Toque em Ativar notificações para tentar novamente.';}
 }
 window.addEventListener('buy-order-confirmed',e=>{lastReceipt=e.detail?.receipt;void sync();});
 // Existing bell/alerts now open the same guide, rather than permission-only UI.
 window.askNotifications=openGuide;
 const alerts=document.getElementById('notifBtn');if(alerts)alerts.onclick=openGuide;
 // Server push owns background notifications; avoid duplicate local notifications.
 const foreground=window.pushForeground;
 window.pushForeground=(...args)=>{if(!enabled())foreground?.(...args);};
 void sync();
 function openOrders(){if(location.hash!=='#orders')return;if(admin){if(!document.documentElement.classList.contains('bolt-locked'))window.showPage?.('orders');}else window.view?.('orders');}
 openOrders();window.addEventListener('hashchange',openOrders);
 if(admin)new MutationObserver(openOrders).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
})();
