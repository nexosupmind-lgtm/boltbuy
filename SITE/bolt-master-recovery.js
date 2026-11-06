/* BOLT V20: fonte de verdade das empresas = Supabase. */
(function(){
 const message=(txt,bad=false)=>{let e=document.getElementById('bolt-cloud-status');if(!e){e=document.createElement('div');e.id='bolt-cloud-status';e.style.cssText='position:fixed;bottom:12px;right:12px;z-index:100000;max-width:420px;padding:12px 15px;border-radius:10px;color:white;font:13px system-ui;box-shadow:0 4px 20px #0008';document.body.append(e)}e.style.background=bad?'#8b1d29':'#263c45';e.textContent=txt};
 async function refresh(){
  const sb=window.BOLT_SUPABASE;if(!sb){message('Aguardando conexão Supabase.',true);return}
  const {data:{session},error:authError}=await sb.auth.getSession();if(authError||!session){message('Faça login no Master para consultar empresas.',true);return}
  const {data:master,error:masterError}=await sb.from('bolt_master_admins').select('user_id').eq('user_id',session.user.id).maybeSingle();
  if(masterError||!master){message('Usuário não autorizado como Master: '+(masterError?.message||''),true);return}
  const {data,error}=await sb.from('bolt_tenants').select('id,slug,name,owner_name,logo_url,primary_color,background_color,tagline,plan,status').order('created_at',{ascending:true});
  if(error){message('Erro ao carregar empresas: '+error.message,true);return}
  tenants=(data||[]).map(t=>({cloudId:t.id,slug:t.slug,name:t.name,owner:t.owner_name||'',logo:t.logo_url||'',primary:t.primary_color||'#ef652c',background:t.background_color||'#101e37',tagline:t.tagline||'',plan:t.plan||'Pro',status:({ativo:'Ativo',teste:'Teste',suspenso:'Suspenso'}[String(t.status||'').toLowerCase()]||'Teste'),price:0,due:''}));
  render();document.getElementById('bolt-cloud-status')?.remove();window.dispatchEvent(new Event('bolt:clients-refreshed'));
  return tenants;
 }
 window.BOLT_MASTER_REFRESH=refresh;
 document.addEventListener('DOMContentLoaded',()=>{
  const previous=window.boltCloudInit;
  window.boltCloudInit=function(...args){const ret=previous?.apply(this,args);refresh().catch(e=>message(e.message,true));return ret};
 });
})();