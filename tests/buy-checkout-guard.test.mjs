import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../SITE/Salgaditos/'+name,import.meta.url),'utf8');
test('Fallback checkout refuses local-only confirmation',()=>{
 const s=read('cliente.js');const handler=s.slice(s.indexOf("el('checkout').onsubmit="),s.indexOf('\nfunction checkChanges'));
 let prevented=false,notice='';const form={};vm.runInNewContext(handler,{el:()=>form,notify:x=>notice=x});
 form.onsubmit({preventDefault(){prevented=true}});assert.ok(prevented);assert.match(notice,/conectar/);
 assert.ok(!read('loyalty-shop.js').includes('d.orders.push'));
});
test('Combo reset clears the edit ID before native reset and restores create mode',async()=>{
 const s=read('buy-commerce.js');const handler=s.slice(s.indexOf('form.addEventListener("reset"'),s.indexOf('  form.elements.mode.onchange'));
 let listener,hidden='edited',defaultValue='edited';const button={};
 const id={get value(){return hidden},set value(v){hidden=defaultValue=v}};
 const form={elements:{id},addEventListener(type,fn){listener=fn},querySelector(){return button}};
 vm.runInNewContext(handler,{form,message(){},queueMicrotask,syncPricing(){}});
 listener();hidden=defaultValue;assert.equal(id.value,'');assert.equal(button.textContent,'Salvar novo combo');
});
