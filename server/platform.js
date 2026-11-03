// BOLT control plane. Service credentials never leave this module.
export const MODULES={
 buy:{pdv:'PDV e caixa',products:'Produtos e fotos',orders:'Pedidos',ifood:'iFood',reports:'Relatórios',banners:'Promoções',delivery:'Entrega e frete',assistant:'Bolt',customers:'Clientes',stock:'Estoque'},
 class:{students:'Alunos',enrollments:'Matrículas',classes:'Turmas',subjects:'Disciplinas',schedule:'Horários',attendance:'Chamada',grades:'Notas',assessments:'Avaliações',documents:'Documentos',staff:'Equipe',family:'Portal da família',finance:'Mensalidades',contracts:'Contratos',expenses:'Despesas',inventory:'Patrimônio',library:'Biblioteca',transport:'Transporte',messages:'Comunicados',calendar:'Calendário',tasks:'Tarefas',incidents:'Ocorrências',meetings:'Conselho',reports:'Relatórios'},
 church:{reports:'Relatórios',members:'Membros',ministries:'Ministérios',events:'Eventos',notices:'Comunicados',courses:'Cursos',enrollments:'Inscrições',attendance:'Presenças',devotionals:'Devocionais'}
};
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const date=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s};
export function amount(v){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>9999999999.99||Math.abs(v*100-Math.round(v*100))>.00001)fail(400,'Valor monetário inválido.');return v}
export function metrics(clients,subs,invoices,now=new Date()){
 const today=now.toISOString().slice(0,10),month=today.slice(0,7),active=subs.filter(s=>s.status==='active'),ids=new Set(clients.map(c=>c.id)),valid=subs.filter(s=>ids.has(s.tenant_id||s.client_id)),byId=new Map(valid.map(s=>[s.id,s]));
 const late=invoices.filter(i=>byId.has(i.subscription_id)&&!i.paid_at&&i.due_date<today),received=invoices.filter(i=>byId.has(i.subscription_id)&&i.paid_at?.slice(0,7)===month);
 return {clients:clients.length,active_clients:clients.filter(c=>['ativo','active'].includes(c.status)).length,mrr:active.filter(s=>ids.has(s.tenant_id||s.client_id)).reduce((n,s)=>n+Math.round(Number(s.monthly_fee)*100),0)/100,received:received.reduce((n,i)=>n+Math.round(Number(i.amount)*100),0)/100,overdue_clients:new Set(late.map(i=>i.subscription_id)).size,overdue_amount:late.reduce((n,i)=>n+Math.round(Number(i.amount)*100),0)/100,unconfigured:clients.length-valid.length};
}
export async function onRequest({request,env}){
 try{
  if(!['GET','POST'].includes(request.method))return json(405,{error:'Método não permitido.'});
  const base=(env.SUPABASE_URL||'').replace(/\/$/,''),key=env.SUPABASE_SERVICE_ROLE_KEY;if(!/^https:\/\/[^/]+\.supabase\.co$/.test(base)||!key)fail(503,'Servidor não configurado.');
  const h={apikey:key,authorization:'Bearer '+key,'content-type':'application/json'};
  async function rest(path,options={}){const r=await fetch(base+'/rest/v1/'+path,{...options,headers:{...h,...options.headers}});if(!r.ok){if(r.status===409)fail(409,'Registro já cadastrado ou em uso.');fail(503,'Estrutura indisponível. Confira a instalação V35.')}return r.status===204?null:r.json()}
  async function all(path){let out=[];for(let offset=0;offset<100000;offset+=1000){const rows=await rest(path+(path.includes('?')?'&':'?')+'limit=1000&offset='+offset);out.push(...rows);if(rows.length<1000)return out}fail(503,'Volume acima do limite desta consulta.');}
  const q=new URL(request.url).searchParams,action=q.get('action')||'overview';
  let body={};if(request.method==='POST'){const raw=await request.text();if(new TextEncoder().encode(raw).length>10000)fail(413,'Solicitação muito grande.');try{body=JSON.parse(raw)}catch{fail(400,'Solicitação inválida.')}}
  const token=(request.headers.get('authorization')||'').match(/^Bearer (\S+)$/i)?.[1];let user=null;
  if(token){const r=await fetch(base+'/auth/v1/user',{headers:{apikey:key,authorization:'Bearer '+token}});if(!r.ok)fail(401,'Sessão expirada.');user=await r.json();if(!user.id)fail(401,'Sessão inválida.')}
  const isMaster=user&&(await rest('bolt_master_admins?user_id=eq.'+encodeURIComponent(user.id)+'&select=user_id')).length===1;
  const clientFor=async(product,slug)=>{if(!MODULES[product]||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug||'')||slug.length>80)fail(400,'Cliente inválido.');const rows=await rest((product==='buy'?'bolt_tenants?':'bolt_commercial_clients?product=eq.'+product+'&')+'slug=eq.'+encodeURIComponent(slug)+'&select=id,name,slug,status');if(rows.length!==1)fail(404,'Cliente não encontrado.');return {...rows[0],product}};
  async function scope(product,slug,source){const c=await clientFor(product,slug);if(['paused','suspenso'].includes(c.status))fail(403,'Cliente pausado.');if(isMaster)return c;if(!user)fail(401,'Entre no sistema para solicitar suporte.');
   if(source==='family'){
    if(product!=='class')fail(403,'Acesso não autorizado.');const rows=await rest('bolt_family_accounts?client_id=eq.'+c.id+'&user_id=eq.'+encodeURIComponent(user.id)+'&select=student_id,guardian_fingerprint');if(rows.length!==1)fail(403,'Acesso da família não autorizado.');
    const states=await rest('bolt_commercial_workspaces?client_id=eq.'+c.id+'&select=payload');const student=states[0]?.payload?.schools?.[0]?.students?.find(s=>s.id===rows[0].student_id);
    // The family API owns guardian fingerprint verification. Reuse its projection check.
    const r=await fetch(new URL('/api/family?view=portal&slug='+encodeURIComponent(slug),request.url),{headers:{authorization:'Bearer '+token}});if(!student||!r.ok)fail(403,'Acesso da família alterado.');return c;
   }
   if(source==='member'){
    if(product!=='church')fail(403,'Acesso não autorizado.');
    const r=await fetch(new URL('/api/church-member?view=portal&slug='+encodeURIComponent(slug),request.url),{headers:{authorization:'Bearer '+token}});if(!r.ok)fail(403,'Acesso do membro não autorizado.');return c;
   }
   const rows=await rest((product==='buy'?'bolt_memberships?tenant_id=eq.':'bolt_commercial_memberships?client_id=eq.')+c.id+'&user_id=eq.'+encodeURIComponent(user.id)+'&select=role');
   if(!rows.some(r=>source==='member'?['member','leader','owner'].includes(r.role):['owner','manager','staff'].includes(r.role)))fail(403,'Conta sem vínculo com este cliente.');return c;
  }
  if(action==='capabilities'&&request.method==='GET'){
   const c=await scope(q.get('product'),q.get('slug'),'admin');const col=c.product==='buy'?'tenant_id':'client_id';
   const subs=await rest('bolt_client_subscriptions?'+col+'=eq.'+c.id+'&select=plan_id');let features=null;
   if(subs[0]?.plan_id){const plans=await rest('bolt_platform_plans?id=eq.'+subs[0].plan_id+'&product=eq.'+c.product+'&select=features');if(plans.length!==1)fail(503,'Plano indisponível.');features=plans[0].features}
   return json(200,{ok:true,features});
  }
  if(action==='support'){
   const product=request.method==='GET'?q.get('product'):body.product,slug=request.method==='GET'?q.get('slug'):body.slug,source=request.method==='GET'?q.get('source'):body.source;
   if(!['admin','family','member','consumer'].includes(source))fail(400,'Origem inválida.');
   const publicConsumer=source==='consumer'&&product==='buy';
   if(request.method==='GET'){
    const c=await scope(product,slug,source);const column=product==='buy'?'tenant_id':'client_id';
    const rows=await all('bolt_support_tickets?'+column+'=eq.'+c.id+(isMaster?'':'&requester_id=eq.'+encodeURIComponent(user.id))+'&select=id,subject,message,status,response,created_at,updated_at&order=created_at.desc');return json(200,{tickets:rows});
   }
   const c=publicConsumer?await clientFor(product,slug):await scope(product,slug,source);
   if(['paused','suspenso'].includes(c.status))fail(403,'Cliente pausado.');
   const subject=String(body.subject||'').trim(),message=String(body.message||'').trim(),name=String(body.name||user?.user_metadata?.full_name||'').trim(),contact=String(body.contact||'').trim();
   if(subject.length<3||subject.length>120||message.length<10||message.length>3000||!name||name.length>120||contact.length>180||(publicConsumer&&contact.length<5))fail(400,'Preencha nome, assunto, mensagem e contato válidos.');
   const ip=request.headers.get('cf-connecting-ip');if(publicConsumer&&!ip)fail(503,'Proteção de envio indisponível.');
   const material='bolt-support-v35:'+ (publicConsumer?ip:user.id),k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const digest=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(material)),rate=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
   if(!await rest('rpc/bolt_support_allow',{method:'POST',body:JSON.stringify({p_key:rate})}))fail(429,'Limite diário de chamados atingido. Tente novamente amanhã.');
   const rows=await rest('bolt_support_tickets',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({[product==='buy'?'tenant_id':'client_id']:c.id,requester_id:publicConsumer?null:user.id,requester_name:name,contact,source,verified:!publicConsumer,subject,message})});return json(201,{ok:true,id:rows[0].id});
  }
  if(!isMaster)fail(user?403:401,'Acesso exclusivo do Master.');
  if(request.method==='GET'){
   if(action==='usage')return json(200,{ok:true,usage:await rest('rpc/bolt_platform_usage',{method:'POST',body:'{}'})});
   if(action!=='overview')fail(400,'Ação inválida.');
   const [buy,commercial,plans,subscriptions,invoices,tickets]=await Promise.all([
    all('bolt_tenants?select=id,name,slug,status,plan&order=name.asc,id.asc'),all('bolt_commercial_clients?select=id,name,slug,status,product,plan,monthly_fee&order=name.asc,id.asc'),all('bolt_platform_plans?select=*&order=product.asc,name.asc,id.asc'),all('bolt_client_subscriptions?select=*&order=id.asc'),all('bolt_client_invoices?select=*&order=due_date.desc,id.asc'),all('bolt_support_tickets?select=*&order=created_at.desc,id.asc')]);
   const clients=[...buy.map(c=>({...c,product:'buy'})),...commercial];return json(200,{ok:true,clients,plans,subscriptions,invoices,tickets,modules:MODULES,metrics:metrics(clients,subscriptions,invoices),as_of:new Date().toISOString()});
  }
  if(action==='plan'){
   const {product,name,features}=body;if(!MODULES[product]||typeof name!=='string'||!name.trim()||name.length>60||!Array.isArray(features)||features.some(f=>!Object.hasOwn(MODULES[product],f)))fail(400,'Plano ou módulos inválidos.');
   await rest('bolt_platform_plans?on_conflict=product,name',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({product,name:name.trim(),monthly_fee:amount(body.monthly_fee),features:[...new Set(features)],updated_at:new Date().toISOString()})});
  }else if(action==='subscription'){
   const c=await clientFor(body.product,body.slug);if(!['active','trial','paused','cancelled'].includes(body.status))fail(400,'Situação inválida.');
   if(body.plan_id){if(!uuid.test(body.plan_id))fail(400,'Plano inválido.');const p=await rest('bolt_platform_plans?id=eq.'+body.plan_id+'&product=eq.'+body.product+'&select=id');if(p.length!==1)fail(400,'O plano pertence a outra plataforma.');}
   const col=body.product==='buy'?'tenant_id':'client_id';await rest('bolt_client_subscriptions?on_conflict='+col,{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({[col]:c.id,plan_id:body.plan_id||null,monthly_fee:amount(body.monthly_fee),status:body.status,updated_at:new Date().toISOString()})});
  }else if(action==='invoice'){
   if(!uuid.test(body.subscription_id)||!date(body.due_date))fail(400,'Assinatura ou vencimento inválido.');
   const rows=await rest('bolt_client_subscriptions?id=eq.'+body.subscription_id+'&select=id');if(rows.length!==1)fail(404,'Assinatura não encontrada.');
   await rest('bolt_client_invoices',{method:'POST',body:JSON.stringify({subscription_id:body.subscription_id,due_date:body.due_date,amount:amount(body.amount)})});
  }else if(action==='payment'){
   if(!uuid.test(body.id))fail(400,'Cobrança inválida.');const rows=await rest('bolt_client_invoices?id=eq.'+body.id+'&paid_at=is.null',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({paid_at:new Date().toISOString()})});if(rows.length!==1)fail(409,'Pagamento já registrado ou cobrança não encontrada.');
  }else if(action==='ticket'){
   if(!uuid.test(body.id)||!['open','in_progress','resolved','closed'].includes(body.status)||typeof body.response!=='string'||body.response.length>3000)fail(400,'Chamado inválido.');
   const rows=await rest('bolt_support_tickets?id=eq.'+body.id,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:body.status,response:body.response,updated_at:new Date().toISOString()})});if(rows.length!==1)fail(404,'Chamado não encontrado.');
  }else fail(400,'Ação inválida.');
  return json(200,{ok:true});
 }catch(e){return json(e.status||503,{error:e.status?e.message:'Não foi possível confirmar a operação. Tente novamente.'})}
}
