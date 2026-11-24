import test from 'node:test';import assert from 'node:assert/strict';
import {onRequest as icon} from '../functions/api/buy-icon.js';
import {onRequest as manifest} from '../functions/api/app-manifest.js';
test('Buy manifests isolate admin and consumer app IDs and icon URLs',async()=>{
 const a=await (await manifest({request:new Request('https://bolt.test/api/app-manifest?product=buy&surface=admin&slug=store')})).json();
 const b=await (await manifest({request:new Request('https://bolt.test/api/app-manifest?product=buy&surface=consumer&slug=store')})).json();
 assert.notEqual(a.id,b.id);assert.match(a.icons[0].src,/surface=admin/);assert.match(b.icons[0].src,/surface=consumer/);
});
test('Icon endpoint serves only the selected tenant image and falls back safely',async()=>{
 const original=globalThis.fetch,env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test'};let selected;
 globalThis.fetch=async input=>{const url=String(input);if(url.includes('bolt_tenants')){assert.match(url,/slug=eq.store/);return Response.json([{id:'store-id'}]);}assert.match(url,/tenant_id=eq.store-id/);return Response.json([{settings:{commerce:{shopIcon:selected}}}]);};
 try{selected='data:image/jpeg;base64,/9j/2Q==';let r=await icon({request:new Request('https://bolt.test/api/buy-icon?slug=store&surface=consumer'),env});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.equal((await r.arrayBuffer()).byteLength,4);
 selected='https://evil.test/icon';r=await icon({request:new Request('https://bolt.test/api/buy-icon?slug=store&surface=consumer'),env});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/assets/apps/buy-512.png');
 }finally{globalThis.fetch=original;}
});
