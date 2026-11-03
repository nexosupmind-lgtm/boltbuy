const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function onRequest({request,env}){
 const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
 const base=(env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!['GET','PUT'].includes(request.method))return reply(405,{error:'Método não permitido.'});
 if(!/^https:\/\/[^/]+\.supabase\.co$/.test(base)||!key)return reply(503,{error:'Conexão do servidor indisponível.'});
 const token=request.headers.get('authorization');
 if(!/^Bearer \S+$/.test(token||''))return reply(401,{error:'Entre no Master.'});
 const headers={apikey:key,authorization:'Bearer '+key,'content-type':'application/json'};
 const read=async path=>{
  const response=await fetch(base+'/rest/v1/'+path,{headers});
  if(!response.ok)throw Error('Consulta indisponível');
  return response.json();
 };
 try{
  const session=await fetch(base+'/auth/v1/user',{headers:{...headers,authorization:token}});
  if(!session.ok)return reply(401,{error:'Sessão inválida.'});
  const actor=(await session.json()).id;
  if(!uuid.test(actor||''))return reply(401,{error:'Sessão inválida.'});
  const admins=await read('bolt_master_admins?user_id=eq.'+actor+'&select=user_id');
  if(admins.length!==1)return reply(403,{error:'Apenas administradores Master.'});
  const query=new URL(request.url).searchParams;
  const product=query.get('product'),id=query.get('id');
  if(!['class','church','buy'].includes(product)||!uuid.test(id||''))return reply(400,{error:'Cliente inválido.'});
  const buy=product==='buy';
  const clients=await read((buy?'bolt_tenants':'bolt_commercial_clients')+'?id=eq.'+id+(buy?'':'&product=eq.'+product)+'&select=id');
  if(clients.length!==1)return reply(404,{error:'Cliente não encontrado.'});
  const table=buy?'bolt_memberships':'bolt_commercial_memberships';
  const column=buy?'tenant_id':'client_id';
  const owners=await read(table+'?'+column+'=eq.'+id+'&role=eq.owner&select=user_id&limit=2');
  if(!owners.length)return reply(404,{error:'Este cliente ainda não tem login administrativo. Crie o acesso no cadastro ou no Studio.'});
  if(owners.length!==1||!uuid.test(owners[0].user_id||''))return reply(409,{error:'Há mais de um acesso administrativo vinculado. Revise os vínculos antes de editar.'});
  const uid=owners[0].user_id;
  const authPath=base+'/auth/v1/admin/users/'+uid;
  const auth=await fetch(authPath,{headers});
  if(!auth.ok)return reply(404,{error:'Conta administrativa não encontrada.'});
  const account=await auth.json();
  const current={id:uid,name:String(account.user_metadata?.full_name||''),email:String(account.email||'')};
  if(request.method==='GET')return reply(200,current);
  const raw=await request.text();
  if(raw.length>4096)return reply(413,{error:'Solicitação muito grande.'});
  let body;
  try{body=JSON.parse(raw)}catch{return reply(400,{error:'Solicitação inválida.'})}
  if(body?.user_id!==uid)return reply(409,{error:'O vínculo mudou. Abra a edição novamente.'});
  const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase();
  const password=typeof body.password==='string'?body.password:'';
  if(!name||name.length>120||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||(password&&(password.length<12||password.length>128)))return reply(400,{error:'Confira nome, e-mail e senha opcional de 12 a 128 caracteres.'});
  const [master,delivery,commercial,family,member]=await Promise.all([
   read('bolt_master_admins?user_id=eq.'+uid+'&select=user_id'),
   read('bolt_memberships?user_id=eq.'+uid+'&select=tenant_id,role'),
   read('bolt_commercial_memberships?user_id=eq.'+uid+'&select=client_id,role'),
   read('bolt_family_accounts?user_id=eq.'+uid+'&select=id'),
   read('bolt_church_member_accounts?user_id=eq.'+uid+'&select=id')
  ]);
  const links=buy?delivery:commercial;
  if(master.length||family.length||member.length||delivery.length+commercial.length!==1||links[0]?.[column]!==id||links[0]?.role!=='owner')return reply(409,{error:'Esta conta tem outros vínculos ou acesso Master. Edite uma conta exclusiva do cliente.'});
  const update={user_metadata:{...account.user_metadata,full_name:name}};
  if(email!==current.email){update.email=email;update.email_confirm=true}
  if(password)update.password=password;
  const saved=await fetch(authPath,{method:'PUT',headers,body:JSON.stringify(update)});
  if(!saved.ok)return reply(409,{error:'Não foi possível salvar. Confira se o e-mail já está em uso e se a senha atende aos requisitos.'});
  return reply(200,{ok:true,name,email});
 }catch{return reply(503,{error:'Não foi possível verificar ou atualizar o acesso administrativo.'})}
}
