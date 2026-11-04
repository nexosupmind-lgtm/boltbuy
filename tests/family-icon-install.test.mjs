import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequest as manifest} from '../SITE/functions/api/app-manifest.js';
import {onRequest as icon} from '../SITE/functions/api/family-icon.js';

test('Family install exposes only the school icon, with no BOLT Class candidate',async()=>{
 const response=manifest({request:new Request('https://bolt.test/api/app-manifest?product=class&surface=family&slug=escola-a')});
 const body=await response.json();
 assert.equal(body.icons.length,1);
 assert.equal(body.icons[0].src,'/api/family-icon?slug=escola-a&v=2');
 assert.equal(body.start_url,'/family.html?slug=escola-a');
});

test('Saved school PNG is delivered directly to the installer without a stale cache',async()=>{
 const original=globalThis.fetch;
 const logo='https://project.supabase.co/storage/v1/object/public/bolt-branding/school-id/family-icon-ab12.png';
 const calls=[];
 globalThis.fetch=async input=>{
  assert.equal(typeof input,'string','Worker fetch receives a URL string');const url=input;calls.push(url);
  if(url.includes('/rest/v1/bolt_commercial_clients?'))return Response.json([{id:'school-id',status:'active'}]);
  if(url.includes('/rest/v1/bolt_client_branding?'))return Response.json([{primary_color:'#ff0000'}]);
  if(url.includes('/rest/v1/bolt_client_studio_settings?'))return Response.json([{features:{family_icon_url:logo}}]);
  if(url===logo)return new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}});
  throw Error('Unexpected request');
 };
 try{
  const result=await icon({request:new Request('https://bolt.test/api/family-icon?slug=escola-a&v=2'),env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test'}});
  assert.equal(result.status,200);
  assert.equal(result.headers.get('content-type'),'image/png');
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[137,80,78,71]);
  assert(calls.includes(logo));
 }finally{globalThis.fetch=original}
});

test('iPhone icon is linked before external scripts and shell does not replace it with a data URL',()=>{
 const page=readFileSync('SITE/family.html','utf8');
 assert(page.indexOf("icon.rel='apple-touch-icon'")<page.indexOf('supabase-js'));
 assert(page.includes("icon.href='/api/family-icon?slug='"));
 assert(!readFileSync('SITE/bolt-shell.js','utf8').includes('canvas.toDataURL'));
});
