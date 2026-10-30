export async function onRequestPost({request,env}){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 const fail=(status,error)=>new Response(JSON.stringify({error}),{status,headers});
 try{
  const url=env.SUPABASE_URL,secret=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)return fail(503,'Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Cloudflare Pages.');
  const auth=request.headers.get('Authorization')||'';if(!/^Bearer\s+\S+$/.test(auth))return fail(401,'Sessão ausente.');
  const jwt=auth.replace(/^Bearer\s+/,'');
  const me=await fetch(url+'/auth/v1/user',{headers:{apikey:secret,Authorization:'Bearer '+jwt}});
  if(!me.ok)return fail(401,'Sessão inválida.');
  const user=await me.json();if(!user.id)return fail(401,'Usuário inválido.');
  const check=await fetch(url+'/rest/v1/bolt_master_admins?user_id=eq.'+encodeURIComponent(user.id)+'&select=user_id',{headers:{apikey:secret,Authorization:'Bearer '+secret}});
  if(!check.ok||!(await check.json()).length)return fail(403,'Somente administradores Master podem criar acessos.');
  const body=await request.json(),tenant=body.tenant||{},email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
  if(!/^[a-z0-9-]{3,40}$/.test(tenant.slug||'')||!tenant.name||!/^\S+@\S+\.\S+$/.test(email)||password.length<10)return fail(400,'Confira empresa, e-mail e senha (mínimo 10 caracteres).');
  const h={apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'};
  const tRes=await fetch(url+'/rest/v1/bolt_tenants?on_conflict=slug',{method:'POST',headers:h,body:JSON.stringify({slug:tenant.slug,name:String(tenant.name).slice(0,120),primary_color:tenant.primary_color||'#7c3aed',background_color:tenant.background_color||'#0b1020',tagline:tenant.tagline||'',plan:tenant.plan||'Pro',status:'ativo'})});
  if(!tRes.ok)return fail(400,'Empresa: '+(await tRes.text()).slice(0,350));
  const saved=(await tRes.json())[0];
  const uRes=await fetch(url+'/auth/v1/admin/users',{method:'POST',headers:h,body:JSON.stringify({email,password,email_confirm:true})});
  if(!uRes.ok)return fail(400,'Usuário: '+(await uRes.text()).slice(0,350));
  const created=await uRes.json();const uid=created.id||created.user?.id;if(!uid)return fail(500,'Usuário criado sem ID retornado.');
  const mRes=await fetch(url+'/rest/v1/bolt_memberships?on_conflict=tenant_id,user_id',{method:'POST',headers:h,body:JSON.stringify({tenant_id:saved.id,user_id:uid,role:'owner'})});
  if(!mRes.ok)return fail(500,'Usuário criado, mas vínculo falhou. Confira o Supabase: '+(await mRes.text()).slice(0,250));
  return new Response(JSON.stringify({ok:true,tenant:saved.slug,email}),{status:201,headers});
 }catch(err){return fail(500,'Erro no provisionamento: '+String(err.message||err).slice(0,180))}
}
