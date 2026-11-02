/* BOLT v17: upload autenticado; URL pública, escrita protegida por RLS */
window.boltUploadProductPhoto=async function(file){
 if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('Escolha JPG, PNG ou WebP.');
 if(file.size>5*1024*1024)throw Error('A foto deve ter até 5 MB.');
 const cfg=window.BOLT_CONFIG;
 if(!cfg?.supabaseUrl||!cfg?.supabaseAnonKey)throw Error('Supabase não configurado.');
 if(!window.supabase?.createClient)throw Error('Conexão Supabase não carregada. Atualize a página.');
 const sb=window.BOLT_SUPABASE||window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true}});
 const {data:{session},error:authError}=await sb.auth.getSession();
 if(authError||!session)throw Error('Sua sessão expirou. Saia e entre novamente no Admin.');
 const slug=new URLSearchParams(location.search).get('tenant')||'salgaditos';
 const {data:tenant,error:tenantError}=await sb.from('bolt_tenants').select('id').eq('slug',slug).single();
 if(tenantError||!tenant)throw Error('Empresa não encontrada no Supabase ou sem permissão. Confira o vínculo do usuário.');
 const {data:membership,error:membershipError}=await sb.from('bolt_memberships').select('tenant_id').eq('tenant_id',tenant.id).eq('user_id',session.user.id).maybeSingle();
 if(membershipError||!membership)throw Error('Usuário não autorizado a enviar fotos desta empresa.');
 const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
 const path=tenant.id+'/'+crypto.randomUUID()+'.'+ext;
 const {error:uploadError}=await sb.storage.from('bolt-product-images').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
 if(uploadError)throw Error('Falha no Storage: '+uploadError.message);
 const {data}=sb.storage.from('bolt-product-images').getPublicUrl(path);
 if(!data?.publicUrl)throw Error('Não foi possível obter a URL da foto.');
 return data.publicUrl;
};
