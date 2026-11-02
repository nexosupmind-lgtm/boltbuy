/* Shared authenticated persistence for Church/Class. No business data in localStorage. */
(()=>{'use strict';
const cfg=window.BOLT_CONFIG||{};
let sb;
const client=()=>sb||(sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{storageKey:'bolt-commercial-session',detectSessionInUrl:false}}));
const portal=(product,slug)=>'/portal.html?product='+encodeURIComponent(product)+'&slug='+encodeURIComponent(slug||'');
async function open(product){
 const slug=new URLSearchParams(location.search).get('slug');
 if(!slug||!['church','class'].includes(product)){throw Error('Abra este ambiente pelo link individual do cliente no BOLT Studio.');}
 const endpoint='/api/commercial-workspace?product='+product+'&slug='+encodeURIComponent(slug);
 let revision=0,pending=null,lastData=null,saving=null,blocked=false,lastError=null,bar;
 function status(text,failed=false){if(!bar){bar=document.createElement('div');bar.id='bolt-sync-status';bar.setAttribute('role','status');bar.style.cssText='position:fixed;bottom:8px;right:8px;left:8px;z-index:99999;padding:10px 14px;border:1px solid #64748b;border-radius:12px;background:#0f172a;color:#fff;font:13px system-ui;display:flex;align-items:center;gap:10px;flex-wrap:wrap';document.body.append(bar)}bar.replaceChildren();const label=document.createElement('span');label.textContent=text;bar.append(label);if(failed){const b=document.createElement('button');b.textContent=blocked?'Recarregar':'Tentar salvar';b.onclick=()=>{if(blocked){if(confirm('Exporte as alterações pendentes antes de recarregar. Continuar?'))location.reload()}else{lastError=null;void flush()}};bar.append(b);const exportButton=document.createElement('button');exportButton.textContent='Exportar alterações pendentes';exportButton.onclick=()=>{const a=document.createElement('a'),u=URL.createObjectURL(new Blob([JSON.stringify(pending||lastData,null,2)],{type:'application/json'}));a.href=u;a.download=product+'-'+slug+'-pendente.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};bar.append(exportButton)}const exit=document.createElement('button');exit.textContent='Sair';exit.onclick=async()=>{if((pending||saving)&&!confirm('Há alterações sem confirmação no servidor. Deseja sair?'))return;await client().auth.signOut();location.assign(portal(product,slug))};bar.append(exit)}
 async function request(method,data){const auth=await client().auth.getSession();const token=auth.data?.session?.access_token;if(!token){if(method==='GET')location.replace(portal(product,slug));throw Error('Sessão expirada. Entre novamente no portal.');}const res=await fetch(endpoint,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(method==='PUT'?{body:JSON.stringify({data,revision})}:{})});const body=await res.json().catch(()=>({}));if(!res.ok||!body.ok){const err=Error(body.error||'Servidor indisponível.');err.status=res.status;throw err}return body}
 const bundle=await request('GET');revision=bundle.revision;lastData=bundle.data;
 async function drain(){while(pending&&!blocked){const snapshot=pending;pending=null;status('Salvando no Supabase…');try{const result=await request('PUT',snapshot);revision=result.revision;lastData=snapshot;lastError=null;}catch(e){pending=pending||snapshot;blocked=e.status===409;lastError=e;status('Alterações NÃO salvas: '+e.message,true);return false}}status('Salvo no Supabase • '+bundle.client.name);return true}
 function flush(){if(saving)return saving;if(blocked)return Promise.resolve(false);saving=drain().finally(()=>{saving=null});return saving}
 function save(data){pending=structuredClone(data);lastData=pending;if(blocked){status('Conflito: exporte as alterações pendentes e recarregue.',true);return false}lastError=null;void flush();return true}
 window.addEventListener('beforeunload',e=>{if(pending||saving){e.preventDefault();e.returnValue=''}});
 window.addEventListener('online',()=>{if(pending&&!blocked)void flush()});
 status('Conectado ao Supabase • '+bundle.client.name);
 return {bundle,save,flush,async persist(data){save(data);if(!await flush())throw lastError||Error('Alterações ainda não salvas.');},client:client(),portal:portal(product,slug)};
}
function fail(error,root=document.body){root.replaceChildren();const box=document.createElement('main');box.style.cssText='margin:10vh auto;padding:24px;max-width:560px;font:16px system-ui';const h=document.createElement('h2');h.textContent='Não foi possível abrir o ambiente';const p=document.createElement('p');p.textContent=error.message;const b=document.createElement('button');b.textContent='Tentar novamente';b.onclick=()=>location.reload();box.append(h,p,b);root.append(box)}
window.BOLT_WORKSPACE={open,fail,client};
})();
