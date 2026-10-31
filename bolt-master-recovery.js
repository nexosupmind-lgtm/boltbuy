/* BOLT recovery: read tenant records from Supabase, never overwrite cloud with local data. */
(function(){
 const cloud=()=>window.BOLT_SUPABASE;
 const localKey='bolt_tenants_v1';
 const notice=(message)=>{let n=document.getElementById('bolt-cloud-status');if(!n){n=document.createElement('div');n.id='bolt-cloud-status';n.style.cssText='position:fixed;bottom:15px;right:15px;z-index:100000;max-width:440px;padding:13px 18px;background:#251d46;color:#fff;border:1px solid #987cff;border-radius:12px;box-shadow:0 8px 30px #0007';document.body.appendChild(n)}n.textContent=message;};
 async function refresh(){
  if(!cloud())return;
  const {data:{session},error:sessionError}=await cloud().auth.getSession();
  if(sessionError||!session)return;
  const {data:master,error:masterError}=await cloud().from('bolt_master_admins').select('user_id').eq('user_id',session.user.id).maybeSingle();
  if(masterError||!master)return;
  const {data,error}=await cloud().from('bolt_tenants').select('id,slug,name,owner_name,logo_url,primary_color,background_color,tagline,plan,status');
  if(error){notice('Não foi possível carregar empresas do Supabase: '+error.message);return;}
  const cloudRows=(data||[]).map(t=>({cloudId:t.id,slug:t.slug,name:t.name,owner:t.owner_name||'',logo:t.logo_url||'',primary:t.primary_color||'#EF652C',background:t.background_color||'#101e37',tagline:t.tagline||'',plan:t.plan||'Pro',status:({ativo:'Ativo',teste:'Teste',suspenso:'Suspenso'}[String(t.status||'').toLowerCase()]||'Teste'),price:0,due:''}));
  let local=[];try{local=JSON.parse(localStorage.getItem(localKey)||'[]');if(!Array.isArray(local))local=[]}catch{}
  const bySlug=new Map(local.map(t=>[t.slug,t]));
  // Only supplement fields not represented in Supabase; never overwrite cloud identities.
  tenants=cloudRows.map(t=>({...bySlug.get(t.slug),...t,price:bySlug.get(t.slug)?.price||0,due:bySlug.get(t.slug)?.due||''}));
  render();notice(tenants.length+' empresa(s) carregada(s) do Supabase. Cadastro/edição no Master temporariamente bloqueados para proteger os dados.');
 }
 // Until master CRUD is migrated, do not let local edits give false impression of cloud persistence.
 document.addEventListener('DOMContentLoaded',()=>{
  const form=document.getElementById('tenantForm');
  form?.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();notice('Cadastro temporariamente bloqueado: esta versão de recuperação apenas lê empresas do Supabase.');},true);
  window.removeTenant=()=>notice('Exclusão bloqueada nesta versão de recuperação.');
  window.edit=()=>notice('Edição bloqueada nesta versão de recuperação.');
  const previous=window.boltCloudInit;
  window.boltCloudInit=function(...args){const ret=previous?.apply(this,args);refresh().catch(e=>notice('Erro de sincronização: '+e.message));return ret;};
  // Handle existing authenticated session if unlock happens before this script runs.
  refresh().catch(()=>{});
 });
 window.BOLT_MASTER_REFRESH=refresh;
})();
