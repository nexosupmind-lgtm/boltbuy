export async function onRequest({request,env}){
 const url=new URL(request.url),slug=url.searchParams.get('slug')||'';
 const fallback=(reason='unavailable')=>new Response(null,{status:302,headers:{location:new URL('/assets/apps/class-192.png',url).href,'cache-control':'no-store','x-bolt-icon-status':reason}});
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>80)return fallback();
 try{
  const base=new URL(env.SUPABASE_URL),key=env.SUPABASE_SERVICE_ROLE_KEY;
  const headers={apikey:key,authorization:'Bearer '+key};
  const read=async path=>{
   const response=await fetch(new URL('/rest/v1/'+path,base),{headers});
   if(!response.ok)throw Error('database-'+response.status);
   return response.json();
  };
  const [client]=await read('bolt_commercial_clients?product=eq.class&slug=eq.'+slug+'&select=id,status');
  if(!client||client.status==='paused')return fallback('school-unavailable');
  const [brand]=await read('bolt_client_branding?client_id=eq.'+encodeURIComponent(client.id)+'&select=logo_url,primary_color');
  const [settings]=await read('bolt_client_studio_settings?client_id=eq.'+encodeURIComponent(client.id)+'&select=features');
  const custom=settings?.features?.family_icon_url;
  if(custom){
   const source=new URL(custom);
   const prefix='/storage/v1/object/public/bolt-branding/'+encodeURIComponent(client.id)+'/family-icon-';
   if(source.origin===base.origin&&source.pathname.startsWith(prefix)&&/^[-a-f0-9]+\.png$/.test(source.pathname.slice(prefix.length))){
    const image=await fetch(source,{redirect:'error'});
    if(image.ok&&image.headers.get('content-type')==='image/png'){
     return new Response(image.body,{headers:{'content-type':'image/png','cache-control':'no-store','x-content-type-options':'nosniff'}});
    }
   }
  }
  const color=/^#[0-9a-f]{6}$/i.test(brand?.primary_color)?brand.primary_color:'#475569';
  let logo=brand?.logo_url||'';
  if(!logo.startsWith('data:')){
   const source=new URL(logo);
   if(source.origin!==base.origin||!source.pathname.startsWith('/storage/v1/object/public/'))return fallback();
   const image=await fetch(source,{redirect:'error'});
   const type=image.headers.get('content-type');
   if(!image.ok||!/^image\/(png|jpeg|webp)$/.test(type||''))return fallback();
   const bytes=new Uint8Array(await image.arrayBuffer());
   if(bytes.length>350000)return fallback();
   let binary='';
   for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   logo='data:'+type+';base64,'+btoa(binary);
  }
  if(logo.length>470000||!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(logo))return fallback();
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="${color}"/><image href="${logo}" x="76" y="76" width="360" height="360"/></svg>`,{headers:{'content-type':'image/svg+xml','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch(error){const message=String(error.message||'');return fallback(/^database-[0-9]{3}$/.test(message)?message:message.includes('URL')?'invalid-image-url':'image-unavailable')}
}
