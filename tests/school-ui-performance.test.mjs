import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
test('Student search updates the filter without rebuilding the school page or losing focus',()=>{
 const source=readFileSync('SITE/Boltclass/index.html','utf8');
 const handler=source.split('\n').find(line=>line.includes("id!=='studentSearch'"));
 const ctx={filter:'',document:{addEventListener(name,fn){this.handler=fn}}};
 vm.runInNewContext(handler,ctx);
 ctx.document.handler({target:{id:'studentSearch',value:'Aluno 120'}});
 assert.equal(ctx.filter,'Aluno 120');
 ctx.document.handler({target:{id:'other',value:'ignored'}});
 assert.equal(ctx.filter,'Aluno 120');
});
test('School visual observer ignores text updates and disconnects during its own scan',()=>{
 const frames=[],observers=[];
 const root={id:'root',querySelectorAll:()=>[],querySelector:()=>null};
 const ctx={WeakSet,MutationObserver:class{constructor(fn){this.callback=fn;this.disconnects=0;observers.push(this)}observe(){}disconnect(){this.disconnects++}},requestAnimationFrame:fn=>frames.push(fn),matchMedia:()=>({matches:true}),getComputedStyle:()=>({getPropertyValue:()=>''}),document:{getElementById:id=>id==='root'?root:null,body:{dataset:{},classList:{toggle(){}}},addEventListener(){}}};
 vm.runInNewContext(readFileSync('SITE/school-experience.js','utf8'),ctx);
 observers[0].callback([{addedNodes:[{nodeType:3}]}]);assert.equal(frames.length,0);
 observers[0].callback([{addedNodes:[{nodeType:1}]}]);observers[0].callback([{addedNodes:[{nodeType:1}]}]);assert.equal(frames.length,1);
 frames.shift()();assert.equal(observers[0].disconnects,1);
});
