export async function onRequest({request,env={}}){
 const q=new URL(request.url).searchParams,p=q.get('product'),s=q.get('surface'),slug=q.get('slug')||'';
 const names={master:'BOLT Master',buy:'BOLT Buy',class:'BOLT Class',church:'BOLT Church'};
 if(!({master:['master'],buy:['admin','consumer'],class:['admin','family'],church:['admin','member']}[p]||[]).includes(s)||p!=='master'&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>80)return new Response('Invalid app',{status:400});
 let start='/index.html';
 if(p==='buy')start='/Salgaditos/'+(s==='consumer'?'cliente':'admin')+'.html?tenant='+encodeURIComponent(slug);
 if(p==='class')start=(s==='family'?'/family.html':'/Boltclass/index.html')+'?slug='+encodeURIComponent(slug);
 if(p==='church')start=(s==='member'?'/member.html?slug=':'/Boltchurch/index.html?slug=')+encodeURIComponent(slug);
 const labels={admin:'Administração',family:'Portal da família',member:'Portal do membro',consumer:'Loja',master:'Administração'};
 const body={id:'/bolt-app/'+p+'/'+s+'/'+(slug||'master'),name:names[p]+' · '+labels[s],short_name:names[p],lang:'pt-BR',start_url:start,scope:'/',display:'standalone',display_override:['standalone','minimal-ui'],background_color:'#0b1020',theme_color:'#0b1020',description:labels[s]+' · '+names[p],icons:[192,512].map(size=>({src:'/assets/apps/'+p+'-'+size+'.png',sizes:size+'x'+size,type:'image/png',purpose:'any'}))};
 if(s==='family'&&env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY){
  try{
   const base=env.SUPABASE_URL.replace(/\/$/,'');
   const key=env.SUPABASE_SERVICE_ROLE_KEY,headers={apikey:key,authorization:'Bearer '+key};
   const read=async path=>{const r=await fetch(base+'/rest/v1/'+path,{headers});if(!r.ok)throw Error('App name unavailable');return r.json()};
   const [client]=await read('bolt_commercial_clients?product=eq.class&slug=eq.'+encodeURIComponent(slug)+'&select=id,name,status');
   if(client&&client.status!=='paused'){
    const rows=await read('bolt_commercial_workspaces?client_id=eq.'+encodeURIComponent(client.id)+'&select=app_name:payload->schools->0->>familyAppName');
    const name=String(rows[0]?.app_name||client.name).trim().replace(/\s+/g,' ').slice(0,40);
    if(name){body.name=name;body.short_name=name;body.description='Portal da Família · '+client.name}
   }
  }catch{}
 }
 if(s==='family')body.icons=[{src:'/api/family-icon?slug='+encodeURIComponent(slug)+'&v=2',sizes:'512x512',purpose:'any'}];
 return new Response(JSON.stringify(body),{headers:{'content-type':'application/manifest+json','cache-control':'no-store'}});
}
