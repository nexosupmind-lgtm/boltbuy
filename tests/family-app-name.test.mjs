import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../SITE/functions/api/app-manifest.js';
const request=new Request('https://bolt.test/api/app-manifest?product=class&surface=family&slug=escola-a');
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'};
test('Installed family app name comes from the school workspace and preserves its route and icon',async()=>{
 const original=globalThis.fetch;
 const queries=[];
 globalThis.fetch=async url=>{
  queries.push(url);
  return Response.json(url.includes('bolt_commercial_clients?')?[{id:'school-a',name:'Escola A',status:'active'}]:[{app_name:'  Minha Escola Família  '}]);
 };
 try{
  const body=await(await onRequest({request,env})).json();
  assert.equal(body.name,'Minha Escola Família');
  assert.equal(body.short_name,body.name);
  assert.equal(body.start_url,'/family.html?slug=escola-a');
  assert.equal(body.icons[0].src,'/api/family-icon?slug=escola-a&v=2');
  assert(queries[1].endsWith('select=app_name:payload->schools->0->>familyAppName'));
  assert(!JSON.stringify(body).includes('secret'));
 }finally{globalThis.fetch=original}
});
test('Older school workspaces default to the school name',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>Response.json(url.includes('bolt_commercial_clients?')?[{id:'school-a',name:'Escola A',status:'active'}]:[{app_name:null}]);
 try{
  const body=await(await onRequest({request,env})).json();
  assert.equal(body.name,'Escola A');
  assert.equal(body.short_name,'Escola A');
 }finally{globalThis.fetch=original}
});
