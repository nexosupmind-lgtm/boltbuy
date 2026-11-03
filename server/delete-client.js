const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(status,message)=>{const e=Error(message);e.status=status;throw e};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const enc=new TextEncoder(),to64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''),from64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(secret){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
export async function signPlan(plan,secret){const data=to64(enc.encode(JSON.stringify(plan))),signature=await crypto.subtle.sign('HMAC',await key(secret),enc.encode('bolt-delete-v1:'+data));return data+'.'+to64(signature)}
export async function verifyPlan(value,secret){try{const [data,signature,...rest]=String(value).split('.');if(rest.length||!data||!signature||!await crypto.subtle.verify('HMAC',await key(secret),from64(signature),enc.encode('bolt-delete-v1:'+data)))throw Error();const plan=JSON.parse(new TextDecoder().decode(from64(data)));if(plan.v!==1||!uuid.test(plan.id)||!['buy','class','church'].includes(plan.product)||typeof plan.slug!=='string'||!Number.isSafeInteger(plan.expires)||Date.now()>plan.expires)throw Error();return plan}catch{fail(400,'A confirmação expirou ou é inválida. Abra a exclusão novamente.')}}
const tables={buy:[['bolt_products','tenant_id'],['bolt_orders','tenant_id'],['bolt_coupons','tenant_id'],['bolt_memberships','tenant_id'],['bolt_loyalty_settings','tenant_id'],['bolt_audit_events','tenant_id'],['bolt_delivery_storefronts','tenant_id']],class:[['bolt_commercial_memberships','client_id'],['bolt_client_branding','client_id'],['bolt_client_studio_settings','client_id'],['bolt_commercial_workspaces','client_id'],['bolt_family_accounts','client_id']],church:[['bolt_commercial_memberships','client_id'],['bolt_client_branding','client_id'],['bolt_client_studio_settings','client_id'],['bolt_commercial_workspaces','client_id']]};
const optional=new Set(['bolt_delivery_storefronts','bolt_family_accounts','profiles']);
export async function onRequest({request,env}){
 try{
  if(!['GET','DELETE'].includes(request.method))return json(405,{error:'Método não permitido.'});
  const base=(env.SUPABASE_URL||'').replace(/\/$/,''),secret=env.SUPABASE_SERVICE_ROLE_KEY;if(!/^https:\/\/[^/]+\.supabase\.co$/.test(base)||!secret)fail(503,'Conexão do servidor indisponível.');
  const bearer=(request.headers.get('authorization')||'').match(/^Bearer (\S+)$/i)?.[1];if(!bearer)fail(401,'Entre novamente no Master.');
  const h={apikey:secret,authorization:'Bearer '+secret,'content-type':'application/json'};
  const me=await fetch(base+'/auth/v1/user',{headers:{apikey:secret,authorization:'Bearer '+bearer}});if(!me.ok)fail(401,'Sessão expirada.');const user=await me.json();if(!user.id)fail(401,'Sessão inválida.');
  async function rest(path,options={},allowMissing=false){const r=await fetch(base+'/rest/v1/'+path,{...options,headers:{...h,...options.headers}});if(!r.ok){let data={};try{data=await r.json()}catch{}if(allowMissing&&['PGRST205','42P01'].includes(data.code))return null;fail(503,'Não foi possível verificar os vínculos do cliente. Nenhuma exclusão foi confirmada.')}return r}
  const master=await rest('bolt_master_admins?user_id=eq.'+encodeURIComponent(user.id)+'&select=user_id');if(!(await master.json()).length)fail(403,'Somente administradores Master podem excluir clientes.');
  async function rows(path,allowMissing=false){const r=await rest(path,{},allowMissing);return r?await r.json():[]}
  const search=new URL(request.url).searchParams;let product,id,plan,body;
  if(request.method==='GET'){product=search.get('product');id=search.get('id');if(!['buy','class','church'].includes(product)||!uuid.test(id||''))fail(400,'Cliente inválido.');}
  else{const raw=await request.text();if(raw.length>12000)fail(413,'Solicitação inválida.');try{body=JSON.parse(raw)}catch{fail(400,'Solicitação inválida.')}plan=await verifyPlan(body.plan,secret);({product,id}=plan);if(body.confirmation!==plan.slug)fail(400,'Digite exatamente o identificador informado para confirmar.');}
  const table=product==='buy'?'bolt_tenants':'bolt_commercial_clients',filter='id=eq.'+id+(product==='buy'?'':'&product=eq.'+product),found=await rows(table+'?'+filter+'&select=id,name,slug');
  const client=found[0];if(request.method==='GET'&&!client)fail(404,'Cliente não encontrado.');
  const buckets=['bolt-branding','bolt-product-images'];
  async function listFiles(bucket,limit=500){const queue=[id+'/'],files=[];let truncated=false,folders=0;while(queue.length){if(++folders>200)throw Error('Too many nested folders');const prefix=queue.shift();let offset=0;for(;;){const r=await fetch(base+'/storage/v1/object/list/'+bucket,{method:'POST',headers:h,body:JSON.stringify({prefix,limit:100,offset,sortBy:{column:'name',order:'asc'}})});if(r.status===404)return {files:[],truncated:false};if(!r.ok)throw Error('Storage unavailable');const objects=await r.json();if(!Array.isArray(objects))throw Error('Invalid storage list');for(const object of objects){const name=object.name;if(typeof name!=='string'||!name||name==='.'||name==='..'||/[\\/]/.test(name))throw Error('Invalid storage key');const path=prefix+name;if(!path.startsWith(id+'/'))throw Error('Invalid client prefix');if(object.id==null){queue.push(path+'/')}else{if(files.length>=limit){truncated=true;break}files.push(path)}}if(truncated)break;if(objects.length<100)break;offset+=100}if(truncated)break}return {files,truncated}}
  if(request.method==='GET'){
   const counts={};for(const [name,column]of tables[product]){const r=await rest(name+'?'+column+'=eq.'+id+'&select=*&limit=0',{headers:{Prefer:'count=exact'}},optional.has(name));counts[name]=r?Number((r.headers.get('content-range')||'*/0').split('/').at(-1))||0:0;}
   let fileCount=0,truncated=false;for(const bucket of buckets){const result=await listFiles(bucket);fileCount+=result.files.length;truncated||=result.truncated;}
   plan={v:1,product,id,slug:client.slug,name:client.name,expires:Date.now()+3600000};
   return json(200,{ok:true,client:{...client,product},counts,file_count:fileCount,file_count_truncated:truncated,plan:await signPlan(plan,secret),users_notice:'As contas de usuário serão preservadas; os vínculos e o acesso a este cliente serão removidos.'});
  }
  if(client&&client.slug!==plan.slug)fail(409,'O cliente foi alterado. Abra a exclusão novamente.');
  let candidates=[];
  if(client){
   const membership=product==='buy'?'bolt_memberships?tenant_id=eq.':'bolt_commercial_memberships?client_id=eq.';
   candidates=(await rows(membership+id+'&select=user_id')).map(x=>x.user_id);
   if(product==='class')candidates.push(...(await rows('bolt_family_accounts?client_id=eq.'+id+'&select=user_id',true)).map(x=>x.user_id));
   const deleted=await fetch(base+'/rest/v1/'+table+'?'+filter+'&slug=eq.'+encodeURIComponent(plan.slug),{method:'DELETE',headers:{...h,Prefer:'return=representation'}});
   if(!deleted.ok){
    const error=await deleted.json().catch(()=>({}));
    if(error.code==='23503'){
     const constraint=String(error.message||'').match(/constraint "([a-zA-Z0-9_]+)"/)?.[1];
     const detail=constraint?' Vínculo: '+constraint+'.':'';
     fail(409,'Existe um vínculo no banco que impede a exclusão.'+detail+' Nenhum arquivo foi apagado.');
    }
    if(error.code==='42501')fail(503,'O servidor não tem permissão de exclusão no banco. Execute SUPABASE_V37_DELETE.sql. Nenhum arquivo foi apagado.');
    fail(503,'Não foi possível confirmar a exclusão. Atualize a lista antes de tentar novamente. Nenhum arquivo foi apagado.');
   }
   if((await deleted.json()).length!==1)fail(409,'O cliente foi alterado por outra sessão. Atualize a lista.');
  }
  const usersDeleted=0,usersRetained=new Set(candidates).size;
  const pending=warning=>json(202,{ok:true,deleted:true,cleanup_complete:false,removed_files:0,users_deleted:0,users_retained:usersRetained,cleanup_plan:body.plan,warnings:[warning],client:{id,slug:plan.slug,product}});
  // Replays may finish storage cleanup, but never remove assets if this ID is in use again.
  try{if((await rows('bolt_tenants?id=eq.'+id+'&select=id')).length||(await rows('bolt_commercial_clients?id=eq.'+id+'&select=id')).length)return pending('O identificador ainda está em uso. Nenhum arquivo foi apagado.');}catch{return pending('O cadastro foi removido, mas não foi possível verificar se os arquivos já podem ser limpos.');}
  let removed=0,complete=true;const warnings=[];
  for(const bucket of buckets){try{const {files,truncated}=await listFiles(bucket);for(let i=0;i<files.length;i+=100){const r=await fetch(base+'/storage/v1/object/'+bucket,{method:'DELETE',headers:h,body:JSON.stringify({prefixes:files.slice(i,i+100)})});if(!r.ok)throw Error('Storage cleanup failed');removed+=Math.min(100,files.length-i)}const remaining=await listFiles(bucket,1);if(truncated||remaining.files.length||remaining.truncated)complete=false;}catch{complete=false;warnings.push('Não foi possível concluir a limpeza de arquivos em '+bucket+'.');}}
  return json(complete?200:202,{ok:true,deleted:true,cleanup_complete:complete,removed_files:removed,users_deleted:usersDeleted,users_retained:usersRetained,...(!complete?{cleanup_plan:body.plan,warnings}:{}),client:{id,slug:plan.slug,product}});
 }catch(error){return json(error.status||503,{error:error.status?error.message:'Não foi possível concluir a solicitação. Atualize a lista antes de tentar novamente.'})}
}
