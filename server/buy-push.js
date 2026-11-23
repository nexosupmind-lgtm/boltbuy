import { seal, unseal } from './family.js';
import { createPushKeys, validSubscription, sendPush } from './school-push.js';

// Existing RLS-protected event storage; subscriptions and VAPID material are encrypted.
// No notification body contains addresses, phone numbers or payment information.
export async function pushId(value) {
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
const statuses = {recebido:'Pedido recebido pela loja.',confirmado:'Seu pedido foi confirmado!',preparo:'Seu pedido está sendo preparado.',pronto:'Seu pedido está pronto para retirada.',entrega:'Seu pedido saiu para entrega!',entregue:'Seu pedido foi entregue.',concluido:'Seu pedido foi concluído.',cancelado:'Seu pedido foi cancelado. Consulte a loja.'};
export function buyPush({db, secret, tenant, slug, origin, member, actor, fail, waitUntil}) {
  const eventPath = (id,type) => `bolt_audit_events?id=eq.${id}&event_type=eq.${type}`;
  const tenantPath = type => `bolt_audit_events?tenant_id=eq.${tenant.id}&event_type=eq.${type}`;
  async function keys(create = false) {
    // One key per origin: a browser's root service worker has one push subscription.
    const id=await pushId('buy-push-v1:'+origin),aad='buy-push-config:'+id;
    let row=(await db(eventPath(id,'buy_push_key')+'&select=details'))[0];
    if(!row&&create){
      const config=await createPushKeys(secret,id,'unused@example.invalid');
      config.contact=origin;
      try{await db('bolt_audit_events',{method:'POST',body:JSON.stringify({id,event_type:'buy_push_key',details:{sealed:await seal(JSON.stringify(config),secret,aad)}})});}
      catch(e){if(e.status!==409)throw e;}
      row=(await db(eventPath(id,'buy_push_key')+'&select=details'))[0];
    }
    return row?{id,...JSON.parse(await unseal(row.details.sealed,secret,aad))}:null;
  }
  async function authorize(body) {
    if(body.audience==='admin') {await member('orders');return {audience:'admin',userId:actor().id};}
    if(body.audience!=='customer')fail(400,'Destinatário inválido.');
    let token;
    try{token=JSON.parse(await unseal(body.token||'',secret,'buy-receipt'));}catch{fail(403,'Comprovante do pedido inválido.');}
    if(token.tenant!==tenant.id||!Number.isFinite(token.expires)||token.expires<Date.now()||!/^[0-9a-f-]{36}$/i.test(token.id||''))fail(403,'Comprovante do pedido expirado ou de outra loja.');
    const rows=await db(`bolt_orders?id=eq.${token.id}&tenant_id=eq.${tenant.id}&select=id,status`);
    if(!rows.length||rows[0].status==='criando')fail(404,'Pedido não encontrado.');
    return {audience:'customer',orderId:token.id,expires:Math.min(token.expires,Date.now()+30*86400000)};
  }
  async function action(name,body) {
    if(name==='push-key')return {ok:true,publicKey:(await keys(true)).publicKey};
    if(name==='push-status') {
      await member('orders');
      const subscriptions=await db(tenantPath('buy_push_subscription')+'&select=id,details');
      let devices=0,thisDevice=false;
      for(const row of subscriptions){try{
        const item=JSON.parse(await unseal(row.details.sealed,secret,'buy-push-sub:'+tenant.id+':'+row.id));
        if(item.audience==='admin'&&item.userId===actor().id&&item.expires>Date.now()){
          devices++;if(body.endpoint===item.subscription.endpoint)thisDevice=true;
        }
      }catch{}}
      const attempts=await db(tenantPath('buy_push_delivery')+'&select=details,created_at&order=created_at.desc&limit=1');
      const last=attempts[0];
      return {ok:true,devices,thisDevice,last:last?{at:last.created_at,state:last.details.state,accepted:last.details.accepted||0,failed:last.details.failed||0,expired:last.details.expired||0,reasons:last.details.reasons||{}}:null};
    }
    const owner=await authorize(body);
    if(!validSubscription(body.subscription))fail(400,'Este navegador não forneceu uma inscrição válida.');
    const id=await pushId(['buy-push-sub',tenant.id,owner.audience,owner.userId||owner.orderId,body.subscription.endpoint].join('|'));
    const path=eventPath(id,'buy_push_subscription')+'&tenant_id=eq.'+tenant.id;
    if(name==='push-test') {
      if(owner.audience!=='admin')fail(403,'Teste disponível no administrativo.');
      const row=(await db(path+'&select=details'))[0];
      let saved;
      try{saved=JSON.parse(await unseal(row?.details?.sealed||'',secret,'buy-push-sub:'+tenant.id+':'+id));}catch{fail(409,'Este aparelho ainda não está inscrito. Toque em Ativar notificações.');}
      if(saved.expires<Date.now())fail(409,'Inscrição expirada. Ative novamente.');
      const testId=await pushId('buy-push-test|'+id+'|'+Math.floor(Date.now()/30000));
      try{await db('bolt_audit_events',{method:'POST',body:JSON.stringify({id:testId,tenant_id:tenant.id,event_type:'buy_push_test',details:{state:'sending'}})});}catch(e){if(e.status===409)fail(429,'Aguarde 30 segundos antes de testar novamente.');throw e;}
      const config=await keys();if(!config)fail(503,'Configuração de avisos indisponível.');
      let result;
      try{result=await sendPush(saved.subscription,config,secret,config.id,{product:'buy',title:'Teste · '+tenant.name,body:'Os avisos deste administrativo estão chegando neste aparelho.',tag:'buy-test-'+id,url:origin+'/Salgaditos/admin?tenant='+encodeURIComponent(slug)});}catch{result={status:0,reason:'TransportError'};}
      await db(eventPath(testId,'buy_push_test')+'&tenant_id=eq.'+tenant.id,{method:'PATCH',body:JSON.stringify({details:{state:result.status>=200&&result.status<300?'accepted':'failed',status:result.status,reason:result.reason||'',detail:result.detail||''}})});
      if(result.status>=200&&result.status<300)return {ok:true,accepted:true,message:'O serviço push aceitou o teste. Confira a Central de Notificações; isso ainda não confirma a entrega no aparelho.'};
      if([404,410].includes(result.status))fail(409,'O serviço push informou que esta inscrição expirou. Desative e ative novamente.');
      if(!result.status)fail(502,'Falha antes do envio: '+(result.reason||'UnknownError')+(result.detail?' · '+result.detail:'')+'.');
      fail(502,'O serviço push recusou o teste: '+(result.reason||('HTTP '+result.status))+'.');
    }
    if(name==='push-unsubscribe'){
      await db(path,{method:'DELETE'});
      return {ok:true};
    }
    const key=await keys(true);
    if(body.publicKey!==key.publicKey)fail(409,'A configuração de notificações mudou. Ative novamente.');
    const payload={...owner,subscription:{endpoint:body.subscription.endpoint,keys:{p256dh:body.subscription.keys.p256dh,auth:body.subscription.keys.auth}},expires:owner.expires||Date.now()+180*86400000};
    const details={sealed:await seal(JSON.stringify(payload),secret,'buy-push-sub:'+tenant.id+':'+id)};
    const old=await db(path+'&select=id');
    if(old.length)await db(path,{method:'PATCH',body:JSON.stringify({details})});
    else try{await db('bolt_audit_events',{method:'POST',body:JSON.stringify({id,tenant_id:tenant.id,event_type:'buy_push_subscription',details})});}
    catch(e){if(e.status!==409)throw e;await db(path,{method:'PATCH',body:JSON.stringify({details})});}
    return {ok:true};
  }
  async function deliver(order,isNew) {
    const config=await keys();if(!config)return;
    const type=isNew?'new':order.status;
    const deliveryId=await pushId('buy-push-event|'+tenant.id+'|'+order.id+'|'+type);
    // Unique event claim prevents duplicate pushes on repeated requests/status saves.
    try{await db('bolt_audit_events',{method:'POST',body:JSON.stringify({id:deliveryId,tenant_id:tenant.id,event_type:'buy_push_delivery',details:{orderId:order.id,event:type,state:'sending'}})});}
    catch(e){if(e.status===409)return;throw e;}
    let accepted=0,failed=0,expired=0;const reasons={};
    try{
      const memberships=isNew?await db('bolt_memberships?tenant_id=eq.'+tenant.id+'&select=user_id,role'):[];
      const masters=isNew?await db('bolt_master_admins?select=user_id'):[];
      for(let offset=0;;offset+=500){
        const rows=await db(tenantPath('buy_push_subscription')+'&select=id,details&order=id&limit=500&offset='+offset);
        const targets=[];
        for(const row of rows){
          let item;try{item=JSON.parse(await unseal(row.details.sealed,secret,'buy-push-sub:'+tenant.id+':'+row.id));}catch{continue;}
          if(item.expires<Date.now())continue;
          if(isNew){if(item.audience!=='admin'||!masters.some(x=>x.user_id===item.userId)&&!memberships.some(x=>x.user_id===item.userId&&['owner','manager','staff'].includes(x.role)))continue;}
          else if(item.audience!=='customer'||item.orderId!==order.id)continue;
          targets.push({row,item});
        }
        // The same device can have more than one authorized administrator.
        const unique=[...new Map(targets.map(t=>[t.item.subscription.endpoint,t])).values()];
        for(let i=0;i<unique.length;i+=8)await Promise.all(unique.slice(i,i+8).map(async({row,item})=>{
          try{
            const result=await sendPush(item.subscription,config,secret,config.id,{product:'buy',title:isNew?'Novo pedido · '+tenant.name:tenant.name,body:isNew?'Você recebeu um novo pedido. Abra o administrativo para conferir.':statuses[order.status]||'Seu pedido foi atualizado.',tag:'buy-'+order.id+'-'+type,url:origin+'/Salgaditos/'+(isNew?'admin':'cliente')+'?tenant='+encodeURIComponent(slug)+'#orders'});
            if(result.status>=200&&result.status<300)accepted++;
            else if([404,410].includes(result.status)){
              expired++;await db(eventPath(row.id,'buy_push_subscription')+'&tenant_id=eq.'+tenant.id,{method:'PATCH',body:JSON.stringify({details:{expired:true}})});
            }else {failed++;const reason=result.reason||("HTTP_"+result.status);reasons[reason]=(reasons[reason]||0)+1;}
          }catch{failed++;reasons.TransportError=(reasons.TransportError||0)+1;}
        }));
        if(rows.length<500)break;
      }
      await db(eventPath(deliveryId,'buy_push_delivery')+'&tenant_id=eq.'+tenant.id,{method:'PATCH',body:JSON.stringify({details:{orderId:order.id,event:type,state:failed?'partial':accepted?'done':'no_recipients',accepted,failed,expired,reasons}})});
    }catch{
      await db(eventPath(deliveryId,'buy_push_delivery')+'&tenant_id=eq.'+tenant.id,{method:'PATCH',body:JSON.stringify({details:{orderId:order.id,event:type,state:'failed',accepted,failed:failed+1,expired}})}).catch(()=>{});
    }
  }
  function notify(order,isNew){
    const task=deliver(order,isNew).catch(()=>{});
    if(waitUntil){waitUntil(task);return Promise.resolve();}
    return task;
  }
  return {action,notify};
}
