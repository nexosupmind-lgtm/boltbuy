/* Installation guidance and explicit, per-store notification subscriptions. */
(() => {
 const admin=document.body.classList.contains('buy-admin-app');
 if(!admin&&!document.body.classList.contains('delivery-shop'))return;
 if(new URLSearchParams(location.search).has('preview'))return;
 const slug=(window.BOLT_ROUTE_TENANT||new URLSearchParams(location.search).get('tenant'))||'salgaditos';
 const audience=admin?'admin':'customer',prefKey='buy_push_enabled_'+audience+'_'+slug;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const enabled=()=>{try{return localStorage.getItem(prefKey)==='true';}catch{return false;}};
 const setEnabled=v=>localStorage.setItem(prefKey,String(v));
 const supported=()=>isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 let prompt=null,busy=false,lastReceipt=null,installed=standalone();
 const switches=[];
 const active=()=>enabled()&&supported()&&Notification.permission==='granted';
 const readReceipts=()=>{try{return Object.values(JSON.parse(localStorage.getItem('bolt_buy_receipts_'+slug)||'{}')).filter(x=>typeof x.token==='string').slice(-20);}catch{return [];}};
 const receipts=()=>[...new Map([...readReceipts(),...(lastReceipt?[lastReceipt]:[])].map(x=>[x.id,x])).values()];
 const banner=document.createElement('aside');banner.className='buy-install-invite';
 banner.innerHTML='<div><strong>'+ (admin?'Receba novos pedidos no celular':'Sua loja favorita, a um toque')+'</strong><p>'+(admin?'Adicione o app à Tela de Início e permita as notificações para acompanhar seus pedidos.':'Adicione o app à Tela de Início e permita notificações para acompanhar cada etapa do pedido.')+'</p></div><button type="button">Baixar app</button>';
 banner.hidden=installed;
 const host=document.querySelector(admin?'.main':'#homeView');host?.prepend(banner);
 if(!admin){const n=banner.cloneNode(true);document.getElementById('ordersView')?.prepend(n);n.querySelector('button').onclick=()=>openGuide();}
 const dialog=document.createElement('dialog');dialog.className='buy-install-guide';dialog.setAttribute('aria-labelledby','buy-install-title');
 dialog.innerHTML='<header><div><small>APP DA LOJA</small><h2 id="buy-install-title">Pedidos sempre por perto</h2></div><button type="button" data-close aria-label="Fechar">×</button></header><section data-install-section><h3>Adicione à Tela de Início</h3><div data-instructions></div><button type="button" data-install>Instalar aplicativo</button></section><section><h3>Notificações deste aparelho</h3><p>'+(admin?'Receba um aviso quando um novo pedido for confirmado no sistema.':'Receba avisos quando a loja confirmar, preparar e enviar seu pedido.')+'</p><button type="button" data-enable>Ativar notificações</button><button type="button" data-disable>Desativar avisos desta loja</button><p data-status role="status" aria-live="polite"></p></section><p class="buy-install-note">Os avisos dependem da sua conexão e das permissões do celular. Você pode continuar usando o site normalmente.</p>';
 document.body.append(dialog);
 const status=dialog.querySelector('[data-status]'),enable=dialog.querySelector('[data-enable]'),disable=dialog.querySelector('[data-disable]'),install=dialog.querySelector('[data-install]');
 function update(){
  const instructions=dialog.querySelector('[data-instructions]');
  instructions.innerHTML=standalone()?'<p>Este app já está aberto pela Tela de Início.</p>':ios?'<ol><li>Abra esta loja no Safari e toque em <strong>Compartilhar</strong> (quadrado com seta para cima).</li><li>Escolha <strong>Adicionar à Tela de Início</strong>. Se aparecer, mantenha <strong>Abrir como App</strong> ativado.</li><li>Toque em <strong>Adicionar</strong> e abra o novo ícone na Tela de Início.</li><li>Ative a chavinha de Notificações no app.</li></ol><p>É necessário iOS 16.4 ou superior. Faça seus próximos pedidos pelo app instalado para receber os avisos nele.</p>':'<ol><li>Toque em <strong>Instalar aplicativo</strong>, se o botão estiver disponível.</li><li>Ou abra o menu do navegador e escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Abra o app e permita as notificações.</li></ol>';
  installed=installed||standalone();
  document.querySelectorAll('.buy-install-invite').forEach(el=>el.hidden=installed);
  dialog.querySelector('[data-install-section]').hidden=installed;
  install.hidden=installed||!prompt;
  switches.forEach(el=>{el.setAttribute('aria-checked',String(active()));el.disabled=busy;});
  enable.disabled=busy||(ios&&!standalone())||!supported();
  enable.hidden=true;disable.hidden=true;disable.disabled=busy;
  if(ios&&!standalone())status.textContent='Primeiro adicione à Tela de Início e abra o app pelo ícone.';
  else if(!supported())status.textContent='Este navegador não oferece notificações push. Abra em um navegador compatível e atualizado.';
 }
 const diagnostic=document.createElement('p');diagnostic.setAttribute('role','status');
 const testButton=document.createElement('button');testButton.type='button';testButton.textContent='Testar neste aparelho';testButton.className='buy-push-test';
 if(admin){status.after(diagnostic);diagnostic.after(testButton);}
 async function inspect(){
  if(!admin||!supported())return;
  try{
   const reg=await navigator.serviceWorker.getRegistration('/'),sub=await reg?.pushManager.getSubscription();
   const data=await api('push-status',{endpoint:sub?.endpoint||''});
   const permission=Notification.permission==='granted';
   let text=permission&&data.thisDevice?'Este aparelho está inscrito e tem permissão para avisos.':'Este aparelho não está pronto para receber avisos. Ligue a chavinha de Notificações.';
   if(data.last){const last=data.last;text+=' Último envio: '+last.accepted+' aceito(s), '+last.failed+' falha(s).';if(last.state==='no_recipients'||!last.accepted&&!last.failed)text+=' Nenhum aparelho elegível foi encontrado.';const reasons=Object.keys(last.reasons||{});if(reasons.length)text+=' Motivo: '+reasons.join(', ')+'.';}
   diagnostic.textContent=text;testButton.disabled=!permission||!data.thisDevice;
  }catch(e){diagnostic.textContent=e.message;testButton.disabled=true;}
 }
 testButton.onclick=async()=>{
  testButton.disabled=true;diagnostic.textContent='Enviando teste somente para este aparelho…';
  try{const reg=await navigator.serviceWorker.getRegistration('/'),sub=await reg?.pushManager.getSubscription();if(!sub)throw Error('Ative as notificações neste aparelho primeiro.');const result=await api('push-test',{subscription:sub.toJSON()});diagnostic.textContent=result.message;}
  catch(e){diagnostic.textContent=e.message;}
  finally{testButton.disabled=false;}
 };
 function openGuide(){update();if(!dialog.open)dialog.showModal();void inspect();}

 banner.querySelector('button').onclick=openGuide;
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;update();});
 window.addEventListener('appinstalled',()=>{installed=true;prompt=null;update();});
 matchMedia('(display-mode: standalone)').addEventListener?.('change',update);
 window.addEventListener('pageshow',update);
 window.addEventListener('focus',update);
 navigator.getInstalledRelatedApps?.().then(apps=>{if(apps.some(app=>app.platform==='webapp')){installed=true;update();}}).catch(()=>{});
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
   const count=await bind();setEnabled(true);void inspect();
   status.textContent=admin?'Pronto! Este aparelho receberá novos pedidos.':count?'Pronto! Você receberá as atualizações dos seus pedidos neste aparelho.':'Permissão ativada. Os próximos pedidos feitos aqui serão vinculados automaticamente aos avisos.';
  }catch(e){status.textContent=e.message;if(!dialog.open)openGuide();}finally{busy=false;update();}
 };
 disable.onclick=async()=>{
  if(busy)return;busy=true;update();
  try{
   const reg=await registration(),sub=await reg.pushManager.getSubscription();
   if(sub){if(admin)await api('push-unsubscribe',{subscription:sub.toJSON()});else for(const receipt of receipts()){try{await api('push-unsubscribe',{subscription:sub.toJSON(),token:receipt.token});}catch(e){if(![403,404].includes(e.status))throw e;}}}
   setEnabled(false);status.textContent='Avisos desta loja desativados neste aparelho.';
  }catch(e){status.textContent=e.message;if(!dialog.open)openGuide();}finally{busy=false;update();}
 };
 async function sync(){
  if(!enabled()||!supported()||Notification.permission!=='granted'||ios&&!standalone())return;
  try{await bind();}catch{status.textContent='Não foi possível confirmar os avisos. Use a chavinha de Notificações para tentar novamente.';}
 }
 window.addEventListener('buy-order-confirmed',e=>{lastReceipt=e.detail?.receipt;void sync();});
 // Compact, synchronized controls replace the old notification buttons.
 function makeSwitch(){
  const wrap=document.createElement('span');wrap.className='buy-notification-control';
  const label=document.createElement('span');label.textContent='Notificações';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='buy-notification-switch';
  toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','Notificações desta loja neste aparelho');
  toggle.innerHTML='<span aria-hidden="true"></span>';switches.push(toggle);
  toggle.onclick=()=>{if(busy)return;if(!active()&&(!supported()||ios&&!standalone())){openGuide();return;}if(active())void disable.onclick();else void enable.onclick();};
  wrap.append(label,toggle);return wrap;
 }
 document.querySelectorAll('button[onclick="askNotifications()"],#notifBtn').forEach(el=>el.replaceWith(makeSwitch()));
 if(!admin){
  const headerSwitch=document.querySelector('.shopbar .buy-notification-control');
  const identity=document.querySelector('.shopbar .brand-identity');
  if(headerSwitch&&identity)identity.append(headerSwitch);
 }
 enable.before(makeSwitch());
 // Keep existing integrations pointing to guidance and diagnostics.

 window.askNotifications=openGuide;
 update();
 // Server push owns background notifications; avoid duplicate local notifications.
 const foreground=window.pushForeground;
 window.pushForeground=(...args)=>{if(!enabled())foreground?.(...args);};
 void sync();
 function openOrders(){if(location.hash!=='#orders')return;if(admin){if(!document.documentElement.classList.contains('bolt-locked'))window.showPage?.('orders');}else window.view?.('orders');}
 openOrders();window.addEventListener('hashchange',openOrders);
 if(admin)new MutationObserver(openOrders).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
})();
