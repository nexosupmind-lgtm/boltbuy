(()=>{'use strict';
const cfg=window.BOLT_CONFIG||{};
const isMaster=location.pathname==='/'||location.pathname.endsWith('/index.html');
const tenantSlug=new URLSearchParams(location.search).get('tenant')||'salgaditos';
let client=null,session=null,authorized=false;
const robot="<svg class=\"bolt-robot\" viewBox=\"0 0 230 300\" role=\"img\" aria-label=\"Rob\u00f4 BOLT futurista\"><defs><linearGradient id=\"metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#fff\"/><stop offset=\".4\" stop-color=\"#d6c8ff\"/><stop offset=\"1\" stop-color=\"#7961bd\"/></linearGradient><linearGradient id=\"visor\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#101027\"/><stop offset=\"1\" stop-color=\"#392568\"/></linearGradient></defs><ellipse cx=\"115\" cy=\"275\" rx=\"70\" ry=\"10\" fill=\"#9d6aff\" opacity=\".25\"/><path d=\"M110 40V19\" stroke=\"#c4adff\" stroke-width=\"8\" stroke-linecap=\"round\"/><circle cx=\"110\" cy=\"15\" r=\"9\" fill=\"#6fffe6\"/><rect x=\"37\" y=\"55\" width=\"155\" height=\"117\" rx=\"50\" fill=\"url(#metal)\" stroke=\"#f7eeff\" stroke-width=\"4\"/><rect x=\"51\" y=\"80\" width=\"127\" height=\"67\" rx=\"28\" fill=\"url(#visor)\" stroke=\"#a88aff\" stroke-width=\"2\"/><g class=\"bolt-eyes\" fill=\"#7ffff0\"><rect x=\"78\" y=\"100\" width=\"20\" height=\"26\" rx=\"10\"/><rect x=\"131\" y=\"100\" width=\"20\" height=\"26\" rx=\"10\"/></g><path d=\"M102 135q13 11 27 0\" fill=\"none\" stroke=\"#91ffe9\" stroke-width=\"3\" stroke-linecap=\"round\"/><rect x=\"61\" y=\"170\" width=\"108\" height=\"85\" rx=\"32\" fill=\"url(#metal)\" stroke=\"#e5d7ff\" stroke-width=\"4\"/><circle class=\"bolt-core\" cx=\"115\" cy=\"208\" r=\"23\" fill=\"#5b26b6\" stroke=\"#72ffe8\" stroke-width=\"4\"/><path d=\"m116 190-11 19h12l-6 17 18-24h-12z\" fill=\"#85ffe8\"/><path d=\"M62 184q-31-3-30 31\" stroke=\"url(#metal)\" stroke-width=\"22\" stroke-linecap=\"round\" fill=\"none\"/><path class=\"bolt-arm\" d=\"M168 184q32-16 35-48\" stroke=\"url(#metal)\" stroke-width=\"22\" stroke-linecap=\"round\" fill=\"none\"/><circle cx=\"202\" cy=\"133\" r=\"13\" fill=\"#e5d5ff\"/><path d=\"M88 251v18m54-18v18\" stroke=\"#c5b3ed\" stroke-width=\"19\" stroke-linecap=\"round\"/></svg>";
function error(t){const e=document.getElementById('bolt-login-error');if(e)e.textContent=t}
function setup(){
 const root=document.createElement('div');root.id='bolt-auth-root';root.innerHTML=`<div class="bolt-login"><div class="bolt-brand"><img src="/bolt-brand-white.png" alt="BOLT Operational Technology" class="bolt-splash-logo"></div><div class="bolt-stage">${isMaster?`<img src="/bolt-icon-alt.png" alt="BOLT" class="bolt-icon-stage">`:robot}<div class="bolt-scan"></div></div><div><div class="bolt-status">● QUANTUM SECURITY ONLINE</div><div class="bolt-tagline">Bora pra cima, João!</div><p class="bolt-sub">Sua central de comando está pronta.<br>Identifique-se para ativar o BOLT.</p></div><div class="bolt-login-bottom"><form id="bolt-login-form" class="bolt-login-form"><div style="font-weight:800;text-align:center;font-size:18px">Acesso protegido</div><label for="bolt-email">E-mail</label><input id="bolt-email" type="email" autocomplete="username" required placeholder="seu@email.com"><label for="bolt-password">Senha</label><input id="bolt-password" type="password" autocomplete="current-password" required placeholder="Sua senha"><div id="bolt-login-error" class="bolt-login-error" role="alert"></div><button type="submit">AUTENTICAR E ENTRAR</button></form><button id="bolt-enter" class="bolt-enter" type="button">ENTRAR ⚡</button><p class="bolt-login-hint">BOLT SECURE ACCESS • CLOUD EDITION</p></div></div>`;
 document.body.appendChild(root);
 const enter=document.getElementById('bolt-enter'),form=document.getElementById('bolt-login-form');
 enter.addEventListener('click',async()=>{
  if(authorized){unlock();return}
  if(!configured()){form.classList.add('show');error('Configure bolt-config.js e execute o SQL do Supabase antes de entrar.');return}
  enter.disabled=true;enter.textContent='VERIFICANDO ACESSO...';
  try{const {data}=await client.auth.getSession();if(data.session){session=data.session;if(await checkAccess(data.session)){unlock();return}}}catch(e){}
  form.classList.add('show');enter.textContent='ENTRAR';enter.disabled=false;document.getElementById('bolt-email').focus();
 });
 form.addEventListener('submit',async e=>{
  e.preventDefault();error('');if(!configured()){error('Configure o Supabase primeiro.');return}
  const b=form.querySelector('button');b.disabled=true;b.textContent='AUTENTICANDO...';
  try{const {data, error:authError}=await client.auth.signInWithPassword({email:document.getElementById('bolt-email').value.trim(),password:document.getElementById('bolt-password').value});if(authError)throw authError;session=data.session;if(!await checkAccess(session)){await client.auth.signOut();session=null;throw new Error(isMaster?'Usuário sem permissão de administrador Master.':'Este login não está autorizado para '+tenantSlug+'.')}unlock()}
  catch(err){error(err.message||'Não foi possível entrar.');}finally{b.disabled=false;b.textContent='AUTENTICAR E ENTRAR'}
 });
 if(!configured())error('Configure bolt-config.js com URL e chave pública do Supabase.');
 else{client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});window.BOLT_SUPABASE=client;}
 }
