import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../server/admin-access.js';

const actor='10000000-0000-4000-8000-000000000001';
const owner='10000000-0000-4000-8000-000000000002';
const client='10000000-0000-4000-8000-000000000003';
const env={SUPABASE_URL:'https://demo.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-test-key'};

test('Master edits the exclusive owner in place, with no password change if omitted',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  const path=new URL(url);
  if(path.pathname==='/auth/v1/user')return Response.json({id:actor});
  if(path.pathname.endsWith('/bolt_master_admins'))return Response.json(path.searchParams.get('user_id')==='eq.'+actor?[{user_id:actor}]:[]);
  if(path.pathname.endsWith('/bolt_commercial_clients'))return Response.json([{id:client}]);
  if(path.pathname.endsWith('/bolt_commercial_memberships'))return Response.json([{user_id:owner,client_id:client,role:'owner'}]);
  if(path.pathname==='/auth/v1/admin/users/'+owner){
   if(options.method==='PUT')calls.push(JSON.parse(options.body));
   return Response.json({id:owner,email:'old@example.com',user_metadata:{full_name:'Anterior',locale:'pt-BR'}});
  }
  return Response.json([]);
 });
 const url='https://bolt.test/api/admin-access?product=class&id='+client;
 const headers={authorization:'Bearer master'};
 const read=await onRequest({env,request:new Request(url,{headers})});
 assert.deepEqual(await read.json(),{id:owner,name:'Anterior',email:'old@example.com'});
 const save=await onRequest({env,request:new Request(url,{method:'PUT',headers,body:JSON.stringify({user_id:owner,name:'Novo',email:'new@example.com'})})});
 assert.equal(save.status,200);
 assert.deepEqual(calls,[{user_metadata:{full_name:'Novo',locale:'pt-BR'},email:'new@example.com',email_confirm:true}]);
});

test('Credential updates are blocked for a shared owner',async t=>{
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  assert.notEqual(options.method,'PUT');
  const path=new URL(url);
  if(path.pathname==='/auth/v1/user')return Response.json({id:actor});
  if(path.pathname.endsWith('/bolt_master_admins'))return Response.json(path.searchParams.get('user_id')==='eq.'+actor?[{user_id:actor}]:[]);
  if(path.pathname.endsWith('/bolt_commercial_clients'))return Response.json([{id:client}]);
  if(path.pathname.endsWith('/bolt_commercial_memberships'))return Response.json([{user_id:owner,client_id:client,role:'owner'}]);
  if(path.pathname.endsWith('/bolt_memberships'))return Response.json([{tenant_id:client,role:'staff'}]);
  if(path.pathname==='/auth/v1/admin/users/'+owner)return Response.json({id:owner,email:'old@example.com'});
  return Response.json([]);
 });
 const request=new Request('https://bolt.test/api/admin-access?product=class&id='+client,{method:'PUT',headers:{authorization:'Bearer master'},body:JSON.stringify({user_id:owner,name:'Novo',email:'new@example.com'})});
 assert.equal((await onRequest({request,env})).status,409);
});
