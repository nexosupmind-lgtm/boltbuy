// Private pages and API data are NEVER cached. Offline is a connection screen only.
const CACHE='bolt-shell-v36';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/offline.html'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>/^bolt-(shell|quantum)-/.test(k)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
 if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.match('/offline.html')));
});

function notificationTarget(raw){
 try{
  const target=new URL(raw||'/family.html',self.location.origin);
  if(target.origin!==self.location.origin)return null;
  if(target.pathname==='/family.html')return target;
  if(['/Salgaditos/admin','/Salgaditos/admin.html','/Salgaditos/cliente','/Salgaditos/cliente.html'].includes(target.pathname)&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.searchParams.get('tenant')||''))return target;
 }catch{}
 return null;
}
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const target=notificationTarget(data.url);
 const buy=data.product==='buy'&&target&&target.pathname.startsWith('/Salgaditos/');
 const title=buy?String(data.title||'Atualização do pedido').slice(0,100):'Novidades da escola';
 const body=buy?String(data.body||'Seu pedido foi atualizado.').slice(0,220):'Você recebeu uma atualização no Portal da Família.';
 const url=buy?target.href:(target?.pathname==='/family.html'?target.href:self.location.origin+'/family.html');
 const icon='/assets/apps/'+(buy?'buy':'class')+'-192.png';
 event.waitUntil(self.registration.showNotification(title,{body,icon,badge:icon,tag:typeof data.tag==='string'?data.tag.slice(0,120):(buy?'buy-news':'school-news'),data:{url}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=notificationTarget(event.notification.data?.url);
 if(!target)return;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
  const client=windows.find(x=>{const u=new URL(x.url);return u.origin===target.origin&&u.pathname===target.pathname&&u.search===target.search;});
  if(client){if(client.navigate)await client.navigate(target.href);return client.focus();}
  return self.clients.openWindow(target.href);
 }));
});
