// Private pages and API data are NEVER cached. Offline is a connection screen only.
const CACHE='bolt-shell-v35';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/offline.html'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>/^bolt-(shell|quantum)-/.test(k)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
 if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.match('/offline.html')));
});

self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const target=new URL(data.url||'/family.html',self.location.origin);
 const allowed=target.origin===self.location.origin&&target.pathname==='/family.html';
 event.waitUntil(self.registration.showNotification('Novidades da escola',{body:'Você recebeu uma atualização no Portal da Família.',icon:'/assets/apps/class-192.png',badge:'/assets/apps/class-192.png',tag:typeof data.tag==='string'?data.tag:'school-news',data:{url:allowed?target.href:self.location.origin+'/family.html'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL(event.notification.data?.url||'/family.html',self.location.origin);
 if(target.origin!==self.location.origin||target.pathname!=='/family.html')return;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
  const client=windows.find(x=>x.url===target.href);
  if(client)return client.focus();
  return self.clients.openWindow(target.href);
 }));
});
