export async function onRequest({request,env={}}){
 const url=new URL(request.url),slug=url.searchParams.get('slug')||'',surface=url.searchParams.get('surface');
 const fallback=()=>new Response(null,{status:302,headers:{location:'/assets/apps/buy-512.png','cache-control':'no-store'}});
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>80||!['admin','consumer'].includes(surface))return new Response('Invalid app',{status:400});
 try{
  const base=env.SUPABASE_URL.replace(/\/$/,''),key=env.SUPABASE_SERVICE_ROLE_KEY;
  const read=async path=>{const r=await fetch(base+'/rest/v1/'+path,{headers:{apikey:key,authorization:'Bearer '+key}});if(!r.ok)throw Error('Unavailable');return r.json()};
  const [tenant]=await read('bolt_tenants?slug=eq.'+encodeURIComponent(slug)+'&select=id');if(!tenant)return fallback();
  const [row]=await read('bolt_delivery_storefronts?tenant_id=eq.'+encodeURIComponent(tenant.id)+'&select=settings');
  const data=row?.settings?.commerce?.[surface==='admin'?'adminIcon':'shopIcon'];
  if(typeof data!=='string'||data.length>42000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))return fallback();
  const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));
  return new Response(bytes,{headers:{'content-type':'image/jpeg','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch{return fallback()}
}
