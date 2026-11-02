export async function onRequestPost({request,env}) {
 const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 try {
  const url=(env.SUPABASE_URL||'').replace(/\/$/,'');const key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!/^https:\/\/[^/]+\.supabase\.co$/.test(url)||!key)return json(503,{error:'Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis secretas do Cloudflare.'});
  const bearer=(request.headers.get('authorization')||'').match(/^Bearer (.+)$/i)?.[1];if(!bearer)return json(401,{error:'Faça login no Master.'});
  const headers={apikey:key,authorization:'Bearer '+key,'content-type':'application/json'};
  const identity=await fetch(url+'/auth/v1/user',{headers:{apikey:key,authorization:'Bearer '+bearer}});
  if(!identity.ok)return json(401,{error:'Sessão inválida.'});const user=await identity.json();
  const check=await fetch(url+'/rest/v1/bolt_master_admins?user_id=eq.'+encodeURIComponent(user.id)+'&select=user_id',{headers});
  if(!check.ok||(await check.json()).length!==1)return json(403,{error:'Apenas administradores Master.'});
  const body=await request.json();const product=body.product,slug=String(body.slug||'').trim(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
  if(!['church','class'].includes(product)||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12)return json(400,{error:'Informe cliente válido, e-mail e senha provisória de pelo menos 12 caracteres.'});
  const clientQuery='/rest/v1/bolt_commercial_clients?product=eq.'+product+'&slug=eq.'+encodeURIComponent(slug)+'&select=id,name,slug,status';
  const found=await fetch(url+clientQuery,{headers});if(!found.ok)return json(500,{error:'Não foi possível consultar o cliente.'});const clients=await found.json();
  if(clients.length!==1)return json(404,{error:'Cadastre primeiro o cliente no Comercial.'});
  if(clients[0].status==='paused')return json(409,{error:'Cliente pausado.'});
  const existing=await fetch(url+'/rest/v1/bolt_commercial_memberships?client_id=eq.'+clients[0].id+'&role=eq.owner&select=user_id',{headers});
  if(!existing.ok)return json(500,{error:'Execute o SQL de homologação V24.'});if((await existing.json()).length)return json(409,{error:'Já existe responsável para este cliente. Não foi criado usuário duplicado.'});
  const created=await fetch(url+'/auth/v1/admin/users',{method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true})});
  if(!created.ok)return json(409,{error:'Não foi possível criar usuário. Confira se o e-mail já existe no Auth do Supabase.'});
  const payload=await created.json(),uid=payload.id||payload.user?.id;if(!uid)return json(500,{error:'Usuário criado, mas sem ID de retorno. Verifique Auth.'});
  const linked=await fetch(url+'/rest/v1/bolt_commercial_memberships',{method:'POST',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify({client_id:clients[0].id,user_id:uid,role:'owner'})});
  if(!linked.ok)return json(500,{error:'Usuário criado, mas vínculo falhou. Não recrie; verifique o Supabase.'});
  return json(201,{ok:true,email,product,slug,login_url:'/portal.html?product='+product+'&slug='+encodeURIComponent(slug)});
 }catch(e){return json(500,{error:'Falha controlada: '+String(e.message||e).slice(0,140)})}
}
