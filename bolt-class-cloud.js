(()=>{'use strict';
const q=new URLSearchParams(location.search),slug=q.get('slug');
const auth=document.getElementById('bolt-class-auth'),form=document.getElementById('bolt-class-login'),msg=document.getElementById('bolt-class-auth-msg'),status=document.getElementById('bolt-class-cloud-status');
const cfg=window.BOLT_CONFIG;
let sb,tenant=null,busy=false,queued=null,revision=0,stopped=false;
function fail(t){msg.textContent=t;document.body.classList.remove('bolt-class-authorized');window.BOLT_CLASS_CLOUD_READY=false}
function show(t){status.hidden=false;status.textContent=t}
if(!slug||!cfg?.supabaseUrl||!cfg?.supabaseAnonKey||!window.supabase){fail('Endereço ou configuração Cloud inválidos. Use o link fornecido pelo BOLT Studio.');return}
sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
async function authorize(){const u=await sb.auth.getUser();if(u.error||!u.data.user){fail('Entre com seu e-mail e senha.');return}
 const memberships=await sb.from('bolt_commercial_memberships').select('client_id,role,bolt_commercial_clients!inner(id,name,slug,product,status)').eq('user_id',u.data.user.id).eq('bolt_commercial_clients.slug',slug).eq('bolt_commercial_clients.product','class');
 if(memberships.error||memberships.data?.length!==1){fail('Usuário sem autorização para esta escola.');return}
 const m=memberships.data[0],c=m.bolt_commercial_clients;
 if(c.status==='paused'){fail('Acesso da escola suspenso.');return}
 tenant=c.id;
 const res=await sb.from('bolt_class_documents').select('data,revision').eq('client_id',tenant).maybeSingle();
 if(res.error){fail('Banco escolar não configurado: '+res.error.message);return}
 const payload=res.data?.data;
 if(payload && typeof payload==='object' && Array.isArray(payload.schools)){db=payload;revision=res.data.revision||0}else{db=blank();db.schools=[{id:tenant,name:c.name,slug:c.slug,students:[],staff:[],classes:[],attendance:[],grades:[],finance:[],messages:[],calendar:[],modules:DEFAULT_MODULES,teacherItems:[],familyAccess:[]}];revision=0}
 // Company features are never enabled for school tenants.
 const selected=db.schools[0];if(!selected){fail('Registro escolar inválido.');return}
 db.schools=[selected];sid=selected.id;mode='school';page='overview';filter='';
 window.BOLT_CLASS_CLOUD_READY=true;document.body.classList.add('bolt-class-authorized');render();show('Cloud conectado • '+c.name);
}
async function flush(){if(busy||stopped||!queued||!tenant)return;busy=true;
 while(queued&&!stopped){const data=queued;queued=null;show('Salvando no Supabase…');
  // Optimistic concurrency: reject writes if another device changed the document.
  const res=await sb.rpc('bolt_class_save_document',{p_client_id:tenant,p_expected_revision:revision,p_data:data});
  if(res.error){stopped=true;window.BOLT_CLASS_CLOUD_READY=false;show('ERRO: alterações NÃO salvas • '+res.error.message);alert('Não foi possível salvar no Supabase. '+res.error.message+'\nNão continue editando; recarregue para recuperar os dados da nuvem.');break}
  revision=Number(res.data);show('Salvo no Supabase • revisão '+revision);
 }busy=false;
}
window.BOLT_CLASS_CLOUD_SAVE=(data)=>{if(!window.BOLT_CLASS_CLOUD_READY||stopped)return;queued=data;void flush()};
form.addEventListener('submit',async e=>{e.preventDefault();msg.textContent='Autenticando…';const r=await sb.auth.signInWithPassword({email:document.getElementById('bolt-class-email').value,password:document.getElementById('bolt-class-password').value});if(r.error){fail('E-mail ou senha inválidos.');return}try{await authorize()}catch(err){fail('Erro de acesso: '+err.message)}});
sb.auth.getSession().then(r=>{if(r.data.session)authorize().catch(e=>fail(e.message));else fail('Entre com seu e-mail e senha.')});
})();