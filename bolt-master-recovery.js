/* BOLT V21: fonte de verdade das empresas = Supabase, em todos os dispositivos. */
(function(){
 const message=(txt,bad=false)=>{let e=document.getElementById('bolt-cloud-status');if(!e){e=document.createElement('div');e.id='bolt-cloud-status';e.style.cssText='position:fixed;bottom:12px;right:12px;z-index:100000;max-width:420px;padding:12px 15px;border-radius:10px;color:white;font:13px system-ui;box-shadow:0 4px 20px #0008';document.body.append(e)}e.style.background=bad?'#8b1d29':'#263c45';e.textContent=txt};
 window.BOLT_MASTER_READY=false;
 window.BOLT_MASTER_TENANTS=[];
 async function refresh(){
  window.BOLT_MASTER_READY=false;
  const sb=window.BOLT_SUPABASE;
  if(!sb){message('Conexão Supabase indisponível. Tente entrar novamente.',true);return false}
  const {data:{session},error:authError}=await sb.auth.getSession();
  if(authError||!session){message('Faça login no Master para consultar empresas.',true);return false}
  const {data:master,error:masterError}=await sb.from('bolt_master_admins').select('user_id').eq('user_id',session.user.id).maybeSingle();
  if(masterError||!master){message('Usuário não autorizado como Master: '+(masterError?.message||''),true);return false}
  const {data,error}=await sb.from('bolt_tenants').select('id,slug,name,owner_name,logo_url,primary_color,background_color,tagline,plan,status').order('created_at',{ascending:true});
  if(error){message('Erro ao carregar empresas: '+error.message,true);return false}
  let cached=[];try{cached=JSON.parse(localStorage.getItem('bolt_tenants_v1')||'[]')}catch(e){}
  const cacheBySlug=new Map((Array.isArray(cached)?cached:[]).filter(t=>t&&t.slug).map(t=>[t.slug,t]));
  tenants=(data||[]).map(t=>{const old=cacheBySlug.get(t.slug)||{};return {...old,cloudId:t.id,slug:t.slug,name:t.name,owner:t.owner_name||'',logo:t.logo_url||'',primary:t.primary_color||'#ef652c',background:t.background_color||'#101e37',tagline:t.tagline||'',plan:t.plan||'Pro',status:({ativo:'Ativo',teste:'Teste',suspenso:'Suspenso'}[String(t.status||'').toLowerCase()]||'Teste'),price:Number(old.price||0),due:old.due||''}});
  window.BOLT_MASTER_TENANTS=tenants;
  window.BOLT_MASTER_READY=true;
  render();
  message(tenants.length+' empresa(s) confirmada(s) no Supabase.');
  return true;
 }
 window.BOLT_MASTER_REFRESH=refresh;
})();