function configured(){return /^https:\/\/.+\.supabase\.co\/?$/.test(cfg.supabaseUrl||'')&&!!cfg.supabaseAnonKey&&!cfg.supabaseAnonKey.includes('COLE_')&&!!window.supabase}
async function checkAccess(s){if(!s?.user)return false;
 if(isMaster){const {data,error:e}=await client.from('bolt_master_admins').select('user_id').eq('user_id',s.user.id).maybeSingle();if(e)throw e;return !!data}
 const {data,error:e}=await client.from('bolt_memberships').select('tenant_id,bolt_tenants!inner(slug)').eq('user_id',s.user.id).eq('bolt_tenants.slug',tenantSlug);if(e)throw e;return !!data?.length;
}
function unlock(){authorized=true;document.documentElement.classList.remove('bolt-locked');document.getElementById('bolt-auth-root').hidden=true;
 if(!document.getElementById('bolt-logout')){const b=document.createElement('button');b.id='bolt-logout';b.className='bolt-logout';b.textContent='⏻ Sair';b.addEventListener('click',async()=>{authorized=false;await client.auth.signOut();session=null;document.documentElement.classList.add('bolt-locked');document.getElementById('bolt-auth-root').hidden=false;document.getElementById('bolt-login-form').classList.remove('show');document.getElementById('bolt-enter').textContent='ENTRAR ⚡';b.remove()});document.body.appendChild(b)}
 if(isMaster&&typeof window.boltCloudInit==='function')window.boltCloudInit();
}
window.BOLT_GET_SESSION=()=>session;
document.addEventListener('DOMContentLoaded',setup);
})();