import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function worker(){
 const events={},notices=[],opened=[];
 const self={location:{origin:'https://bolt.test'},addEventListener:(name,fn)=>events[name]=fn,registration:{showNotification:async(title,options)=>notices.push({title,...options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(readFileSync('SITE/sw.js','utf8'),{self,URL});
 return {notices,opened,async push(data){let pending;events.push({data:{json:()=>data},waitUntil:p=>pending=p});await pending;},async click(url){let pending;events.notificationclick({notification:{data:{url},close(){}},waitUntil:p=>pending=p});await pending;}};
}
test('Delivery pushes display their title and open only the correct store route',async()=>{
 const h=worker();const url='https://bolt.test/Salgaditos/cliente?tenant=loja-a#orders';
 await h.push({product:'buy',title:'Loja A',body:'Seu pedido está em preparo.',url,tag:'order-1'});
 assert.equal(h.notices[0].title,'Loja A');assert.equal(h.notices[0].body,'Seu pedido está em preparo.');assert.equal(h.notices[0].data.url,url);
 await h.click(url);assert.equal(h.opened[0],url);
 await h.click('https://evil.test/Salgaditos/admin?tenant=loja-a');await h.click('https://bolt.test/index.html');assert.equal(h.opened.length,1);
});
test('School notifications keep their existing generic privacy-safe wording and route',async()=>{
 const h=worker();await h.push({title:'Sensitive title',body:'Sensitive data',url:'/family.html?slug=school'});
 assert.equal(h.notices[0].title,'Novidades da escola');assert(!h.notices[0].body.includes('Sensitive'));
 await h.click(h.notices[0].data.url);assert.equal(h.opened[0],'https://bolt.test/family.html?slug=school');
});
test('Malformed push URLs cannot crash notification delivery or open an external origin',async()=>{
 const h=worker();await h.push({product:'buy',url:'http://['});assert.equal(h.notices.length,1);
 await h.click('http://[');assert.equal(h.opened.length,0);
});
