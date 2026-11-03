export function onRequest({request}){
 const q=new URL(request.url).searchParams,p=q.get('product'),s=q.get('surface'),slug=q.get('slug')||'';
 const names={master:'BOLT Master',buy:'BOLT Buy',class:'BOLT Class',church:'BOLT Church'};
 if(!({master:['master'],buy:['admin','consumer'],class:['admin','family'],church:['admin','member']}[p]||[]).includes(s)||p!=='master'&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>80)return new Response('Invalid app',{status:400});
 let start='/index.html';
 if(p==='buy')start='/Salgaditos/'+(s==='consumer'?'cliente':'admin')+'.html?tenant='+encodeURIComponent(slug);
 if(p==='class')start=(s==='family'?'/family.html':'/Boltclass/index.html')+'?slug='+encodeURIComponent(slug);
 if(p==='church')start=(s==='member'?'/member.html?slug=':'/Boltchurch/index.html?slug=')+encodeURIComponent(slug);
 const labels={admin:'Administração',family:'Portal da família',member:'Portal do membro',consumer:'Loja',master:'Administração'};
 const body={id:'/bolt-app/'+p+'/'+s+'/'+(slug||'master'),name:names[p]+' · '+labels[s],short_name:names[p],lang:'pt-BR',start_url:start,scope:'/',display:'standalone',display_override:['standalone','minimal-ui'],background_color:'#0b1020',theme_color:'#0b1020',description:labels[s]+' · '+names[p],icons:[192,512].map(size=>({src:'/assets/apps/'+p+'-'+size+'.png',sizes:size+'x'+size,type:'image/png',purpose:'any'}))};
 return new Response(JSON.stringify(body),{headers:{'content-type':'application/manifest+json','cache-control':'no-store'}});
}
