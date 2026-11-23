import test from 'node:test';
import assert from 'node:assert/strict';
import {createPushKeys,encode,sendPush} from '../server/school-push.js';
async function fixture(){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return {endpoint:'https://web.push.apple.com/private-endpoint',keys:{p256dh:encode(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:encode(crypto.getRandomValues(new Uint8Array(16)))}};}
test('Transport failures identify the network stage without leaking credentials or endpoint',async()=>{
 const subscription=await fixture(),secret='a-secret-never-printed',config=await createPushKeys(secret,'client','test@example.test'),old=fetch;
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch '+subscription.endpoint+' '+secret+' '+config.privateKey);};
 try{const result=await sendPush(subscription,config,secret,'client',{title:'test'});assert.equal(result.status,0);assert.equal(result.reason,'network_TypeError');assert(!result.detail.includes(secret));assert(!result.detail.includes(subscription.endpoint));assert(!result.detail.includes(config.privateKey));}
 finally{globalThis.fetch=old;}
});
test('Key decryption failures are distinguished from transport failures',async()=>{
 const subscription=await fixture(),config=await createPushKeys('original','client','test@example.test');
 const result=await sendPush(subscription,config,'different','client',{title:'test'});
 assert.equal(result.status,0);assert.match(result.reason,/^decrypt_key_/);
});

test('Push uses the Workers-compatible manual redirect mode and rejects redirects without following them',async()=>{
 const subscription=await fixture(),secret='test-secret',config=await createPushKeys(secret,'client','test@example.test'),old=fetch;
 let calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(options.redirect,'manual');
  if(!['follow','manual'].includes(options.redirect))throw new TypeError('Invalid redirect value');
  return new Response(null,{status:302,headers:{Location:'https://untrusted.example/collect'}});
 };
 try{const result=await sendPush(subscription,config,secret,'client',{title:'test'});assert.equal(result.status,302);assert.equal(result.reason,'RedirectBlocked');assert.equal(calls,1);}
 finally{globalThis.fetch=old;}
});
