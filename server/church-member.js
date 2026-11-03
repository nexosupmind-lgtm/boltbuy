const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const fingerprint=async m=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([m.id,m.name||'',m.email||'',m.phone||''])))),x=>x.toString(16).padStart(2,'0')).join('');
export function projectMember(payload,member,client,branding,now=new Date()){
 const today=now.toISOString().slice(0,10),published=x=>x.published===true||x.status==='published'||x.status==='Publicado';
 return {client:{name:client.name,slug:client.slug},branding:{logo_url:branding.logo_url||'',primary_color:branding.primary_color||'#475569'},member:{name:member.name||'',photo:/^https:\/\//.test(member.photo||'')?member.photo:''},events:(payload.events||[]).filter(published).map(x=>({title:x.title||x.name,date:x.date,time:x.time,location:x.location,description:x.description})),notices:(payload.notices||[]).filter(published).map(x=>({title:x.title,text:x.text||x.body,date:x.date})),devotionals:(payload.devotionals||[]).filter(x=>published(x)&&x.date&&x.date<=today).map(x=>({title:x.title,ref:x.ref,text:x.text||x.body,date:x.date}))};
}
export async function onRequest({request,env}){
 try{
  const q=new URL(request.url).searchParams,slug=q.get('slug'),view=q.get('view')||'portal';if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug||''))fail(400,'Igreja inválida.');
  if(!['GET','POST'].includes(request.method))fail(405,'Método não permitido.');
  const base=(env.SUPABASE_URL||'').replace(/\/$/,''),key=env.SUPABASE_SERVICE_ROLE_KEY;if(!/^https:\/\/[^/]+\.supabase\.co$/.test(base)||!key)fail(503,'Servidor não configurado.');
  const h={apikey:key,authorization:'Bearer '+key,'content-type':'application/json'};
  async function rest(path,options={}){const r=await fetch(base+'/rest/v1/'+path,{...options,headers:{...h,...options.headers}});if(!r.ok)fail(503,'Estrutura de acesso indisponível. Confira a instalação V35.');return r.status===204?null:r.json()}
  const clients=await rest('bolt_commercial_clients?product=eq.church&slug=eq.'+encodeURIComponent(slug)+'&select=id,name,slug,status');if(clients.length!==1)fail(404,'Igreja não encontrada.');const c=clients[0],brands=await rest('bolt_client_branding?client_id=eq.'+c.id+'&select=logo_url,primary_color');
  if(request.method==='GET'&&view==='identity')return json(200,{ok:true,client:{name:c.name,slug:c.slug},branding:brands[0]||{}});
  const token=(request.headers.get('authorization')||'').match(/^Bearer (\S+)$/i)?.[1];if(!token)fail(401,'Entre no portal.');const me=await fetch(base+'/auth/v1/user',{headers:{apikey:key,authorization:'Bearer '+token}});if(!me.ok)fail(401,'Sessão expirada.');const user=await me.json();if(!user.id)fail(401,'Sessão inválida.');if(c.status==='paused')fail(403,'Igreja pausada.');
  const master=(await rest('bolt_master_admins?user_id=eq.'+encodeURIComponent(user.id)+'&select=user_id')).length===1;
  const owner=master||(await rest('bolt_commercial_memberships?client_id=eq.'+c.id+'&user_id=eq.'+encodeURIComponent(user.id)+'&role=eq.owner&select=user_id')).length===1;
  const states=await rest('bolt_commercial_workspaces?client_id=eq.'+c.id+'&select=payload'),payload=states[0]?.payload||{},members=payload.members||[];
  const contracts=await rest('bolt_client_subscriptions?client_id=eq.'+c.id+'&select=plan_id');let features=null;
  if(contracts[0]?.plan_id){const plans=await rest('bolt_platform_plans?id=eq.'+contracts[0].plan_id+'&product=eq.church&select=features');if(plans.length!==1||!Array.isArray(plans[0].features))fail(503,'Plano indisponível.');features=plans[0].features;}
  if(view==='access'){
   if(features&&!features.includes('members'))fail(403,'O módulo de membros não está incluído no plano.');
   if(!owner)fail(403,'Acesso administrativo necessário.');
   const accounts=await rest('bolt_church_member_accounts?client_id=eq.'+c.id+'&select=member_id');
   if(request.method==='GET')return json(200,{ok:true,members:members.map(m=>({id:m.id,name:m.name,email:m.email||'',has_access:accounts.some(a=>a.member_id===m.id)}))});
   const raw=await request.text();if(raw.length>2000)fail(413,'Solicitação muito grande.');let body;try{body=JSON.parse(raw)}catch{fail(400,'Dados inválidos.')}
   const m=members.find(m=>m.id===body.member_id),email=String(body.email||'').trim().toLowerCase();if(!m||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>180)fail(400,'Selecione um membro e informe o e-mail de acesso.');if(accounts.some(a=>a.member_id===m.id))fail(409,'Este membro já possui acesso. Procure a administração para recuperar a conta.');
   const random=crypto.getRandomValues(new Uint8Array(18)),password=Array.from(random,x=>'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@'[x%54]).join('')+'aA7!';
   const created=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:h,body:JSON.stringify({email,password,email_confirm:true,user_metadata:{full_name:String(m.name||'Membro').slice(0,120)}})});if(!created.ok)fail(409,'Não foi possível criar acesso. O e-mail pode já estar em uso.');const auth=await created.json(),id=auth.id||auth.user?.id;if(!id)fail(503,'Conta criada sem confirmação. Confira o Auth antes de repetir.');
   await rest('bolt_church_member_accounts',{method:'POST',body:JSON.stringify({client_id:c.id,user_id:id,member_id:m.id,member_fingerprint:await fingerprint(m)})});
   return json(201,{ok:true,email,password,login_url:'/member.html?slug='+encodeURIComponent(slug)});
  }
  if(view!=='portal'||request.method!=='GET')fail(400,'Ação inválida.');
  const accounts=await rest('bolt_church_member_accounts?client_id=eq.'+c.id+'&user_id=eq.'+encodeURIComponent(user.id)+'&select=member_id,member_fingerprint');const m=members.find(m=>m.id===accounts[0]?.member_id);if(accounts.length!==1||!m||await fingerprint(m)!==accounts[0].member_fingerprint)fail(403,'Acesso não autorizado ou cadastro alterado. Procure a igreja.');
  const visible={...payload};if(features)for(const key of ['events','notices','devotionals'])if(!features.includes(key))visible[key]=[];
  return json(200,{ok:true,...projectMember(visible,m,c,brands[0]||{})});
 }catch(e){return json(e.status||503,{error:e.status?e.message:'Não foi possível confirmar a operação. Confira o servidor antes de repetir.'})}
}
