// Private operational state, keyed by immutable client ID. Never uses a client-supplied user ID.
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const MAX_BYTES=4*1024*1024;
export async function onRequest({request,env}) {
 if(!['GET','PUT'].includes(request.method))return response(405,{error:'Método não permitido.'});
 try {
  const url=(env.SUPABASE_URL||'').replace(/\/$/,''),key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!/^https:\/\/[^/]+\.supabase\.co$/.test(url)||!key)return response(503,{error:'Conexão do servidor não configurada.'});
  const token=(request.headers.get('authorization')||'').match(/^Bearer (\S+)$/i)?.[1];
  if(!token)return response(401,{error:'Entre no portal da organização.'});
  const q=new URL(request.url).searchParams,product=q.get('product'),slug=q.get('slug');
  if(!['church','class'].includes(product)||!slug||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return response(400,{error:'Organização inválida.'});
  const h={apikey:key,authorization:'Bearer '+key,'content-type':'application/json'};
  const me=await fetch(url+'/auth/v1/user',{headers:{apikey:key,authorization:'Bearer '+token}});
  if(!me.ok)return response(401,{error:'Sessão expirada. Entre novamente.'});
  const user=await me.json();if(!user.id)return response(401,{error:'Sessão inválida.'});
  async function read(path){const r=await fetch(url+'/rest/v1/'+path,{headers:h});if(!r.ok)throw Error('Consulta indisponível. Verifique a estrutura do Supabase.');return r.json()}
  const clients=await read('bolt_commercial_clients?product=eq.'+product+'&slug=eq.'+encodeURIComponent(slug)+'&select=id,name,slug,product,status');
  if(clients.length!==1)return response(403,{error:'Organização não autorizada.'});
  const client=clients[0];
  const memberships=await read('bolt_commercial_memberships?client_id=eq.'+encodeURIComponent(client.id)+'&user_id=eq.'+encodeURIComponent(user.id)+'&select=role');
  // This edition exposes administrator modules only. Do not elevate other membership roles.
  if(memberships.length!==1||memberships[0].role!=='owner')return response(403,{error:'Conta sem acesso administrativo a esta organização.'});
  if(client.status==='paused')return response(403,{error:'Organização pausada.'});
  const statePath='bolt_commercial_workspaces?client_id=eq.'+encodeURIComponent(client.id);
  if(request.method==='GET'){
   const r=await fetch(url+'/rest/v1/'+statePath+'&select=payload,revision',{headers:h});
   if(!r.ok)return response(503,{error:'A estrutura online ainda não está instalada. Execute SUPABASE_V33_WORKSPACES.sql.'});
   const rows=await r.json();
   const [branding,settings]=await Promise.all([read('bolt_client_branding?client_id=eq.'+encodeURIComponent(client.id)+'&select=primary_color,secondary_color,logo_url,banner_url'),read('bolt_client_studio_settings?client_id=eq.'+encodeURIComponent(client.id)+'&select=display_title,subtitle,features')]);
   return response(200,{ok:true,client,user:{id:user.id,email:user.email},role:'owner',branding:branding[0]||{},settings:settings[0]||{},data:rows[0]?.payload||null,revision:rows[0]?.revision||0});
  }
  if(Number(request.headers.get('content-length'))>MAX_BYTES)return response(413,{error:'Limite de 4 MB atingido. Reduza as imagens dos cadastros.'});
  const raw=await request.text();if(new TextEncoder().encode(raw).length>MAX_BYTES)return response(413,{error:'Limite de 4 MB atingido. Reduza as imagens dos cadastros.'});
  let body;try{body=JSON.parse(raw)}catch{return response(400,{error:'Dados inválidos.'})}
  const {data,revision}=body||{};
  if(!Number.isSafeInteger(revision)||revision<0||revision>=2147483647||!data||Array.isArray(data)||typeof data!=='object')return response(400,{error:'Revisão ou dados inválidos.'});
  const arrays=product==='church'?['members','ministries','events','notices','courses','enrollments','attendance','devotionals']:[];
  if(arrays.some(k=>!Array.isArray(data[k])))return response(400,{error:'Estrutura da igreja inválida.'});
  if(product==='class'&&(!Array.isArray(data.schools)||data.schools.length!==1||data.schools[0]?.id!==client.id||data.schools[0]?.slug!==slug||!['students','staff','classes','attendance','grades','finance'].every(k=>Array.isArray(data.schools[0][k]))))return response(400,{error:'A escola não corresponde à organização autenticada.'});
  const row={payload:data,revision:revision+1,updated_at:new Date().toISOString()};
  const target=url+'/rest/v1/'+(revision===0?'bolt_commercial_workspaces':statePath+'&revision=eq.'+revision);
  const saved=await fetch(target,{method:revision===0?'POST':'PATCH',headers:{...h,Prefer:'return=representation'},body:JSON.stringify(revision===0?{client_id:client.id,...row}:row)});
  if(saved.status===409)return response(409,{error:'Outra sessão salvou alterações. Exporte as alterações pendentes antes de recarregar.'});
  if(!saved.ok)return response(503,{error:'Não foi possível salvar no Supabase. Verifique a migração V33 e tente novamente.'});
  const rows=await saved.json();if(rows.length!==1)return response(409,{error:'Outra sessão salvou alterações. Exporte as alterações pendentes antes de recarregar.'});
  return response(200,{ok:true,revision:rows[0].revision});
 }catch{return response(503,{error:'Falha de conexão com o banco. Nenhum salvamento foi confirmado; tente novamente.'})}
}
