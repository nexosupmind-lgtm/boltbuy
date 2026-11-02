const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(status,message)=>{const e=Error(message);e.status=status;throw e};
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function normalizePhone(raw){const text=String(raw||'').trim(),n=text.replace(/\D/g,'');if(text.startsWith('+')&&n.length>=10&&n.length<=15)return n;if(n.length===10||n.length===11)return '55'+n;if((n.length===12||n.length===13)&&n.startsWith('55'))return n;return null}
export async function guardianFingerprint(student){const name=String(student.guardian||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');return b64(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify([name,normalizePhone(student.phone)]))))}
async function encryptionKey(secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),'HKDF',false,['deriveKey']);return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode('bolt-family-v1'),info:enc.encode('onboarding-password')},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
export async function seal(password,secret,aad){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(aad)},await encryptionKey(secret),enc.encode(password));return 'v1.'+b64(iv)+'.'+b64(cipher)}
export async function unseal(value,secret,aad){const [v,iv,body]=value.split('.');if(v!=='v1')throw Error('Invalid secret version');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:enc.encode(aad)},await encryptionKey(secret),unb64(body)))}
function random(size){return b64(crypto.getRandomValues(new Uint8Array(size))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}
function visibleToStudent(row,student){return (!row.studentId||row.studentId===student.id)&&(!row.classId||row.classId===student.classId)}
export function projectFamily(s,student,client,branding={}){
 const classroom=(s.classes||[]).find(c=>c.id===student.classId);
 return {school:{name:client.name,logo:branding.logo_url||'',color:branding.primary_color||'#475569'},guardian:student.guardian||'Responsável',student:{id:student.id,name:student.name,photo:student.photo||'',className:classroom?.name||'Turma não informada'},
 grades:(s.grades||[]).filter(x=>x.studentId===student.id&&x.publishStatus!=='draft'&&(!x.teacherExamId||x.publishStatus==='published')).map(x=>({subject:x.subject,score:x.score,period:x.period,assessment:x.assessment,date:x.date})),
 attendance:(s.attendance||[]).filter(x=>x.studentId===student.id).map(x=>({date:x.date,status:x.status})),
 messages:(s.messages||[]).filter(x=>visibleToStudent(x,student)).map(x=>({title:x.title,content:x.content,date:x.date})),
 calendar:(s.calendar||[]).filter(x=>visibleToStudent(x,student)).map(x=>({title:x.title,date:x.date,description:x.description})),
 activities:(s.teacherItems||[]).filter(x=>x.classId===student.classId&&x.status==='published'&&visibleToStudent(x,student)).map(x=>({title:x.title,description:x.description||x.content||'',due:x.due||x.date,kind:x.kind}))};
}
export async function onRequest({request,env}){
 try{
  if(!['GET','POST'].includes(request.method))return json(405,{error:'Método não permitido.'});
  const url=(env.SUPABASE_URL||'').replace(/\/$/,''),secret=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!/^https:\/\/[^/]+\.supabase\.co$/.test(url)||!secret)fail(503,'Conexão do servidor indisponível.');
  const query=new URL(request.url).searchParams,slug=query.get('slug');if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug||''))fail(400,'Endereço da escola inválido.');
  let body={};if(request.method==='POST'){const text=await request.text();if(text.length>12000)fail(413,'Solicitação muito grande.');try{body=JSON.parse(text)}catch{fail(400,'Solicitação inválida.')}}
  const headers={apikey:secret,authorization:'Bearer '+secret,'content-type':'application/json'};
  async function db(path,options={}){const r=await fetch(url+'/rest/v1/'+path,{...options,headers:{...headers,...options.headers}});if(!r.ok){if(r.status===409)fail(409,'Este aluno já possui acesso ou foi atualizado por outra sessão. Atualize a lista.');fail(503,path.startsWith('bolt_family_accounts')?'Ative o Portal da Família com o SQL SUPABASE_V34_FAMILY.sql.':'Não foi possível consultar os dados da escola.')}return r.status===204?null:r.json()}
  const clients=await db('bolt_commercial_clients?product=eq.class&slug=eq.'+encodeURIComponent(slug)+'&select=id,name,slug,status');if(clients.length!==1)fail(403,'Escola não autorizada.');const client=clients[0];if(client.status==='paused')fail(403,'Escola pausada.');
  const token=(request.headers.get('authorization')||'').match(/^Bearer (\S+)$/i)?.[1];
  async function identity(){if(!token)fail(401,'Entre para continuar.');const r=await fetch(url+'/auth/v1/user',{headers:{apikey:secret,authorization:'Bearer '+token}});if(!r.ok)fail(401,'Sessão expirada. Entre novamente.');const user=await r.json();if(!user.id)fail(401,'Sessão inválida.');return user}
  async function admin(user){const masters=await db('bolt_master_admins?user_id=eq.'+encodeURIComponent(user.id)+'&select=user_id');if(masters.length)return;const memberships=await db('bolt_commercial_memberships?client_id=eq.'+client.id+'&user_id=eq.'+encodeURIComponent(user.id)+'&role=eq.owner&select=user_id');if(!memberships.length)fail(403,'Acesso administrativo não autorizado para esta escola.')}
  async function school(){const rows=await db('bolt_commercial_workspaces?client_id=eq.'+client.id+'&select=payload');const s=rows[0]?.payload?.schools?.[0];if(s&&s.id!==client.id)fail(503,'Os dados da escola não puderam ser confirmados.');return s||{students:[],classes:[]}}
  if(request.method==='GET'&&query.get('view')==='identity'){const br=await db('bolt_client_branding?client_id=eq.'+client.id+'&select=logo_url,primary_color');return json(200,{ok:true,school:{name:client.name,logo:br[0]?.logo_url||'',color:br[0]?.primary_color||'#475569'}})}
  const accountPath='bolt_family_accounts?client_id=eq.'+client.id;
  const passwordKey=env.BOLT_FAMILY_CREDENTIAL_KEY||secret;
  const aad=a=>client.id+':'+a.student_id+':'+a.username;
  if(request.method==='POST'&&body.action==='login'){
   const username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
   if(!/^fam-[a-z0-9_-]{8,30}$/.test(username)||password.length<1||password.length>200)fail(401,'Login ou senha inválidos.');
   const rows=await db(accountPath+'&username=eq.'+encodeURIComponent(username)+'&select=*'),a=rows[0];if(!a)fail(401,'Login ou senha inválidos.');
   const s=await school(),student=s.students.find(x=>x.id===a.student_id);if(!student||await guardianFingerprint(student)!==a.guardian_fingerprint)fail(403,'O acesso do responsável precisa ser atualizado pela escola.');
   const r=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:secret,'content-type':'application/json'},body:JSON.stringify({email:a.auth_email,password})});if(!r.ok)fail(401,'Login ou senha inválidos.');const session=await r.json();if(session.user?.id!==a.user_id)fail(401,'Login inválido.');
   // Erase recoverable onboarding credentials as soon as they have been used.
   const activated=await db(accountPath+'&id=eq.'+a.id+'&version=eq.'+a.version,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({activated_at:a.activated_at||new Date().toISOString(),onboarding_secret:null})});if(activated.length!==1)fail(409,'O acesso foi alterado. Entre novamente.');
   return json(200,{ok:true,access_token:session.access_token,refresh_token:session.refresh_token,expires_in:session.expires_in});
  }
  if(request.method==='GET'&&query.get('view')==='portal'){
   const user=await identity();let student,previewStudents,s;
   if(query.get('preview')==='1'){await admin(user);s=await school();previewStudents=s.students.map(x=>({id:x.id,name:x.name}));student=s.students.find(x=>x.id===query.get('student_id'))||s.students[0];}
   else{const accounts=await db(accountPath+'&user_id=eq.'+encodeURIComponent(user.id)+'&select=student_id,guardian_fingerprint');const a=accounts[0];if(!a)fail(403,'Este usuário não tem vínculo com um aluno desta escola.');s=await school();student=s.students.find(x=>x.id===a.student_id);if(!student||await guardianFingerprint(student)!==a.guardian_fingerprint)fail(403,'O acesso do responsável precisa ser atualizado pela escola.');}
   const br=await db('bolt_client_branding?client_id=eq.'+client.id+'&select=logo_url,primary_color');
   if(!student)return json(200,{ok:true,preview:true,preview_students:[],school:{name:client.name,logo:br[0]?.logo_url||'',color:br[0]?.primary_color||'#475569'},student:null});
   return json(200,{ok:true,...projectFamily(s,student,client,br[0]||{}),...(previewStudents?{preview:true,preview_students:previewStudents}:{})});
  }
  const user=await identity();await admin(user);const s=await school();
  if(request.method==='GET'&&query.get('view')==='access'){
   const accounts=await db(accountPath+'&select=student_id,username,guardian_fingerprint,activated_at');const students=[];
   for(const student of s.students){const a=accounts.find(x=>x.student_id===student.id),valid=a&&a.guardian_fingerprint===await guardianFingerprint(student);students.push({id:student.id,name:student.name,photo:student.photo||'',guardian:student.guardian||'',phone:normalizePhone(student.phone),access:a?{username:a.username,status:valid?(a.activated_at?'active':'ready'):'stale'}:null})}
   return json(200,{ok:true,students});
  }
  if(request.method!=='POST'||!['create','share','reset'].includes(body.action))fail(400,'Operação inválida.');
  const student=s.students.find(x=>x.id===body.student_id);if(!student)fail(404,'Aluno não encontrado nesta escola.');
  const phone=normalizePhone(student.phone);if(!phone||!String(student.guardian||'').trim())fail(400,'Cadastre o nome e o WhatsApp do responsável no aluno antes de criar ou enviar o acesso.');
  const rows=await db(accountPath+'&student_id=eq.'+encodeURIComponent(student.id)+'&select=*'),existing=rows[0];
  if(body.action==='share'){
   if(!existing)fail(404,'Crie primeiro o acesso do responsável.');if(await guardianFingerprint(student)!==existing.guardian_fingerprint)fail(409,'O responsável foi alterado. Recrie o acesso para o contato atual.');
   const password=existing.onboarding_secret?await unseal(existing.onboarding_secret,passwordKey,aad(existing)):null;
   return json(200,{ok:true,phone,username:existing.username,password,school:client.name,student:student.name,guardian:student.guardian,introduction:String(s.familyWelcome||'').slice(0,1200),login_url:'/family.html?slug='+encodeURIComponent(slug)});
  }
  if(body.action==='create'&&existing)fail(409,'Este aluno já possui acesso. Use Enviar acesso.');
  if(body.action==='reset'&&(!existing||body.confirm!==true))fail(400,'Confirme a recriação do acesso existente.');
  const username='fam-'+random(9).toLowerCase(),password=random(18),email=username+'@bolt-family.invalid';
  const created=await fetch(url+'/auth/v1/admin/users',{method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true,user_metadata:{full_name:String(student.guardian).slice(0,120)}})});if(!created.ok)fail(503,'Não foi possível criar o acesso. Tente novamente.');const auth=await created.json(),uid=auth.id||auth.user?.id;if(!uid)fail(503,'Não foi possível confirmar a criação do acesso.');
  const row={client_id:client.id,student_id:student.id,user_id:uid,username,auth_email:email,guardian_fingerprint:await guardianFingerprint(student),activated_at:null,created_at:new Date().toISOString(),version:existing?existing.version+1:1};row.onboarding_secret=await seal(password,passwordKey,aad(row));
  // Compare-and-set on replacement. A stale tab cannot replace a newer guardian account.
  const target=existing?accountPath+'&id=eq.'+existing.id+'&version=eq.'+existing.version:'bolt_family_accounts';
  const saved=await fetch(url+'/rest/v1/'+target,{method:existing?'PATCH':'POST',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(row)});
  if(!saved.ok){if(saved.status===409)await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(uid),{method:'DELETE',headers});fail(saved.status===409?409:503,'Não foi possível confirmar o acesso. Atualize a lista antes de tentar novamente.');}
  const result=await saved.json();if(result.length!==1){await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(uid),{method:'DELETE',headers});fail(409,'O acesso foi atualizado em outra sessão. Atualize a lista.');}
  return json(201,{ok:true,username,status:'ready'});
 }catch(error){return json(error.status||503,{error:error.status?error.message:'Não foi possível concluir a solicitação. Tente novamente.'})}
}
